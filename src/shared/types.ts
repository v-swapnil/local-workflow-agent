// Domain types shared across processes. Expanded in later phases.

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type AgentRole = 'planner' | 'executor' | 'tester' | 'critic';
export type StepStatus = 'pending' | 'running' | 'ok' | 'error' | 'skipped';

export interface AppHealth {
  app: { name: string; version: string };
  db: { ok: boolean; path: string };
  ollama: { ok: boolean; url: string; models?: string[] };
}

// ───────── Kanban ─────────

export type KanbanLane = 'todo' | 'in_progress' | 'done' | 'need_help';

export function deriveKanbanLane(taskStatuses: TaskStatus[]): KanbanLane {
  if (taskStatuses.length === 0) return 'todo';

  const hasAwaiting = taskStatuses.includes('awaiting_approval');
  const hasFailed = taskStatuses.includes('failed');
  const hasCancelled = taskStatuses.includes('cancelled');
  const hasRunning = taskStatuses.includes('running');
  const hasQueued = taskStatuses.includes('queued');
  const allSucceeded = taskStatuses.every((s) => s === 'succeeded');

  if (hasAwaiting || hasFailed || hasCancelled) return 'need_help';
  if (hasRunning || hasQueued) return 'in_progress';
  if (allSucceeded) return 'done';
  return 'todo';
}

export interface KanbanCard {
  sessionId: string;
  title: string;
  workspaceId: string;
  lane: KanbanLane;
  manualLane: KanbanLane | null;
  taskSummary: {
    total: number;
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    awaitingApproval: number;
    cancelled: number;
  };
  lastActivity: number;
  createdAt: number;
}

export interface WorktreeRecord {
  id: string;
  workspaceId: string;
  sessionId: string | null;
  branch: string;
  path: string;
  baseBranch: string;
  baseCommit: string;
  status: 'active' | 'removed';
  createdAt: number;
}
