import { eq, desc, inArray } from 'drizzle-orm';
import { getDb } from '@main/db';
import { tasks } from '@main/db/schema';
import { TaskRecord } from '@shared/schema';
import { nanoid } from 'nanoid';
import { getSetting, SETTING_KEYS } from '../settings';

export function createTask(
  sessionId: string,
  prompt: string,
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

export async function getTaskTimeout() {
  const defaultTimeout = 60 * 10; // 10 minutes
  const timeout = await getSetting(SETTING_KEYS.TASK_TIMEOUT, String(defaultTimeout));
  const parsedTimeout = Number.parseInt(timeout, 10);
  return (parsedTimeout || defaultTimeout) * 1000;
}

/**
 * On startup no task can genuinely be running.  Mark any 'running' or 'queued'
 * tasks as 'failed' so stale approval events are never treated as pending.
 */
export function markOrphanedTasksFailed(): number {
  const now = Date.now();
  const result = getDb()
    .update(tasks)
    .set({ status: 'failed', finishedAt: now })
    .where(inArray(tasks.status, ['running', 'queued']))
    .run();
  return result.changes;
}
