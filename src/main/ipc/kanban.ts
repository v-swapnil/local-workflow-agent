import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import { buildKanbanBoard, listIssues } from '@main/services/kanban';
import { KanbanCard } from '@shared/types.js';

export const kanbanRouter = router({
  board: publicProcedure
    .input(z.object({ workspaceId: z.number().optional() }).optional())
    .query(({ input }): KanbanCard[] => buildKanbanBoard(input?.workspaceId || 0)),

  listIssues: publicProcedure.query(() => listIssues()),
});
