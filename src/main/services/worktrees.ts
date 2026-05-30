import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { simpleGit } from 'simple-git';
import { getDb } from '../db/index.js';
import { worktrees } from '../db/schema.js';
import { worktreesRoot } from '../util/paths.js';
import { getWorktreeRoot } from './git';
import { getWorkspace } from './workspaces';
import { logger } from './logger.js';
import type { WorktreeRecord } from '@shared/schema.js';

const log = logger.child({ mod: 'worktrees' });

export function worktreeDirForSession(workspaceId: string, sessionId: string): string {
  return join(worktreesRoot(), workspaceId, sessionId);
}

export async function createWorktree(
  workspaceId: string,
  sessionId: string,
): Promise<WorktreeRecord | null> {
  const ws = await getWorkspace(workspaceId);

  // Check if workspace is a git repo
  const repoRoot = await getWorktreeRoot(ws.path);
  if (!repoRoot) {
    log.info({ workspaceId }, 'workspace is not a git repo — skipping worktree creation');
    return null;
  }

  const worktreePath = worktreeDirForSession(workspaceId, sessionId);
  const branch = `ase/session/${sessionId}`;

  const g = simpleGit({
    baseDir: repoRoot,
    binary: 'git',
    maxConcurrentProcesses: 2,
    trimmed: true,
  });

  // Get current branch and HEAD commit
  const status = await g.status();
  const baseBranch = status.current ?? 'HEAD';
  let baseCommit: string;
  try {
    baseCommit = (await g.revparse(['HEAD'])).trim();
  } catch {
    // Repo might have no commits
    log.warn({ workspaceId }, 'could not resolve HEAD commit');
    return null;
  }

  try {
    await g.raw(['worktree', 'add', worktreePath, '-b', branch]);
    log.info({ workspaceId, sessionId, branch, worktreePath }, 'worktree created');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ workspaceId, sessionId, err: msg }, 'worktree add failed');
    return null;
  }

  const record: WorktreeRecord = {
    id: nanoid(10),
    workspaceId,
    sessionId,
    branch,
    path: worktreePath,
    baseBranch,
    baseCommit,
    status: 'active',
    createdAt: Date.now(),
  };

  getDb().insert(worktrees).values(record).run();
  return record;
}

export async function removeWorktree(worktreeId: string): Promise<void> {
  const record = getDb().select().from(worktrees).where(eq(worktrees.id, worktreeId)).get() as
    | WorktreeRecord
    | undefined;

  if (!record) {
    log.warn({ worktreeId }, 'worktree record not found');
    return;
  }

  if (existsSync(record.path)) {
    const ws = await getWorkspace(record.workspaceId);
    const repoRoot = await getWorktreeRoot(ws.path);
    if (repoRoot) {
      const g = simpleGit({
        baseDir: repoRoot,
        binary: 'git',
        maxConcurrentProcesses: 2,
        trimmed: true,
      });
      try {
        await g.raw(['worktree', 'remove', record.path, '--force']);
        log.info({ worktreeId, path: record.path }, 'worktree removed');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn({ worktreeId, err: msg }, 'git worktree remove failed — marking removed anyway');
      }
    }
  }

  getDb().update(worktrees).set({ status: 'removed' }).where(eq(worktrees.id, worktreeId)).run();
}

export async function removeWorktreeBySession(sessionId: string): Promise<void> {
  const record = getDb()
    .select()
    .from(worktrees)
    .where(and(eq(worktrees.sessionId, sessionId), eq(worktrees.status, 'active')))
    .get() as WorktreeRecord | undefined;

  if (!record) return;
  await removeWorktree(record.id);
}

export function getWorktreeForSession(sessionId: string): WorktreeRecord | null {
  const row = getDb()
    .select()
    .from(worktrees)
    .where(and(eq(worktrees.sessionId, sessionId), eq(worktrees.status, 'active')))
    .get();
  return (row as WorktreeRecord | undefined) ?? null;
}

export function listWorktrees(workspaceId: string): WorktreeRecord[] {
  return getDb()
    .select()
    .from(worktrees)
    .where(eq(worktrees.workspaceId, workspaceId))
    .all() as WorktreeRecord[];
}

export async function deleteWorktreeRecord(worktreeId: string): Promise<void> {
  await removeWorktree(worktreeId);
  getDb().delete(worktrees).where(eq(worktrees.id, worktreeId)).run();
}

export function getWorktree(worktreeId: string): WorktreeRecord | null {
  const row = getDb().select().from(worktrees).where(eq(worktrees.id, worktreeId)).get();
  return (row as WorktreeRecord | undefined) ?? null;
}

export function getWorktreeStatus(
  worktreeId: string,
): { exists: boolean; status: string; branch: string; path: string } | null {
  const record = getWorktree(worktreeId);
  if (!record) return null;
  return {
    exists: existsSync(record.path),
    status: record.status,
    branch: record.branch,
    path: record.path,
  };
}
