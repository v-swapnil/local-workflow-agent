import { z } from 'zod';
import { simpleGit } from 'simple-git';
import type { Tool } from './types.js';
import { ensureRepo } from '../git';

export const gitStatusTool: Tool<Record<string, never>, unknown> = {
  name: 'git_status',
  description:
    'Get git working tree status: current branch, ahead/behind counts, and lists of ' +
    'staged, modified, untracked, created, renamed, deleted, and conflicted files.\n\n' +
    'Returns isRepo=false when the workspace is not a git repository.',
  schema: z.object({}).strict(),
  needsApproval: false,
  run: async (_args, ctx) => {
    const g = simpleGit({ baseDir: ctx.workspacePath, binary: 'git', maxConcurrentProcesses: 2, trimmed: true });
    const isRepo = await g.checkIsRepo().catch(() => false);
    if (!isRepo) return { isRepo: false, branch: null, ahead: 0, behind: 0, staged: [], modified: [], not_added: [], created: [], renamed: [], deleted: [], conflicted: [], files: [], clean: true };
    const s = await g.status();
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
      files: s.files.map((f) => ({ path: f.path, index: f.index, working_dir: f.working_dir, from: f.from })),
      clean: s.isClean(),
    };
  },
};

export const gitDiffTool: Tool<{ staged?: boolean }, unknown> = {
  name: 'git_diff',
  description:
    'Return the unified diff of working tree changes (or staged changes when staged=true).\n\n' +
    'Untracked files are automatically included in the working tree diff. ' +
    'Use git_status first to understand what has changed.',
  schema: z.object({ staged: z.boolean().optional() }),
  needsApproval: false,
  run: async ({ staged }, ctx) => {
    const g = simpleGit({ baseDir: ctx.workspacePath, binary: 'git', maxConcurrentProcesses: 2, trimmed: true });
    const isRepo = await g.checkIsRepo().catch(() => false);
    if (!isRepo) return { isRepo: false, unifiedDiff: '', staged: !!staged };
    const args = staged ? ['--cached'] : [];
    const tracked = await g.diff(args);
    let untracked = '';
    if (!staged) {
      const status = await g.status();
      for (const file of status.not_added) {
        try {
          const out = await g.raw(['diff', '--no-index', '--', '/dev/null', file]);
          untracked += out;
        } catch (err) {
          const e = err as { git?: string; message?: string };
          if (e?.git) untracked += e.git;
        }
      }
    }
    return { isRepo: true, unifiedDiff: tracked + untracked, staged: !!staged };
  },
};

export const gitBranchTool: Tool<{ name: string }, unknown> = {
  name: 'git_branch',
  description:
    'Create and check out a new local branch.\n\n' +
    'Creates an initial empty commit if the repository has no commits yet. ' +
    'Branch names may contain letters, numbers, dots, underscores, hyphens, and forward slashes.',
  schema: z.object({
    name: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z0-9._/\-]+$/),
  }),
  needsApproval: true,
  run: async ({ name }, ctx) => {
    const g = await ensureRepo(ctx.workspacePath);
    const log0 = await g.log().catch(() => null);
    if (!log0 || log0.total === 0) {
      await g.raw(['commit', '--allow-empty', '-m', 'ase: initial commit']);
    }
    await g.checkoutLocalBranch(name);
    return { branch: name };
  },
};

export const gitCommitTool: Tool<{ message: string }, unknown> = {
  name: 'git_commit',
  description:
    'Stage all changes (git add -A) and create a commit with the given message.\n\n' +
    'Returns committed=false when there is nothing to commit.',
  schema: z.object({ message: z.string().min(1).max(500) }),
  needsApproval: true,
  run: async ({ message }, ctx) => {
    const g = await ensureRepo(ctx.workspacePath);
    await g.add(['-A']);
    const status = await g.status();
    if (status.isClean()) return { committed: false, reason: 'nothing to commit' };
    const res = await g.commit(message);
    return { committed: true, sha: res.commit };
  },
};
