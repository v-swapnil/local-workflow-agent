import { invokeTool, isReadOnlyTool } from '../services/tools/registry.js';
import type { ToolCall } from '../services/llm/provider.js';
import type { ToolName } from '../services/tools/types.js';
import type { RunCtx } from './runCtx.js';
import { emitToolCallStarted, emitToolCallFinished, emitLog } from './eventEmitter.js';

export interface ToolResult {
  tool: ToolName;
  args: Record<string, unknown>;
  ok: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

/**
 * Execute a batch of tool calls. Read-only tools run in parallel;
 * write tools run sequentially to avoid conflicts.
 */
export async function executeToolCalls(
  ctx: RunCtx,
  agent: string,
  toolCalls: ToolCall[],
): Promise<ToolResult[]> {
  const invokeOne = async (tc: ToolCall): Promise<ToolResult> => {
    const tool = tc.name as ToolName;
    const args = tc.arguments;

    const { stepId } = emitToolCallStarted(ctx.taskId, agent, tool, args, tc.id);

    const result = await invokeTool(tool, args, {
      workspaceId: ctx.workspaceId,
      workspacePath: ctx.workspacePath,
      sessionId: ctx.sessionId,
      taskId: ctx.taskId,
      signal: ctx.signal,
      onLog: ({ stream, text }) => emitLog(ctx.taskId, stepId, stream !== 'stderr', text),
    });

    emitToolCallFinished(ctx.taskId, stepId, result.ok, tool, result.output ?? null, result.error);

    return {
      tool,
      args: (args ?? {}) as Record<string, unknown>,
      ok: result.ok,
      output:
        typeof result.output === 'string' ? result.output : JSON.stringify(result.output ?? ''),
      error: result.error,
      durationMs: result.durationMs,
    };
  };

  if (toolCalls.every((tc) => isReadOnlyTool(tc.name))) {
    return Promise.all(toolCalls.map(invokeOne));
  }

  const results: ToolResult[] = [];
  for (const tc of toolCalls) {
    results.push(await invokeOne(tc));
  }

  return results;
}
