import { eq, desc } from 'drizzle-orm';
import { getDb } from '@main/db';
import { tasks } from '@main/db/schema';
import { TaskRecord } from '@shared/schema';
import { nanoid } from 'nanoid';

export function createTask(
  sessionId: string,
  prompt: string,
  maxIterations = 6,
  opts?: { model?: string; agentId?: string; workflowId?: string },
): TaskRecord {
  const t: TaskRecord = {
    id: nanoid(10),
    sessionId,
    prompt,
    status: 'queued',
    provider: null,
    plan: null,
    result: null,
    iterations: 0,
    maxIterations,
    model: opts?.model ?? null,
    agentId: opts?.agentId ?? null,
    workflowId: opts?.workflowId ?? null,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
  };
  getDb().insert(tasks).values(t).run();
  return t;
}

export function getTask(id: string): TaskRecord {
  const row = getDb().select().from(tasks).where(eq(tasks.id, id)).get();
  if (!row) throw new Error(`task not found: ${id}`);
  return row as TaskRecord;
}

export function listTasks(sessionId: string): TaskRecord[] {
  return getDb()
    .select()
    .from(tasks)
    .where(eq(tasks.sessionId, sessionId))
    .orderBy(desc(tasks.createdAt))
    .all() as TaskRecord[];
}

export function updateTask(id: string, patch: Partial<TaskRecord>): void {
  getDb().update(tasks).set(patch).where(eq(tasks.id, id)).run();
}
