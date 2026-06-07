import { and, desc, eq, isNull, isNotNull } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { memories } from '../db/schema.js';

export const MEMORY_TYPES = [
  'semantic',
  'episodic',
  'procedural',
  'preference',
  'fact',
  'summary',
  'observation',
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export interface MemoryRecord {
  id: number;
  type: MemoryType;
  content: string;
  sessionId: string | null;
  taskId: string | null;
  workspaceId: string | null;
  createdAt: number;
}

export function listSessionMemories(sessionId: string, type?: MemoryType): MemoryRecord[] {
  const conditions = [eq(memories.sessionId, sessionId)];
  if (type) conditions.push(eq(memories.type, type));
  return getDb()
    .select()
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.createdAt), desc(memories.id))
    .all() as MemoryRecord[];
}

export function listWorkspaceMemories(workspaceId: string, type?: MemoryType): MemoryRecord[] {
  const conditions = [eq(memories.workspaceId, workspaceId), isNull(memories.sessionId)];
  if (type) conditions.push(eq(memories.type, type));
  return getDb()
    .select()
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.createdAt), desc(memories.id))
    .all() as MemoryRecord[];
}

export function addMemory(input: {
  sessionId?: string | null;
  taskId?: string | null;
  workspaceId?: string | null;
  type: MemoryType;
  content: string;
}): MemoryRecord {
  const row: MemoryRecord = {
    id: 0,
    sessionId: input.sessionId ?? null,
    taskId: input.taskId ?? null,
    workspaceId: input.workspaceId ?? null,
    type: input.type,
    content: input.content.trim(),
    createdAt: Date.now(),
  };
  const result = getDb()
    .insert(memories)
    .values({
      type: row.type,
      content: row.content,
      sessionId: row.sessionId,
      taskId: row.taskId,
      workspaceId: row.workspaceId,
      createdAt: row.createdAt,
    })
    .run();
  row.id = Number(result.lastInsertRowid);
  return row;
}

export function deleteSessionMemories(sessionId: string): void {
  getDb().delete(memories).where(eq(memories.sessionId, sessionId)).run();
}
