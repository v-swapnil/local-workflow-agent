import { and, desc, eq, isNull, isNotNull } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { memories } from '../db/schema.js';
import { MemoryRecord } from '@shared/schema.js';

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

export function listSessionMemories(sessionId: number, type?: MemoryType): MemoryRecord[] {
  const conditions = [eq(memories.sessionId, sessionId)];
  if (type) conditions.push(eq(memories.type, type));
  return getDb()
    .select()
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.createdAt), desc(memories.id))
    .all() as MemoryRecord[];
}

export function listWorkspaceMemories(workspaceId: number, type?: MemoryType): MemoryRecord[] {
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
  sessionId?: number | null;
  taskId?: number | null;
  workspaceId?: number | null;
  type: MemoryType;
  content: string;
}): MemoryRecord {
  return getDb()
    .insert(memories)
    .values({
      type: input.type,
      content: input.content,
      sessionId: input.sessionId,
      taskId: input.taskId,
      workspaceId: input.workspaceId,
      createdAt: Date.now(),
    })
    .returning()
    .get();
}

export function deleteMemory(id: number): void {
  getDb().delete(memories).where(eq(memories.id, id)).run();
}
