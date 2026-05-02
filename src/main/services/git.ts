import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { simpleGit, StatusResultRenamed, type SimpleGit, type StatusResult } from 'simple-git';
import { getWorkspace } from './workspaces.js';
import { logger } from './logger.js';

const log = logger.child({ mod: 'git' });

export interface GitFileStatus {
  path: string;
  index: string;
  working_dir: string;
  from?: string;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  staged: string[];
  not_added: string[];
  created: string[];
  modified: string[];
  renamed: StatusResultRenamed[];
  deleted: string[];
  conflicted: string[];
  files: GitFileStatus[];
  clean: boolean;
}

export interface GitDiff {
  isRepo: boolean;
  unifiedDiff: string;
  staged: boolean;
}

function gitFor(cwd: string): SimpleGit {
  return simpleGit({ baseDir: cwd, binary: 'git', maxConcurrentProcesses: 2, trimmed: true });
}

async function isRepo(cwd: string): Promise<boolean> {
  if (!existsSync(join(cwd, '.git'))) {
    // simpleGit().checkIsRepo() handles worktrees / parent-dir cases too.
    try {
      return await gitFor(cwd).checkIsRepo();
    } catch {
      return false;
    }
  }
  return true;
}

export async function ensureRepo(cwd: string): Promise<SimpleGit> {
  const g = gitFor(cwd);
  if (!(await g.checkIsRepo())) {
    await g.init();
    log.info({ cwd }, 'initialised new git repo');
  }
  return g;
}

export async function workspaceStatus(workspaceId: string): Promise<GitStatus> {
  const ws = await getWorkspace(workspaceId);
  if (!(await isRepo(ws.path))) {
    return {
      isRepo: false,
      branch: null,
      ahead: 0,
      behind: 0,
      staged: [],
      modified: [],
      not_added: [],
      created: [],
      renamed: [],
      deleted: [],
      conflicted: [],
      files: [],
      clean: true,
    };
  }
  const s: StatusResult = await gitFor(ws.path).status();
  return {
    isRepo: true,
    branch: s.current,
    ahead: s.ahead,
    behind: s.behind,
    staged: s.staged,
    created: s.created,
    renamed: s.renamed,
    modified: s.modified,
    not_added: s.not_added,
    deleted: s.deleted,
    conflicted: s.conflicted,
    files: s.files.map((f) => ({
      path: f.path,
      index: f.index,
      working_dir: f.working_dir,
      from: f.from,
    })),
    clean: s.isClean(),
  };
}

export async function workspaceDiff(workspaceId: string, staged = false): Promise<GitDiff> {
  const ws = await getWorkspace(workspaceId);
  if (!(await isRepo(ws.path))) {
    return { isRepo: false, unifiedDiff: '', staged };
  }
  const g = gitFor(ws.path);
  const args = staged ? ['--cached'] : [];
  // Include untracked files in working diff via no-index trick.
  const tracked = await g.diff(args);
  let untracked = '';
  if (!staged) {
    const status = await g.status();
    for (const file of status.not_added) {
      try {
        const out = await g.raw(['diff', '--no-index', '--', '/dev/null', file]);
        untracked += out;
      } catch (err) {
        // git diff --no-index returns exit 1 when files differ; simple-git treats as throw.
        const e = err as { git?: string; message?: string };
        if (e?.git) untracked += e.git;
      }
    }
  }
  return { isRepo: true, unifiedDiff: tracked + untracked, staged };
}

export async function showFileAtHead(
  workspaceId: string,
  filePath: string,
): Promise<string | null> {
  const ws = await getWorkspace(workspaceId);
  if (!(await isRepo(ws.path))) return null;

  const g = gitFor(ws.path);
  try {
    return await g.show([`HEAD:${filePath}`]);
    // return await g.raw(['show', '--no-patch', '--pretty=', `HEAD:${filePath}`]);
  } catch {
    // New/untracked files and paths absent in HEAD should return null.
    return null;
  }
}

export async function fileDiff(
  workspaceId: string,
  filePath: string,
  staged = false,
): Promise<string> {
  const ws = await getWorkspace(workspaceId);
  if (!(await isRepo(ws.path))) return '';

  const g = gitFor(ws.path);
  if (staged) {
    return g.diff(['--cached', '--', filePath]);
  }

  const status = await g.status();
  const f = status.files.find((entry) => entry.path === filePath);
  const isUntracked = f?.working_dir === '?' || status.not_added.includes(filePath);
  if (isUntracked) {
    try {
      return await g.raw(['diff', '--no-index', '--', '/dev/null', filePath]);
    } catch (err) {
      // Exit code 1 for differences is expected for --no-index.
      const e = err as { git?: string; message?: string };
      return e.git ?? e.message ?? '';
    }
  }

  return g.diff(['--', filePath]);
}

export async function createBranch(workspaceId: string, name: string): Promise<{ branch: string }> {
  const ws = await getWorkspace(workspaceId);
  const g = await ensureRepo(ws.path);
  // If repo has no commits, create an empty initial commit so checkout -b works.
  const log0 = await g.log().catch(() => null);
  if (!log0 || log0.total === 0) {
    await g.raw(['commit', '--allow-empty', '-m', 'ase: initial commit']);
  }
  await g.checkoutLocalBranch(name);
  return { branch: name };
}

export async function commitAll(
  workspaceId: string,
  message: string,
): Promise<{ committed: boolean; sha?: string; reason?: string }> {
  const ws = await getWorkspace(workspaceId);
  const g = await ensureRepo(ws.path);
  await g.add(['-A']);
  const status = await g.status();
  if (status.isClean()) {
    return { committed: false, reason: 'nothing to commit' };
  }
  const res = await g.commit(message);
  return { committed: true, sha: res.commit };
}

export async function currentBranch(workspaceId: string): Promise<string | null> {
  const ws = await getWorkspace(workspaceId);
  if (!(await isRepo(ws.path))) return null;
  const s = await gitFor(ws.path).status();
  return s.current;
}
