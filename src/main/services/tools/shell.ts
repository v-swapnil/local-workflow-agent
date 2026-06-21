import { z } from 'zod';
import { isAbsolute, resolve } from 'node:path';
import { runShell } from '../shell/exec.js';
import { classifyCommand } from '../shell/safety.js';
import { requestApproval } from '../approvals.js';
import { logger } from '../logger.js';
import type { Tool } from './types.js';
import type { ShellResult } from '../shell/exec.js';

const DESCRIPTION = `Execute a shell command in the workspace directory.

## Command Guidelines
- Prefer pipelines over temp files: \`grep -r pattern src/ | head -20\` not redirect then read.
- Chain related commands: \`npm install && npm test\`.
- Quote variables and paths with spaces: \`"$var"\`, \`"path with spaces"\`.
- Use \`set -e\` prefix for multi-line scripts that should fail fast.

## Output
- stdout and stderr are combined in execution order.
- Output is truncated to 50KB (tail-preserved). If truncated, a temp file path with full output is provided.
- Use \`| head -n 50\` or \`| tail -n 50\` to limit output proactively.

## Git Safety
- NEVER use \`git push --force\` or \`git push -f\`.
- NEVER run \`git reset --hard\` on shared branches.
- NEVER amend published commits without explicit user request.
- Prefer \`git status\` and \`git diff\` (auto-approved) to check state before mutations.

## Security
- Read-only commands (ls, cat, grep, git status, etc.) run automatically.
- Other commands require user approval. Provide a clear \`description\` so the user understands the intent.
- Destructive commands (sudo, rm -rf /, eval) are blocked.

## Timeouts
- Default: 2 minutes. Max: 10 minutes.
- For long operations, set timeout appropriately.`;

const shellInputSchema = z.object({
  command: z
    .string()
    .min(1)
    .describe('The shell command to execute. Supports pipes, chaining (&&, ||), redirections.'),
  description: z
    .string()
    .min(1)
    .describe('5-10 word description of what this command does and why.'),
  timeout: z
    .number()
    .int()
    .min(1)
    .max(600)
    .optional()
    .describe('Timeout in seconds. Default 120 (2 min), max 600 (10 min).'),
  workdir: z
    .string()
    .optional()
    .describe('Working directory relative to workspace root. Must not escape workspace.'),
});

type ShellInput = z.infer<typeof shellInputSchema>;

export const runShellTool: Tool<ShellInput, ShellResult> = {
  name: 'run_shell',
  description: DESCRIPTION,
  schema: shellInputSchema,
  needsApproval: false,

  run: async (input, ctx) => {
    // 1. Resolve and validate working directory
    let cwd = ctx.workspacePath;
    if (input.workdir) {
      if (isAbsolute(input.workdir) || input.workdir.includes('..')) {
        throw new Error(
          'workdir must be a relative path within the workspace (no ".." or absolute paths)',
        );
      }
      cwd = resolve(ctx.workspacePath, input.workdir);
      if (!cwd.startsWith(ctx.workspacePath)) {
        throw new Error('workdir must not escape the workspace root');
      }
    }

    // 2. Classify command safety
    const classification = classifyCommand(input.command);

    // 3. Denied commands → reject immediately
    if (classification.tier === 'deny') {
      logger.warn(
        { command: input.command, reason: classification.denyReason },
        'shell command denied',
      );
      return {
        ok: false,
        exitCode: null,
        signal: null,
        output: `Command blocked: ${classification.denyReason}`,
        durationMs: 0,
        timedOut: false,
        killedByUser: false,
        truncated: false,
        fullOutputPath: null,
      };
    }

    // 4. Prompted commands → request approval (standard flow handles session allow-listing)
    if (classification.tier === 'prompt' && ctx.taskId) {
      const decision = await requestApproval(
        ctx.taskId,
        'run_shell',
        { command: input.command, description: input.description, workdir: input.workdir ?? '.' },
        ctx.signal,
      );
      if (decision === 'deny') {
        return {
          ok: false,
          exitCode: null,
          signal: null,
          output: 'Command denied by user',
          durationMs: 0,
          timedOut: false,
          killedByUser: false,
          truncated: false,
          fullOutputPath: null,
        };
      }
    }

    // 5. Execute
    return runShell({
      command: input.command,
      cwd,
      timeoutMs: input.timeout !== undefined ? input.timeout * 1000 : undefined,
      signal: ctx.signal,
      onLog: ctx.onLog,
    });
  },
};
