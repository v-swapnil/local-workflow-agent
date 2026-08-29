import { z } from 'zod';
import type { ToolName } from '@shared/agent';

export interface ToolContext {
  workspaceId: number;
  workspacePath: string;
  sessionId?: number;
  taskId?: number;
  toolCallId?: string;
  signal?: AbortSignal;
}

export interface Tool<I, O> {
  name: ToolName;
  description: string;
  schema: z.ZodType<I>;
  needsApproval: boolean;
  run: (input: I, ctx: ToolContext) => Promise<O>;
}
