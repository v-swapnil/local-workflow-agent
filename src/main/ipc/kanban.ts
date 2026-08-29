import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import { buildKanbanBoard, listIssues } from '@main/services/kanban';
import { KanbanCard } from '@shared/types.js';

export const kanbanRouter = router({
  board: publicProcedure
    .input(z.object({ workspaceId: z.string().optional() }).optional())
    .query(({ input }): KanbanCard[] => buildKanbanBoard(input?.workspaceId ?? '')),

  listIssues: publicProcedure.query(() => listIssues()),
});
