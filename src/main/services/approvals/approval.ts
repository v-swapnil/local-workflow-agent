import { ToolName } from '@shared/agent.js';
import { getSetting, SETTING_KEYS } from '../settings.js';
import { getDb } from '@main/db/index.js';
import { approvals, toolCalls } from '@main/db/schema.js';
import { updateTask } from '../workspaces/index.js';
import { emitApprovalRequested, emitApprovalDecided } from '@main/orchestrator/eventEmitter.js';
import { eq, and } from 'drizzle-orm';
import { pendingRegistry } from './state.js';
import { ApprovalStatus } from '@shared/types.js';
import { ApprovalRecord } from '@shared/schema.js';
import { getToolCallByToolCallId } from '../store.js';

export const isAutoApprove = async (): Promise<boolean> => {
  return (await getSetting(SETTING_KEYS.AUTO_APPPROVE_TOOLS)) === 'true';
};

const createPendingApproval = (taskId: number, toolCallId: number | null, toolName: string) => {
  return getDb()
    .insert(approvals)
    .values({
      taskId,
      toolCallId,
      toolName,
      decision: 'pending',
      createdAt: Date.now(),
      decidedAt: null,
    })
    .returning()
    .get();
};

const updateApprovalDecision = (id: number, decision: ApprovalStatus) => {
  return getDb()
    .update(approvals)
    .set({ decision, decidedAt: Date.now() })
    .where(eq(approvals.id, id))
    .returning()
    .get();
};

/**
 * Block until the user approves (or denies) a tool call.
 * Persists the request so the UI can show pending approvals across reloads.
 */
export const requestApproval = async (
  taskId: number,
  toolCallId: string | null,
  toolName: ToolName | 'workflow_approval',
  signal?: AbortSignal,
): Promise<ApprovalStatus> => {
  if (await isAutoApprove()) return 'approved';

  const toolCall = toolCallId ? getToolCallByToolCallId(taskId, toolCallId) : null;
  const result = createPendingApproval(taskId, toolCall?.id ?? null, toolName);

  updateTask(taskId, { status: 'awaiting_approval' });

  return new Promise<ApprovalStatus>((resolve, reject) => {
    pendingRegistry.add({
      type: 'approval',
      taskId,
      referenceId: result.id,
      resolve: (value) => resolve(value === 'approved' ? 'approved' : 'denied'),
    });
    emitApprovalRequested(taskId, result.id);

    const onAbort = () => {
      pendingRegistry.remove('approval', result.id);
      reject(new Error('aborted'));
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
};

export function decideApproval(id: number, decision: ApprovalStatus): boolean {
  const resolved = pendingRegistry.resolve('approval', id, decision);
  if (!resolved) return false;

  const row = updateApprovalDecision(id, decision);
  updateTask(row.taskId, { status: 'running' });
  emitApprovalDecided(row.taskId, id, decision);

  return true;
}

export function listPending(): ApprovalRecord[] {
  return getDb().select().from(approvals).where(eq(approvals.decision, 'pending')).all();
}

export function listPendingForTask(taskId: number): ApprovalRecord[] {
  return getDb()
    .select()
    .from(approvals)
    .where(and(eq(approvals.decision, 'pending'), eq(approvals.taskId, taskId)))
    .all();
}

// Full detail for a single approval, including the requested tool's arguments.
export function getApproval(id: number) {
  const approval = getDb().select().from(approvals).where(eq(approvals.id, id)).get();
  if (!approval) return null;

  const toolCall = approval.toolCallId
    ? getDb().select().from(toolCalls).where(eq(toolCalls.id, approval.toolCallId)).get()
    : null;

  return {
    id: approval.id,
    taskId: approval.taskId,
    toolName: approval.toolName,
    args: toolCall?.arguments ? JSON.parse(toolCall.arguments) : null,
    createdAt: approval.createdAt,
  };
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
