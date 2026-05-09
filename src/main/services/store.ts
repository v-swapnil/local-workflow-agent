import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { sessions, messages, tasks, steps } from '../db/schema.js';
import { getSetting, SETTING_KEYS } from './settings.js';
import { createWorktree, removeWorktreeBySession } from './worktrees.js';

export interface Session {
  id: string;
  workspaceId: string;
  title: string;
  status: string;
  kanbanLane: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Task {
  id: string;
  sessionId: string;
  prompt: string;
  status: string;
  planJson: string | null;
  resultJson: string | null;
  iterations: number;
  maxIterations: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface Step {
  id: string;
  taskId: string;
  idx: number;
  agent: string;
  tool: string | null;
  inputJson: string | null;
  outputJson: string | null;
  status: string;
  startedAt: number | null;
  finishedAt: number | null;
}

// ───────── Sessions ─────────

export async function createSession(workspaceId: string, title: string): Promise<Session> {
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

export function listSessions(workspaceId?: string): Session[] {
  const db = getDb();
  const q = workspaceId
    ? db.select().from(sessions).where(eq(sessions.workspaceId, workspaceId))
    : db.select().from(sessions);
  return (q.all() as Session[]).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(id: string): Session {
  const row = getDb().select().from(sessions).where(eq(sessions.id, id)).get();
  if (!row) throw new Error(`session not found: ${id}`);
  return row as Session;
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
    db.delete(steps).where(eq(steps.taskId, t.id)).run();
  }
  db.delete(tasks).where(eq(tasks.sessionId, id)).run();
  db.delete(messages).where(eq(messages.sessionId, id)).run();
  db.delete(sessions).where(eq(sessions.id, id)).run();
}

// ───────── Messages ─────────

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: number;
}

export function addMessage(sessionId: string, role: Message['role'], content: string): Message {
  const m: Message = { id: nanoid(10), sessionId, role, content, ts: Date.now() };
  getDb().insert(messages).values(m).run();
  getDb().update(sessions).set({ updatedAt: m.ts }).where(eq(sessions.id, sessionId)).run();
  return m;
}

export function listMessages(sessionId: string): Message[] {
  return getDb()
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .all()
    .sort((a, b) => a.ts - b.ts) as Message[];
}

// ───────── Tasks ─────────

export function createTask(sessionId: string, prompt: string, maxIterations = 6): Task {
  const t: Task = {
    id: nanoid(10),
    sessionId,
    prompt,
    status: 'queued',
    planJson: null,
    resultJson: null,
    iterations: 0,
    maxIterations,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
  };
  getDb().insert(tasks).values(t).run();
  return t;
}

export function getTask(id: string): Task {
  const row = getDb().select().from(tasks).where(eq(tasks.id, id)).get();
  if (!row) throw new Error(`task not found: ${id}`);
  return row as Task;
}

export function listTasks(sessionId: string): Task[] {
  return getDb()
    .select()
    .from(tasks)
    .where(eq(tasks.sessionId, sessionId))
    .orderBy(desc(tasks.createdAt))
    .all() as Task[];
}

export function updateTask(id: string, patch: Partial<Task>): void {
  getDb().update(tasks).set(patch).where(eq(tasks.id, id)).run();
}

// ───────── Steps ─────────

export function addStep(input: Omit<Step, 'id'>): Step {
  const row = { id: nanoid(10), ...input };
  getDb().insert(steps).values(row).run();
  return row;
}

export function updateStep(id: string, patch: Partial<Step>): void {
  getDb().update(steps).set(patch).where(eq(steps.id, id)).run();
}

export function listSteps(taskId: string): Step[] {
  return getDb()
    .select()
    .from(steps)
    .where(eq(steps.taskId, taskId))
    .all()
    .sort((a, b) => a.idx - b.idx) as Step[];
}

// ───────── Kanban ─────────

export function setSessionKanbanLane(sessionId: string, lane: string | null): void {
  getDb()
    .update(sessions)
    .set({ kanbanLane: lane, updatedAt: Date.now() })
    .where(eq(sessions.id, sessionId))
    .run();
}
