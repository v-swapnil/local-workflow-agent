import { addToolCall, getToolCallByToolCallId, updateToolCall } from '../services/store.js';
import { taskBus } from '../services/events.js';
import type { ApprovalStatus, LogLevel, TaskStatus, ToolResultV2 } from '@shared/types.js';
import { updateTask } from '@main/services/workspaces';
import { TaskResult, ToolName } from '@shared/agent.js';
import { summarizeToolCall, summarizeToolResult } from '@main/services/tools/toolSummary.js';

export const emitTaskStarted = (taskId: number, agentOrWorkflowId?: number | null) => {
  updateTask(taskId, { status: 'running', startedAt: Date.now() });
  taskBus.emit({ type: 'task.started', taskId, status: 'running', referenceId: agentOrWorkflowId });
};

export const emitTaskFinished = (
  taskId: number,
  status: TaskStatus,
  result?: TaskResult,
  agentOrWorkflowId?: number | null,
) => {
  updateTask(taskId, {
    status,
    result: result ? JSON.stringify(result) : null,
    finishedAt: Date.now(),
  });
  taskBus.emit({ type: 'task.finished', taskId, status, referenceId: agentOrWorkflowId });
};

export const emitStepStarted = (taskId: number, agentId: number | null) => {
  taskBus.emit({ type: 'step.started', taskId, referenceId: agentId, status: 'running' });
};

export const emitStepFinished = (taskId: number, agentId: number | null, status: TaskStatus) => {
  taskBus.emit({ type: 'step.finished', taskId, referenceId: agentId, status });
};

export const emitToolCallStarted = (
  taskId: number,
  messageId: number | null,
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
  taskBus.emit({
    type: 'tool_call.started',
    taskId,
    referenceId: row.id,
    status: 'pending',
    content: summarizeToolCall(toolName, args),
  });
};

export const emitToolCallFinished = (
  taskId: number,
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
      referenceId: toolCall.id,
      status: toolCallResult.status,
      content: summarizeToolResult(toolCall.toolName as ToolName),
    });
  }
};

export const emitMessagePrompt = (taskId: number, content: string) => {
  taskBus.emit({ type: 'llm.prompt', taskId, content });
};

export const emitMessageDelta = (taskId: number, content: string) => {
  taskBus.emit({ type: 'llm.delta', taskId, content });
};

export const emitThinkingDelta = (taskId: number, content: string) => {
  taskBus.emit({ type: 'llm.thinking_delta', taskId, content });
};

export const emitLog = (taskId: number, logLevel: LogLevel, content: string) => {
  const eventType = logLevel === 'error' ? 'log.error' : 'log.info';
  taskBus.emit({ type: eventType, taskId, content });
};

export const emitApprovalRequested = (taskId: number, approvalId: number) => {
  taskBus.emit({ type: 'approval.requested', taskId, referenceId: approvalId, status: 'pending' });
};

export const emitApprovalDecided = (taskId: number, approvalId: number, status: ApprovalStatus) => {
  taskBus.emit({ type: 'approval.decided', taskId, referenceId: approvalId, status });
};

export const emitUserInputRequested = (taskId: number, userInputId: number, question: string) => {
  taskBus.emit({
    type: 'user_input.requested',
    taskId,
    content: question,
    referenceId: userInputId,
  });
};

export const emitUserInputResponded = (taskId: number, userInputId: number, answer: string) => {
  taskBus.emit({ type: 'user_input.responded', taskId, content: answer, referenceId: userInputId });
};
