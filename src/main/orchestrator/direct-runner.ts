import { getProvider } from '../services/llm/index.js';
import { PROVIDERS } from '@shared/constants';
import type { ProviderId } from '@shared/types';
import { invokeTool, listToolsForLLM, isReadOnlyTool } from '../services/tools/registry.js';
import { taskBus } from '../services/events.js';
import { addStep, updateStep } from '../services/store.js';
import type { RunCtx } from './graph.js';
import type { AgentRecord } from '../services/agents.js';
import type { TaskResult } from '@shared/agent';
import type { ChatMessage, ToolCallResult } from '../services/llm/provider.js';
import type { ToolName } from '../services/tools/types.js';

function emitStep(ctx: RunCtx, tool?: ToolName, input?: unknown) {
  const idx = ctx.stepIdx.n++;
  const row = addStep({
    taskId: ctx.taskId,
    idx,
    agent: 'direct',
    tool: tool ?? null,
    inputJson: input != null ? JSON.stringify(input) : null,
    outputJson: null,
    status: 'running',
    startedAt: Date.now(),
    finishedAt: null,
  });
  taskBus.emit(ctx.taskId, {
    type: 'step.started',
    taskId: ctx.taskId,
    ts: Date.now(),
    stepId: row.id,
    agent: 'direct',
    tool,
    input,
  });
  return row.id;
}

function finishStep(ctx: RunCtx, stepId: string, ok: boolean, output: unknown, error?: string) {
  updateStep(stepId, {
    outputJson: output != null ? JSON.stringify(output) : null,
    status: ok ? 'succeeded' : 'failed',
    finishedAt: Date.now(),
  });
  taskBus.emit(ctx.taskId, {
    type: 'step.finished',
    taskId: ctx.taskId,
    ts: Date.now(),
    stepId,
    ok,
    output,
    error,
  });
}

/**
 * Standalone ReAct loop for agents with graphMode === 'direct'.
 * Think → Tool calls → Observe → repeat until done or max iterations.
 */
export async function runDirectAgent(
  taskId: string,
  agent: AgentRecord,
  prompt: string,
  ctx: RunCtx,
): Promise<TaskResult> {
  const provider = getProvider((agent.provider as ProviderId) || PROVIDERS.OLLAMA);
  const model = ctx.model;
  const maxIter = agent.maxIterations ?? 10;

  // Determine tool subset from agent's tools (comma-separated)
  const allTools = listToolsForLLM();
  let tools = allTools;
  if (agent.tools) {
    const allowed = new Set<string>(agent.tools.split(',').map((t) => t.trim()).filter(Boolean));
    tools = allTools.filter((t) => allowed.has(t.function.name));
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: agent.systemPrompt },
    { role: 'user', content: prompt },
  ];

  let iterations = 0;
  let lastError: string | null = null;

  for (let i = 0; i < maxIter; i++) {
    if (ctx.signal.aborted) break;
    iterations = i + 1;

    const buf: string[] = [];
    let toolCalls: ToolCallResult[] = [];

    const result = await provider.chat({
      model,
      temperature: agent.temperature,
      signal: ctx.signal,
      messages,
      tools,
      onDelta: (d) => {
        buf.push(d);
        taskBus.emit(taskId, {
          type: 'llm.delta',
          taskId,
          ts: Date.now(),
          agent: 'direct',
          content: d,
        });
      },
    });

    toolCalls = result.toolCalls ?? [];
    const text = result.content || buf.join('');

    // If no tool calls returned, check for {"done": true} in text
    if (!toolCalls.length) {
      // Try to parse legacy JSON done signal
      try {
        const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as {
          done?: boolean;
        };
        if (parsed.done) break;
      } catch {
        /* not JSON — treat as done */
      }
      break;
    }

    // Append assistant message
    messages.push({ role: 'assistant', content: text });

    // Execute tool calls — parallel for read-only, sequential otherwise
    const invokeOne = async (tc: ToolCallResult) => {
      const toolName = tc.name as ToolName;
      const stepId = emitStep(ctx, toolName, tc.arguments);

      const toolResult = await invokeTool(toolName, tc.arguments, {
        workspaceId: ctx.workspaceId,
        workspacePath: ctx.workspacePath,
        taskId,
        signal: ctx.signal,
        onLog: ({ stream, text: logText }) => {
          taskBus.emit(taskId, {
            type: 'log',
            taskId,
            ts: Date.now(),
            stream,
            text: logText,
            stepId,
          });
        },
      });

      finishStep(ctx, stepId, toolResult.ok, toolResult.output ?? null, toolResult.error);
      return { toolName, toolResult };
    };

    const allReadOnly = toolCalls.every((tc) => isReadOnlyTool(tc.name));
    const results = allReadOnly
      ? await Promise.all(toolCalls.map(invokeOne))
      : await (async () => {
          const seq: Awaited<ReturnType<typeof invokeOne>>[] = [];
          for (const tc of toolCalls) seq.push(await invokeOne(tc));
          return seq;
        })();

    for (const { toolName, toolResult } of results) {
      lastError = toolResult.ok ? null : (toolResult.error ?? null);
      messages.push({
        role: 'user',
        content: `[tool: ${toolName}] ${
          toolResult.ok
            ? JSON.stringify(toolResult.output ?? {})
            : `ERROR: ${toolResult.error ?? 'unknown error'}`
        }`,
      });
    }
  }

  const succeeded = !ctx.signal.aborted && !lastError;
  return {
    status: succeeded ? 'succeeded' : 'failed',
    iterations,
    plan: null,
    reason: succeeded ? undefined : (lastError ?? 'aborted'),
  };
}
