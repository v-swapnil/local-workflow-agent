import { z } from 'zod';
import { runSandboxed, type SandboxResult } from '../sandbox.js';
import type { Tool } from './types.js';

export const runShellTool: Tool<
  { cmd: string; args?: string[]; timeoutMs?: number },
  SandboxResult
> = {
  name: 'run_shell',
  description:
    'Run a shell command inside the workspace sandbox. Command must be in the allowlist.',
  schema: z.object({
    cmd: z.string().min(1),
    args: z.array(z.string()).optional(),
    timeoutMs: z.number().int().min(100).max(600_000).optional(),
  }),
  needsApproval: true,
  run: async ({ cmd, args, timeoutMs }, ctx) =>
    runSandboxed({
      cmd,
      args,
      cwd: ctx.workspacePath,
      timeoutMs,
      onLog: ctx.onLog,
      signal: ctx.signal,
    }),
};
