import { invokeTool, isReadOnlyTool } from '../services/tools/registry.js';
import type { ToolCall } from '../services/llm/provider.js';
import type { RunCtx } from './runCtx.js';
import { emitToolCallStarted, emitToolCallFinished, emitLog } from './eventEmitter.js';
import { ToolExecutionResult } from '@shared/types.js';
import { ToolName } from '@shared/agent.js';

/**
 * Execute a batch of tool calls. Read-only tools run in parallel;
 * write tools run sequentially to avoid conflicts.
 */
export const executeToolCalls = async (
  ctx: RunCtx,
  messageId: number | null,
  toolCalls: ToolCall[],
): Promise<ToolExecutionResult[]> => {
  const invokeOne = async (tc: ToolCall): Promise<ToolExecutionResult> => {
    const tool = tc.name as ToolName;
    const args = tc.arguments;

    emitToolCallStarted(ctx.taskId, messageId, tc.id, tool, args);

    const start = Date.now();
    const result = await invokeTool(tool, args, {
      workspaceId: ctx.workspaceId,
      workspacePath: ctx.workspacePath,
      sessionId: ctx.sessionId,
      taskId: ctx.taskId,
      toolCallId: tc.id,
      signal: ctx.signal,
    });

    emitToolCallFinished(ctx.taskId, tc.id, result);

    return {
      toolCallId: tc.id,
      toolName: tool,
      arguments: args,
      status: result.status,
      content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
      truncated: result.truncated,
      duration: Date.now() - start,
    };
  };

  if (toolCalls.every((tc) => isReadOnlyTool(tc.name))) {
    return Promise.all(toolCalls.map(invokeOne));
  }

  const results: ToolExecutionResult[] = [];
  for (const tc of toolCalls) {
    results.push(await invokeOne(tc));
  }

  return results;
};
