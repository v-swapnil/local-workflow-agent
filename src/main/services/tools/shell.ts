import { z } from 'zod';
import { runShell } from '../shell/exec.js';
import { classifyCommand } from '../shell/safety.js';
import { requestApproval } from '../approvals/index.js';
import { logger } from '../logger.js';
import type { Tool } from './types.js';
import { APPROVAL_DECISION } from '@shared/constants.js';
import { ToolResultV2 } from '@shared/types.js';

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

export const runShellTool: Tool<
  { description: string; command: string; timeout?: number },
  ToolResultV2
> = {
  name: 'run_shell',
  description: DESCRIPTION,
  schema: z.object({
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
  }),
  needsApproval: false,
  run: async (input, ctx) => {
    // 1. Classify command safety
    const classification = classifyCommand(input.command);

    // 3. Denied commands → reject immediately
    if (classification.tier === 'deny') {
      logger.warn(
        { command: input.command, reason: classification.denyReason },
        'shell command denied',
      );
      throw new Error(`ERROR: command blocked - ${classification.denyReason}`);
    }

    // 4. Prompted commands → request approval (standard flow handles session allow-listing)
    if (classification.tier === 'prompt' && ctx.taskId) {
      const decision = await requestApproval(
        ctx.taskId,
        'run_shell',
        { command: input.command, description: input.description },
        ctx.signal,
      );
      if (decision === APPROVAL_DECISION.DENY) {
        throw new Error('ERROR: command denied by user');
      }
    }

    // 5. Execute
    return runShell({
      command: input.command,
      cwd: ctx.workspacePath,
      timeoutMs: input.timeout !== undefined ? input.timeout * 1000 : undefined,
      signal: ctx.signal,
    });
  },
};
