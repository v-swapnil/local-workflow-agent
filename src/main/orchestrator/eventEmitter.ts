import { addToolCall, getToolCallByToolCallId, updateToolCall } from '../services/store.js';
import { taskBus } from '../services/events.js';
import type { ApprovalStatus, LogLevel, TaskStatus, ToolResultV2 } from '@shared/types.js';
import { updateTask } from '@main/services/workspaces';
import { TaskResult, ToolName } from '@shared/agent.js';

export const emitStepStarted = (taskId: string, agentId: string) => {
  taskBus.emit({ type: 'step.started', taskId, agentId, status: 'running' });
};

export const emitStepFinished = (taskId: string, agentId: string, status: TaskStatus) => {
  taskBus.emit({ type: 'step.finished', taskId, agentId, status });
};

export const emitToolCallStarted = (
  taskId: string,
  messageId: string | null,
  toolCallId: string,
  toolName: ToolName,
  args: Record<string, unknown>,
) => {
  const row = addToolCall({
    taskId,
    messageId,
    toolCallId,
    toolName,
    arguments: args ? JSON.stringify(args) : null,
    result: null,
    status: 'running',
    startedAt: Date.now(),
    finishedAt: null,
  });
  taskBus.emit({ type: 'tool_call.started', taskId, toolCallId: row.id, status: 'pending' });
};

export const emitToolCallFinished = (
  taskId: string,
  toolCallId: string,
  toolCallResult: ToolResultV2,
) => {
  const toolCall = getToolCallByToolCallId(taskId, toolCallId);
  if (toolCall) {
    updateToolCall(toolCall.id, {
      result: toolCallResult.content != null ? JSON.stringify(toolCallResult.content) : null,
      status: toolCallResult.status,
      finishedAt: Date.now(),
    });
    taskBus.emit({
      type: 'tool_call.finished',
      taskId,
      toolCallId: toolCall.id,
      status: toolCallResult.status,
    });
  }
};

export const emitTaskStarted = (taskId: string) => {
  updateTask(taskId, { status: 'running', startedAt: Date.now() });
  taskBus.emit({ type: 'task.started', taskId, status: 'running' });
};

export const emitTaskFinished = (taskId: string, status: TaskStatus, result?: TaskResult) => {
  updateTask(taskId, {
    status,
    result: result ? JSON.stringify(result) : null,
    finishedAt: Date.now(),
  });
  taskBus.emit({ type: 'task.finished', taskId, status });
};

export const emitMessageDelta = (taskId: string, content: string) => {
  taskBus.emit({ type: 'llm.delta', taskId, content });
};

export const emitThinkingDelta = (taskId: string, content: string) => {
  taskBus.emit({ type: 'llm.thinking_delta', taskId, content });
};

export const emitLog = (taskId: string, logLevel: LogLevel, content: string) => {
  const eventType = logLevel === 'error' ? 'log.error' : 'log.info';
  taskBus.emit({ type: eventType, taskId, content });
};

export const emitApprovalRequested = (taskId: string, approvalId: string) => {
  taskBus.emit({ type: 'approval.requested', taskId, approvalId, status: 'pending' });
};

export const emitApprovalDecided = (taskId: string, approvalId: string, status: ApprovalStatus) => {
  taskBus.emit({ type: 'approval.decided', taskId, approvalId, status });
};

export const emitUserInputRequested = (taskId: string, question: string) => {
  taskBus.emit({ type: 'user_input.requested', taskId, content: question });
};

export const emitUserInputResponded = (taskId: string, answer: string) => {
  taskBus.emit({ type: 'user_input.responded', taskId, content: answer });
};
