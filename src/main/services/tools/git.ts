import { z } from 'zod';
import type { Tool } from './types.js';
import { workspaceStatus, workspaceDiff, createBranch, commitAll } from '../git.js';

export const gitStatusTool: Tool<Record<string, never>, unknown> = {
  name: 'git_status',
  description: 'Get git working tree status (branch, staged, modified, untracked).',
  schema: z.object({}).strict(),
  needsApproval: false,
  run: async (_args, ctx) => workspaceStatus(ctx.workspaceId),
};

export const gitDiffTool: Tool<{ staged?: boolean }, unknown> = {
  name: 'git_diff',
  description: 'Return the unified diff of working tree (or staged) changes.',
  schema: z.object({ staged: z.boolean().optional() }),
  needsApproval: false,
  run: async ({ staged }, ctx) => workspaceDiff(ctx.workspaceId, !!staged),
};

export const gitBranchTool: Tool<{ name: string }, unknown> = {
  name: 'git_branch',
  description: 'Create and check out a new local branch.',
  schema: z.object({
    name: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z0-9._/\-]+$/),
  }),
  needsApproval: true,
  run: async ({ name }, ctx) => createBranch(ctx.workspaceId, name),
};

export const gitCommitTool: Tool<{ message: string }, unknown> = {
  name: 'git_commit',
  description: 'Stage all changes and commit with the given message.',
  schema: z.object({ message: z.string().min(1).max(500) }),
  needsApproval: true,
  run: async ({ message }, ctx) => commitAll(ctx.workspaceId, message),
};
