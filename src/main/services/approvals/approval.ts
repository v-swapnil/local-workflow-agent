import { ToolName } from '@shared/agent.js';
import { getSetting, SETTING_KEYS } from '../settings.js';
import { ApprovalRequestRecord } from '@shared/schema';
import { nanoid } from 'nanoid';
import { getDb } from '@main/db/index.js';
import { approvals } from '@main/db/schema.js';
import { updateTask } from '../workspaces/index.js';
import { emitApprovalRequested, emitApprovalDecided } from '@main/orchestrator/eventEmitter.js';
import { eq } from 'drizzle-orm';
import { pendingApprovals, pendingUserInputs } from './state.js';
import { ApprovalStatus } from '@shared/types.js';

export async function isAutoApprove(): Promise<boolean> {
  return (await getSetting(SETTING_KEYS.AUTO_APPPROVE_TOOLS)) === 'true';
}

/**
 * Block until the user approves (or denies) a tool call.
 * Persists the request so the UI can show pending approvals across reloads.
 */
export async function requestApproval(
  taskId: string,
  tool: ToolName,
  args: Record<string, unknown>,
  signal?: AbortSignal,
  toolCallId?: string,
): Promise<ApprovalStatus> {
  if (await isAutoApprove()) return 'approved';

  const req: ApprovalRequestRecord = {
    id: nanoid(10),
    taskId,
    tool,
    args,
    toolCallId,
    createdAt: Date.now(),
  };

  getDb()
    .insert(approvals)
    .values({
      id: req.id,
      taskId,
      toolCallId: toolCallId ?? null,
      toolName: tool,
      decision: 'pending',
      createdAt: req.createdAt,
      decidedAt: null,
    })
    .run();

  updateTask(taskId, { status: 'awaiting_approval' });

  return new Promise<ApprovalStatus>((resolve, reject) => {
    pendingApprovals.set(req.id, { request: req, resolve });
    emitApprovalRequested(taskId, req.id);

    const onAbort = () => {
      pendingApprovals.delete(req.id);
      reject(new Error('aborted'));
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export function decideApproval(id: string, decision: ApprovalStatus): boolean {
  const p = pendingApprovals.get(id);
  if (!p) return false;
  pendingApprovals.delete(id);

  getDb()
    .update(approvals)
    .set({ decision, decidedAt: Date.now() })
    .where(eq(approvals.id, id))
    .run();

  updateTask(p.request.taskId, { status: 'running' });

  emitApprovalDecided(p.request.taskId, id, decision);

  p.resolve(decision);

  return true;
}

export function listPending(): ApprovalRequestRecord[] {
  return Array.from(pendingApprovals.values()).map((p) => p.request);
}

export function listPendingForTask(taskId: string): ApprovalRequestRecord[] {
  return Array.from(pendingApprovals.values())
    .filter((p) => p.request.taskId === taskId)
    .map((p) => p.request);
}

/** Called when a task ends — clear any in-memory state for it. */
export function clearTaskApprovals(taskId: string): void {
  for (const [id, p] of pendingApprovals) {
    if (p.request.taskId === taskId) {
      pendingApprovals.delete(id);
      p.resolve('denied');
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
