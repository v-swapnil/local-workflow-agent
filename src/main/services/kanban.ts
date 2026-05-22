import { KanbanLane, TaskStatus } from '@shared/types';

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
