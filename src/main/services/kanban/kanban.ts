import { KanbanLane, TaskStatus } from '@shared/types';
import { listSessions, listTasks } from '../workspaces';

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

export function buildKanbanBoard(workspaceId: string) {
  const allSessions = listSessions(workspaceId);
  return allSessions.map((session) => {
    const tasks = listTasks(session.id);
    const statuses = tasks.map((task) => task.status as TaskStatus);
    const autoLane = deriveKanbanLane(statuses);
    return {
      sessionId: session.id,
      title: session.title,
      workspaceId: session.workspaceId,
      lane: (session.kanbanLane as KanbanLane) ?? autoLane,
      manualLane: (session.kanbanLane as KanbanLane) ?? null,
      taskSummary: {
        total: tasks.length,
        queued: statuses.filter((st) => st === 'queued').length,
        running: statuses.filter((st) => st === 'running').length,
        succeeded: statuses.filter((st) => st === 'succeeded').length,
        failed: statuses.filter((st) => st === 'failed').length,
        awaitingApproval: statuses.filter((st) => st === 'awaiting_approval').length,
        cancelled: statuses.filter((st) => st === 'cancelled').length,
      },
      lastActivity: Math.max(
        session.updatedAt,
        ...tasks.map((task) => task.finishedAt ?? task.startedAt ?? task.createdAt),
      ),
      createdAt: session.createdAt,
    };
  });
}
