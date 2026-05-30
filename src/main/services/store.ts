import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { sessions, messages, tasks, steps, memories, toolCalls } from '../db/schema.js';
import { getSetting, SETTING_KEYS } from './settings.js';
import { createWorktree, removeWorktreeBySession } from './worktrees.js';
import type { MessageRecord, SessionRecord, StepRecord, TaskRecord, ToolCallRecord } from '@shared/schema.js';

// ───────── Sessions ─────────

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

// ───────── Messages ─────────

export function addMessage(
  sessionId: string,
  role: MessageRecord['role'],
  content: string,
  taskId?: string,
): MessageRecord {
  const m: MessageRecord = {
    id: nanoid(10),
    sessionId,
    taskId: taskId ?? null,
    role,
    content,
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

// ───────── Tasks ─────────

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

// ───────── Steps ─────────

export function addStep(input: Omit<StepRecord, 'id'>): StepRecord {
  const row = { id: nanoid(10), ...input };
  getDb().insert(steps).values(row).run();
  return row;
}

export function updateStep(id: string, patch: Partial<StepRecord>): void {
  getDb().update(steps).set(patch).where(eq(steps.id, id)).run();
}

export function listSteps(taskId: string): StepRecord[] {
  return getDb()
    .select()
    .from(steps)
    .where(eq(steps.taskId, taskId))
    .all()
    .sort((a, b) => a.sequence - b.sequence) as StepRecord[];
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
  return getDb().select().from(toolCalls).where(eq(toolCalls.taskId, taskId)).all() as ToolCallRecord[];
}

// ───────── Kanban ─────────

export function setSessionKanbanLane(sessionId: string, lane: string | null): void {
  getDb()
    .update(sessions)
    .set({ kanbanLane: lane, updatedAt: Date.now() })
    .where(eq(sessions.id, sessionId))
    .run();
}
