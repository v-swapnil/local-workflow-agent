import { eq } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import type { SessionRecord } from '@shared/schema.js';
import { sessions } from '@main/db/schema';
import { getSetting, SETTING_KEYS } from '../settings';
import { createWorktree, removeWorktreeBySession, getWorktreeForSession } from '../worktrees';
import { getWorkspace } from './workspace';
import { getDb } from '@main/db';

export const createSession = async (workspaceId: number, title: string): Promise<SessionRecord> => {
  const now = Date.now();

  const result = getDb()
    .insert(sessions)
    .values({
      workspaceId,
      title,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  // Create worktree synchronously so it's ready before any task runs
  const useWt = await getSetting(SETTING_KEYS.USE_WORKTREES);
  if (useWt === '1') {
    try {
      await createWorktree(workspaceId, result.id);
    } catch (err) {
      console.warn('[store] worktree creation failed:', err);
    }
  }
  return result;
};

export const listSessions = (workspaceId?: number): SessionRecord[] => {
  const query = workspaceId
    ? getDb().select().from(sessions).where(eq(sessions.workspaceId, workspaceId))
    : getDb().select().from(sessions);
  return query.all().sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getSession = (id: number): SessionRecord => {
  const row = getDb().select().from(sessions).where(eq(sessions.id, id)).get();
  if (!row) throw new Error(`session not found: ${id}`);
  return row as SessionRecord;
};

export const renameSession = (id: number, title: string): void => {
  getDb().update(sessions).set({ title, updatedAt: Date.now() }).where(eq(sessions.id, id)).run();
};

export const deleteSession = (id: number): void => {
  // Remove worktree first (best-effort, async)
  removeWorktreeBySession(id).catch((err) => {
    console.warn('[store] worktree removal failed:', err);
  });
  // Child rows (tasks → messages/tool_calls/approvals/task_events, memories)
  // are removed by ON DELETE CASCADE foreign keys.
  getDb().delete(sessions).where(eq(sessions.id, id)).run();
};

// Resolve the workspace path a session runs against, preferring its worktree when present.
export const resolveSessionWorkspace = async (sessionId: number) => {
  const session = getSession(sessionId);
  const workspace = await getWorkspace(session.workspaceId);

  const worktree = getWorktreeForSession(sessionId);
  if (worktree && existsSync(worktree.path)) {
    return { workspaceId: workspace.id, workspacePath: worktree.path, hasWorktree: true };
  }

  return { workspaceId: workspace.id, workspacePath: workspace.path, hasWorktree: false };
};
