import { z } from 'zod';
import type { ToolName } from '@shared/agent';
export type { ToolName };

export interface ToolContext {
  workspaceId: string;
  workspacePath: string;
  sessionId?: string;
  taskId?: string;
  signal?: AbortSignal;
}

export interface Tool<I, O> {
  name: ToolName;
  description: string;
  schema: z.ZodType<I>;
  /** Should this tool require an approval prompt by default? */
  needsApproval: boolean;
  run: (input: I, ctx: ToolContext) => Promise<O>;
}

export interface ToolInvocation {
  name: ToolName;
  args: unknown;
}
