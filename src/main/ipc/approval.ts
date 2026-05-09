import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import {
  decideApproval,
  isAutoApprove,
  setAutoApprove,
  listPending,
  listPendingForTask,
  respondUserInput,
} from '../services/approvals.js';

export const approvalRouter = router({
  pending: publicProcedure
    .input(z.object({ taskId: z.string().optional() }).optional())
    .query(({ input }) => (input?.taskId ? listPendingForTask(input.taskId) : listPending())),

  decide: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        decision: z.enum(['approve', 'approve_session', 'deny']),
      }),
    )
    .mutation(({ input }) => ({ ok: decideApproval(input.id, input.decision) })),

  autoApprove: publicProcedure.query(() => isAutoApprove()),

  setAutoApprove: publicProcedure
    .input(z.object({ value: z.boolean() }))
    .mutation(async ({ input }) => {
      await setAutoApprove(input.value);
      return { ok: true as const };
    }),

  respondUserInput: publicProcedure
    .input(z.object({ id: z.string().min(1), answer: z.string() }))
    .mutation(({ input }) => ({ ok: respondUserInput(input.id, input.answer) })),
});
