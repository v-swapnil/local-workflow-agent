import { addToolCall, updateToolCall } from '../services/store.js';
import { taskBus } from '../services/events.js';
import type { ToolName } from '../services/tools/types.js';
import type { ApprovalDecision } from '@shared/types.js';
import { updateTask } from '@main/services/workspaces';
import { nanoid } from 'nanoid';

export function emitStepStarted(
  taskId: string,
  sequence: number,
  agent: string,
): { stepId: string } {
  const stepId = nanoid(10);
  taskBus.emit(taskId, {
    type: 'step.started',
    taskId,
    ts: Date.now(),
    stepId,
    agent,
  });
  return { stepId };
}

export function emitStepFinished(
  taskId: string,
  stepId: string,
  ok: boolean,
  output: unknown,
  error?: string,
): void {
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
  messageId?: string | null,
): { id: string } {
  const row = addToolCall({
    taskId,
    messageId: messageId ?? null,
    toolName: tool,
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
  return { id: row.id };
}

// TODO: fix tool call storage
export function emitToolCallFinished(
  taskId: string,
  id: string,
  ok: boolean,
  tool: string,
  output: unknown,
  error?: string,
): void {
  updateToolCall(id, {
    result: output != null ? JSON.stringify(output) : null,
    status: ok ? 'succeeded' : 'failed',
    finishedAt: Date.now(),
  });
  taskBus.emit(taskId, {
    type: 'tool_call.finished',
    taskId,
    ts: Date.now(),
    stepId: id,
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

export function emitApprovalRequested(
  taskId: string,
  approvalId: string,
  tool: string,
  args: Record<string, unknown>,
): void {
  taskBus.emit(taskId, {
    type: 'approval.requested',
    taskId,
    ts: Date.now(),
    approvalId,
    tool,
    args,
  });
}

export function emitApprovalDecided(
  taskId: string,
  approvalId: string,
  decision: ApprovalDecision,
): void {
  taskBus.emit(taskId, {
    type: 'approval.decided',
    taskId,
    ts: Date.now(),
    approvalId,
    decision,
  });
}

export function emitUserInputRequested(
  taskId: string,
  requestId: string,
  question: string,
  description?: string,
  choices?: string[],
): void {
  taskBus.emit(taskId, {
    type: 'user_input.requested',
    taskId,
    ts: Date.now(),
    requestId,
    question,
    description,
    choices,
  });
}

export function emitUserInputResponded(taskId: string, requestId: string, answer: string): void {
  taskBus.emit(taskId, {
    type: 'user_input.responded',
    taskId,
    ts: Date.now(),
    requestId,
    answer,
  });
}
