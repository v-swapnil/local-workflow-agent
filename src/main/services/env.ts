import { platform } from 'node:os';
import { resolveShell } from './shell';
import { getWorktreeRoot, workspaceStatus } from './git';
import { RunCtx } from '@main/orchestrator/runCtx';

export interface EnvironmentContext {
  directory: string; // working directory (workspace path)
  worktree: string; // git worktree root (or same as directory)
  isGitRepo: boolean;
  platform: string; // e.g. "darwin", "linux", "win32"
  shell: string | null;
  model: string;
  git: {
    branch: string | null;
    changedFiles: string[];
  };
}

export async function getEnvironmentContext(ctx: RunCtx): Promise<EnvironmentContext> {
  let isGitRepo = false;
  let worktree = ctx.workspacePath;
  let branch: string | null = null;
  let changedFiles: string[] = [];
  let shell = process.env.SHELL ?? null;

  try {
    const resolvedShell = await resolveShell();
    if (resolvedShell.shellPath) shell = resolvedShell.shellPath;

    const status = await workspaceStatus(ctx.workspaceId);
    isGitRepo = status.isRepo;
    if (isGitRepo) {
      const root = await getWorktreeRoot(ctx.workspacePath);
      if (root) worktree = root;
      branch = status.branch;
      changedFiles = [
        ...status.staged.map((f) => `staged: ${f}`),
        ...status.modified.map((f) => `modified: ${f}`),
        ...status.not_added.map((f) => `untracked: ${f}`),
      ];
    }
  } catch {
    // git info is best-effort; swallow errors
  }

  return {
    directory: ctx.workspacePath,
    worktree,
    isGitRepo,
    platform: platform(),
    shell,
    model: ctx.model,
    git: { branch, changedFiles },
  };
}
