import { addStep, updateStep, addToolCall, updateToolCall, updateTask } from '../services/store.js';
import { taskBus } from '../services/events.js';
import type { ToolName } from '../services/tools/types.js';
import type { RunCtx } from './runCtx.js';

export function emitStepStarted(ctx: RunCtx, agent: string, input?: unknown): { stepId: string } {
  const sequence = ctx.stepIdx.n++;
  const row = addStep({
    taskId: ctx.taskId,
    sequence,
    agent,
    prompt: null,
    result: null,
    status: 'running',
    startedAt: Date.now(),
    finishedAt: null,
  });
  taskBus.emit(ctx.taskId, {
    type: 'step.started',
    taskId: ctx.taskId,
    ts: Date.now(),
    stepId: row.id,
    agent,
  });
  return { stepId: row.id };
}

export function emitStepFinished(
  ctx: RunCtx,
  stepId: string,
  ok: boolean,
  output: unknown,
  error?: string,
): void {
  updateStep(stepId, {
    result: output != null ? JSON.stringify(output) : null,
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

export function emitToolCallStarted(
  ctx: RunCtx,
  agent: string,
  tool: ToolName,
  input?: unknown,
): { stepId: string } {
  ctx.stepIdx.n++;
  const row = addToolCall({
    taskId: ctx.taskId,
    stepId: null,
    tool,
    arguments: input != null ? JSON.stringify(input) : null,
    result: null,
    status: 'running',
    startedAt: Date.now(),
    finishedAt: null,
  });
  taskBus.emit(ctx.taskId, {
    type: 'tool_call.started',
    taskId: ctx.taskId,
    ts: Date.now(),
    stepId: row.id,
    agent,
    tool,
    input,
  });
  return { stepId: row.id };
}

export function emitToolCallFinished(
  ctx: RunCtx,
  stepId: string,
  ok: boolean,
  tool: string,
  output: unknown,
  error?: string,
): void {
  updateToolCall(stepId, {
    result: output != null ? JSON.stringify(output) : null,
    status: ok ? 'succeeded' : 'failed',
    finishedAt: Date.now(),
  });
  taskBus.emit(ctx.taskId, {
    type: 'tool_call.finished',
    taskId: ctx.taskId,
    ts: Date.now(),
    stepId,
    ok,
    tool,
    output,
    error,
  });
}

export function emitTaskStarted(taskId: string): void {
  updateTask(taskId, { status: 'running', startedAt: Date.now() });
  taskBus.emit(taskId, {
    type: 'task.started',
    taskId,
    ts: Date.now(),
  });
}

export function emitTaskFinished(
  taskId: string,
  status: 'succeeded' | 'failed' | 'cancelled',
  result?: unknown,
  error?: string,
): void {
  updateTask(taskId, {
    status,
    finishedAt: Date.now(),
    result: result ? JSON.stringify(result) : null,
    iterations: (result as { iterations?: number })?.iterations,
  });
  taskBus.emit(taskId, {
    type: 'task.finished',
    taskId,
    ts: Date.now(),
    status,
    result,
    error,
  });
}

export function emitMessageDelta(taskId: string, agent: string, content: string): void {
  taskBus.emit(taskId, {
    type: 'llm.delta',
    taskId,
    ts: Date.now(),
    agent,
    content,
  });
}

export function emitThinkingDelta(taskId: string, agent: string, content: string): void {
  taskBus.emit(taskId, {
    type: 'llm.thinking_delta',
    taskId,
    ts: Date.now(),
    agent,
    content,
  });
}
