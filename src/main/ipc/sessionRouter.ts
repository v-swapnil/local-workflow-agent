import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import {
  createSession,
  listSessions,
  getSession,
  renameSession,
  deleteSession,
  addMessage,
  listMessages,
  listTasks,
  setSessionKanbanLane,
} from '../services/store.js';
import { listSessionMemories } from '../services/memories.js';
import { getWorktreeForSession } from '../services/worktrees.js';
import { type KanbanCard, type KanbanLane, type TaskStatus } from '@shared/types';
import { deriveKanbanLane } from '../services/kanban.js';

const kanbanLaneSchema = z.enum(['todo', 'in_progress', 'done', 'need_help']);

export const sessionRouter = router({
  create: publicProcedure
    .input(z.object({ workspaceId: z.string().min(1), title: z.string().min(1) }))
    .mutation(async ({ input }) => createSession(input.workspaceId, input.title)),

  list: publicProcedure
    .input(z.object({ workspaceId: z.string().optional() }).optional())
    .query(({ input }) => listSessions(input?.workspaceId)),

  get: publicProcedure.input(z.object({ id: z.string().min(1) })).query(({ input }) => {
    const session = getSession(input.id);
    const worktree = getWorktreeForSession(input.id);
    const memory = listSessionMemories(input.id);
    return { ...session, worktree: worktree ?? undefined, memory };
  }),

  rename: publicProcedure
    .input(z.object({ id: z.string().min(1), title: z.string().min(1) }))
    .mutation(({ input }) => {
      renameSession(input.id, input.title);
      return { ok: true as const };
    }),

  memories: publicProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(({ input }) => listSessionMemories(input.sessionId)),

  delete: publicProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ input }) => {
    deleteSession(input.id);
    return { ok: true as const };
  }),

  addMessage: publicProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
        taskId: z.string().optional(),
      }),
    )
    .mutation(({ input }) => addMessage(input.sessionId, input.role, input.content, input.taskId)),

  messages: publicProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(({ input }) => listMessages(input.sessionId)),

  kanban: publicProcedure
    .input(z.object({ workspaceId: z.string().optional() }).optional())
    .query(({ input }): KanbanCard[] => {
      const allSessions = listSessions(input?.workspaceId);
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
    }),

  setLane: publicProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        lane: kanbanLaneSchema.nullable(),
      }),
    )
    .mutation(({ input }) => {
      setSessionKanbanLane(input.sessionId, input.lane);
      return { ok: true as const };
    }),
});
