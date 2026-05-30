import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { simpleGit, type SimpleGit, type StatusResultRenamed } from 'simple-git';
import { logger } from '../logger.js';

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

export function gitFor(cwd: string): SimpleGit {
  return simpleGit({ baseDir: cwd, binary: 'git', maxConcurrentProcesses: 2, trimmed: true });
}

export async function isRepo(cwd: string): Promise<boolean> {
  if (!existsSync(join(cwd, '.git'))) {
    try {
      return await gitFor(cwd).checkIsRepo();
    } catch {
      return false;
    }
  }
  return true;
}

export async function ensureRepo(cwd: string): Promise<SimpleGit> {
  const git = gitFor(cwd);
  if (!(await git.checkIsRepo())) {
    await git.init();
    log.info({ cwd }, 'initialised new git repo');
  }
  return git;
}

/** Return the git worktree root (rev-parse --show-toplevel), or null if not a repo. */
export async function getWorktreeRoot(cwd: string): Promise<string | null> {
  try {
    if (!(await isRepo(cwd))) return null;
    return (await gitFor(cwd).revparse(['--show-toplevel'])).trim() || null;
  } catch {
    return null;
  }
}
