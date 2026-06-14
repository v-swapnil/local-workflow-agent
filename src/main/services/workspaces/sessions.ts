import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { SessionRecord } from '@shared/schema.js';
import { memories, messages, sessions, steps, tasks, toolCalls } from '@main/db/schema';
import { getSetting, SETTING_KEYS } from '../settings';
import { createWorktree, removeWorktreeBySession } from '../worktrees';
import { getDb } from '@main/db';

export async function buildSessionSummary(sessionId: string) {
  const session = getDb().select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) throw new Error(`session not found: ${sessionId}`);
}

export async function createSession(workspaceId: string, title: string): Promise<SessionRecord> {
  const now = Date.now();
  const row = {
    id: nanoid(10),
    workspaceId,
    title,
    status: 'active' as const,
    kanbanLane: null,
    createdAt: now,
    updatedAt: now,
  };
  getDb().insert(sessions).values(row).run();
  // Create worktree synchronously so it's ready before any task runs
  const useWt = await getSetting(SETTING_KEYS.USE_WORKTREES);
  if (useWt === '1') {
    try {
      await createWorktree(workspaceId, row.id);
    } catch (err) {
      console.warn('[store] worktree creation failed:', err);
    }
  }
  return row;
}

export function listSessions(workspaceId?: string): SessionRecord[] {
  const db = getDb();
  const q = workspaceId
    ? db.select().from(sessions).where(eq(sessions.workspaceId, workspaceId))
    : db.select().from(sessions);
  return (q.all() as SessionRecord[]).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(id: string): SessionRecord {
  const row = getDb().select().from(sessions).where(eq(sessions.id, id)).get();
  if (!row) throw new Error(`session not found: ${id}`);
  return row as SessionRecord;
}

export function renameSession(id: string, title: string): void {
  getDb().update(sessions).set({ title, updatedAt: Date.now() }).where(eq(sessions.id, id)).run();
}

export function deleteSession(id: string): void {
  const db = getDb();
  // Remove worktree first (best-effort, async)
  removeWorktreeBySession(id).catch((err) => {
    console.warn('[store] worktree removal failed:', err);
  });
  // cascade by hand
  const taskRows = db.select().from(tasks).where(eq(tasks.sessionId, id)).all();
  for (const t of taskRows) {
    db.delete(toolCalls).where(eq(toolCalls.taskId, t.id)).run();
    db.delete(steps).where(eq(steps.taskId, t.id)).run();
  }
  db.delete(tasks).where(eq(tasks.sessionId, id)).run();
  db.delete(messages).where(eq(messages.sessionId, id)).run();
  db.delete(memories).where(eq(memories.sessionId, id)).run();
  db.delete(sessions).where(eq(sessions.id, id)).run();
}

export function setSessionKanbanLane(sessionId: string, lane: string | null): void {
  getDb()
    .update(sessions)
    .set({ kanbanLane: lane, updatedAt: Date.now() })
    .where(eq(sessions.id, sessionId))
    .run();
}
