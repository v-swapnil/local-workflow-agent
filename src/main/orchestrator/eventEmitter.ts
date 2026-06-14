import { addStep, updateStep, addToolCall, updateToolCall } from '../services/store.js';
import { taskBus } from '../services/events.js';
import type { ToolName } from '../services/tools/types.js';
import { updateTask } from '@main/services/workspaces';

export function emitStepStarted(
  taskId: string,
  sequence: number,
  agent: string,
): { stepId: string } {
  const row = addStep({
    taskId,
    sequence,
    agent,
    prompt: null,
    result: null,
    status: 'running',
    startedAt: Date.now(),
    finishedAt: null,
  });
  taskBus.emit(taskId, {
    type: 'step.started',
    taskId,
    ts: Date.now(),
    stepId: row.id,
    agent,
  });
  return { stepId: row.id };
}

export function emitStepFinished(
  taskId: string,
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
  taskBus.emit(taskId, {
    type: 'step.finished',
    taskId,
    ts: Date.now(),
    stepId,
    ok,
    output,
    error,
  });
}

export function emitToolCallStarted(
  taskId: string,
  agent: string,
  tool: ToolName,
  args?: unknown,
  toolCallId?: string,
): { stepId: string } {
  const row = addToolCall({
    taskId: taskId,
    stepId: null,
    tool,
    toolCallId,
    arguments: args ? JSON.stringify(args) : null,
    result: null,
    status: 'running',
    startedAt: Date.now(),
    finishedAt: null,
  });
  taskBus.emit(taskId, {
    type: 'tool_call.started',
    taskId,
    ts: Date.now(),
    stepId: row.id,
    agent,
    tool,
    input: args,
  });
  return { stepId: row.id };
}

export function emitToolCallFinished(
  taskId: string,
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
  taskBus.emit(taskId, {
    type: 'tool_call.finished',
    taskId,
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

export function emitLog(
  taskId: string,
  stepId: string | undefined,
  ok: boolean,
  content: string,
): void {
  taskBus.emit(taskId, {
    type: 'log',
    taskId: taskId,
    ts: Date.now(),
    stream: ok ? 'stdout' : 'stderr',
    text: content,
    stepId,
  });
}
