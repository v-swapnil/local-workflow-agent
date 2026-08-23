import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { sessions, messages, toolCalls } from '../db/schema.js';
import type { MessageRecord, ToolCallRecord } from '@shared/schema.js';

// ───────── Messages ─────────

export function addMessage(
  sessionId: string,
  role: MessageRecord['role'],
  content: string,
  taskId?: string,
  thinking?: string | null,
): MessageRecord {
  const m: MessageRecord = {
    id: nanoid(10),
    sessionId,
    taskId: taskId ?? null,
    role,
    content,
    thinking: thinking ?? null,
    createdAt: Date.now(),
  };
  getDb().insert(messages).values(m).run();
  getDb().update(sessions).set({ updatedAt: m.createdAt }).where(eq(sessions.id, sessionId)).run();
  return m;
}

export function listMessages(sessionId: string): MessageRecord[] {
  return getDb()
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .all()
    .sort((a, b) => a.createdAt - b.createdAt) as MessageRecord[];
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
