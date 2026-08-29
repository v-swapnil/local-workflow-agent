import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { sessions, messages, tasks, toolCalls } from '../db/schema.js';
import type { MessageRecord, ToolCallRecord } from '@shared/schema.js';
import { getTask } from './workspaces/tasks.js';

// ───────── Messages ─────────

export interface AddMessageInput {
  taskId: string;
  role: MessageRecord['role'];
  content: string;
  thinking?: string | null;
  toolCallId?: string | null;
  toolName?: string | null;
  agentId?: string | null;
  toolCalls?: string | null;
}

export function addMessage(input: AddMessageInput): MessageRecord {
  const message: MessageRecord = {
    id: nanoid(10),
    taskId: input.taskId,
    role: input.role,
    content: input.content,
    thinking: input.thinking ?? null,
    toolCallId: input.toolCallId ?? null,
    toolName: input.toolName ?? null,
    agentId: input.agentId ?? null,
    toolCalls: input.toolCalls ?? null,
    createdAt: Date.now(),
  };
  getDb().insert(messages).values(message).run();
  // Bump the owning session's updatedAt via the message's task
  const owningTask = getTask(input.taskId);
  if (owningTask) {
    getDb()
      .update(sessions)
      .set({ updatedAt: message.createdAt })
      .where(eq(sessions.id, owningTask.sessionId))
      .run();
  }
  return message;
}

export function listMessages(sessionId: string): MessageRecord[] {
  return getDb()
    .select()
    .from(messages)
    .innerJoin(tasks, eq(messages.taskId, tasks.id))
    .where(eq(tasks.sessionId, sessionId))
    .all()
    .map((row) => row.messages)
    .sort((first, second) => first.createdAt - second.createdAt) as MessageRecord[];
}

// ───────── Tool Calls ─────────

export function addToolCall(input: Omit<ToolCallRecord, 'id'>): ToolCallRecord {
  const row = { id: nanoid(10), ...input };
  getDb().insert(toolCalls).values(row).run();
  return row;
}

export function updateToolCall(id: string, patch: Partial<ToolCallRecord>): void {
  getDb().update(toolCalls).set(patch).where(eq(toolCalls.id, id)).run();
}

export function listToolCalls(taskId: string): ToolCallRecord[] {
  return getDb()
    .select()
    .from(toolCalls)
    .where(eq(toolCalls.taskId, taskId))
    .all() as ToolCallRecord[];
}

export const getToolCallByToolCallId = (
  taskId: string,
  toolCallId: string,
): ToolCallRecord | null => {
  const whereClause = toolCallId
    ? and(eq(toolCalls.taskId, taskId), eq(toolCalls.toolCallId, toolCallId))
    : eq(toolCalls.taskId, taskId);
  return getDb().select().from(toolCalls).where(whereClause).get() as ToolCallRecord | null;
};
