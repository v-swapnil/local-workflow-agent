import { EventEmitter } from 'node:events';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { approvals } from '../db/schema.js';
import { taskBus } from './events.js';
import { getSetting, setSetting } from './settings.js';
import { updateTask } from './workspaces';
import type { ToolName } from './tools/types.js';
import type { ApprovalRequestRecord } from '@shared/schema.js';

export type ApprovalDecision = 'approve' | 'approve_session' | 'deny';

const SETTING_AUTO_APPROVE = 'autoApproveTools'; // "true" | "false"

interface Pending {
  request: ApprovalRequestRecord;
  resolve: (d: ApprovalDecision) => void;
}

const pending = new Map<string, Pending>();
/** Per-task allowlist after user picks "approve for this task". */
const taskAllow = new Map<string, Set<ToolName>>();

const bus = new EventEmitter();
bus.setMaxListeners(0);

export async function isAutoApprove(): Promise<boolean> {
  return (await getSetting(SETTING_AUTO_APPROVE)) === 'true';
}

export async function setAutoApprove(value: boolean): Promise<void> {
  await setSetting(SETTING_AUTO_APPROVE, value ? 'true' : 'false');
}

/**
 * Block until the user approves (or denies) a tool call.
 * Persists the request so the UI can show pending approvals across reloads.
 */
export async function requestApproval(
  taskId: string,
  tool: ToolName,
  args: unknown,
  signal?: AbortSignal,
  diff?: string,
): Promise<ApprovalDecision> {
  if (await isAutoApprove()) return 'approve';
  if (taskAllow.get(taskId)?.has(tool)) return 'approve';

  const req: ApprovalRequestRecord = {
    id: nanoid(10),
    taskId,
    tool,
    args,
    diff,
    createdAt: Date.now(),
  };

  getDb()
    .insert(approvals)
    .values({
      id: req.id,
      taskId,
      stepId: null,
      tool,
      arguments: JSON.stringify(args),
      description: null,
      decision: 'pending',
      createdAt: req.createdAt,
      decidedAt: null,
    })
    .run();

  updateTask(taskId, { status: 'awaiting_approval' });

  return new Promise<ApprovalDecision>((resolve, reject) => {
    pending.set(req.id, { request: req, resolve });
    taskBus.emit(taskId, {
      type: 'approval.requested',
      taskId,
      ts: Date.now(),
      approvalId: req.id,
      tool,
      args,
      diff,
    } as never);
    bus.emit('changed');

    const onAbort = () => {
      pending.delete(req.id);
      reject(new Error('aborted'));
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export function decideApproval(id: string, decision: ApprovalDecision): boolean {
  const p = pending.get(id);
  if (!p) return false;
  pending.delete(id);

  getDb()
    .update(approvals)
    .set({ decision, decidedAt: Date.now() })
    .where(eq(approvals.id, id))
    .run();

  if (decision === 'approve_session') {
    let set = taskAllow.get(p.request.taskId);
    if (!set) {
      set = new Set<ToolName>();
      taskAllow.set(p.request.taskId, set);
    }
    set.add(p.request.tool);
  }

  updateTask(p.request.taskId, { status: 'running' });

  taskBus.emit(p.request.taskId, {
    type: 'approval.decided',
    taskId: p.request.taskId,
    ts: Date.now(),
    approvalId: id,
    decision,
  } as never);
  bus.emit('changed');

  p.resolve(decision === 'deny' ? 'deny' : 'approve');
  return true;
}

export function listPending(): ApprovalRequestRecord[] {
  return Array.from(pending.values()).map((p) => p.request);
}

export function listPendingForTask(taskId: string): ApprovalRequestRecord[] {
  return Array.from(pending.values())
    .filter((p) => p.request.taskId === taskId)
    .map((p) => p.request);
}

/** Called when a task ends — clear any in-memory state for it. */
export function clearTaskApprovals(taskId: string): void {
  taskAllow.delete(taskId);
  for (const [id, p] of pending) {
    if (p.request.taskId === taskId) {
      pending.delete(id);
      p.resolve('deny');
    }
  }
  // Also clear pending user-input requests for this task
  for (const [id, u] of pendingUserInputs) {
    if (u.taskId === taskId) {
      pendingUserInputs.delete(id);
      u.resolve('');
    }
  }
}

/**
 * Mark all DB approval rows still in 'pending' state as 'stale'.
 * Called once on app startup — these approvals can never be resolved because
 * the in-memory promise that was waiting for them died with the previous process.
 */
export function clearStaleApprovals(): void {
  getDb()
    .update(approvals)
    .set({ decision: 'stale', decidedAt: Date.now() })
    .where(eq(approvals.decision, 'pending'))
    .run();
}

/* ───────── User Input Requests ───────── */

interface PendingUserInput {
  taskId: string;
  resolve: (answer: string) => void;
}

const pendingUserInputs = new Map<string, PendingUserInput>();

/**
 * Block until the user provides a text response.
 * Similar to `requestApproval` but returns a string answer.
 */
export function requestUserInput(
  taskId: string,
  question: string,
  opts?: { description?: string; choices?: string[]; allowMultiple?: boolean },
  signal?: AbortSignal,
): Promise<string> {
  const requestId = nanoid(10);

  return new Promise<string>((resolve, reject) => {
    pendingUserInputs.set(requestId, { taskId, resolve });
    taskBus.emit(taskId, {
      type: 'user_input.requested',
      taskId,
      ts: Date.now(),
      requestId,
      question,
      description: opts?.description,
      choices: opts?.choices,
      allowMultiple: opts?.allowMultiple,
    } as never);
    bus.emit('changed');

    const onAbort = () => {
      pendingUserInputs.delete(requestId);
      reject(new Error('aborted'));
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export function respondUserInput(id: string, answer: string): boolean {
  const p = pendingUserInputs.get(id);
  if (!p) return false;
  pendingUserInputs.delete(id);

  taskBus.emit(p.taskId, {
    type: 'user_input.responded',
    taskId: p.taskId,
    ts: Date.now(),
    requestId: id,
    answer,
  } as never);
  bus.emit('changed');

  p.resolve(answer);
  return true;
}
