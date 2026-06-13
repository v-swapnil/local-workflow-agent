import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import { buildKanbanBoard, listIssues } from '@main/services/kanban';
import { KanbanCard } from '@shared/types.js';
import { setSessionKanbanLane } from '@main/services/store.js';

export const kanbanRouter = router({
  board: publicProcedure
    .input(z.object({ workspaceId: z.string().optional() }).optional())
    .query(({ input }): KanbanCard[] => buildKanbanBoard(input?.workspaceId ?? '')),

  setLane: publicProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        lane: z.enum(['todo', 'in_progress', 'done', 'need_help']).nullable(),
      }),
    )
    .mutation(({ input }) => {
      setSessionKanbanLane(input.sessionId, input.lane);
      return { ok: true };
    }),

  listIssues: publicProcedure.query(() => listIssues()),
});
