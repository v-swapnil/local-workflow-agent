import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { sessions, messages, toolCalls } from '../db/schema.js';
import type { MessageRecord, ToolCallRecord } from '@shared/schema.js';
import { getTask } from './workspaces/tasks.js';

export function addMessage(input: Omit<MessageRecord, 'id'>) {
  const result = getDb().insert(messages).values(input).returning().get();

  // Bump the owning session's updatedAt via the message's task
  const owningTask = getTask(input.taskId);
  if (owningTask) {
    getDb()
      .update(sessions)
      .set({ updatedAt: input.createdAt })
      .where(eq(sessions.id, owningTask.sessionId))
      .run();
  }

  return result;
}

/** Messages for a single task, in insertion order (conversation order). */
export function listTaskMessages(taskId: number): MessageRecord[] {
  return getDb()
    .select()
    .from(messages)
    .where(eq(messages.taskId, taskId))
    .orderBy(asc(messages.id))
    .all() as MessageRecord[];
}

export function addToolCall(input: Omit<ToolCallRecord, 'id'>): ToolCallRecord {
  return getDb().insert(toolCalls).values(input).returning().get();
}

export function updateToolCall(id: number, patch: Partial<ToolCallRecord>) {
  getDb().update(toolCalls).set(patch).where(eq(toolCalls.id, id)).run();
}

export function listToolCalls(taskId: number): ToolCallRecord[] {
  return getDb().select().from(toolCalls).where(eq(toolCalls.taskId, taskId)).all();
}

export const getToolCallByToolCallId = (
  taskId: number,
  toolCallId: string,
): ToolCallRecord | null => {
  const whereClause = toolCallId
    ? and(eq(toolCalls.taskId, taskId), eq(toolCalls.toolCallId, toolCallId))
    : eq(toolCalls.taskId, taskId);
  return getDb().select().from(toolCalls).where(whereClause).get() as ToolCallRecord | null;
};
