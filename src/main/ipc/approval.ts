import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import {
  decideApproval,
  getApproval,
  getUserInput,
  isAutoApprove,
  listPending,
  listPendingForTask,
  respondUserInput,
} from '../services/approvals/index.js';
import { setSetting, SETTING_KEYS } from '@main/services/settings.js';

export const approvalRouter = router({
  pending: publicProcedure
    .input(z.object({ taskId: z.number().optional() }).optional())
    .query(({ input }) => (input?.taskId ? listPendingForTask(input.taskId) : listPending())),

  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getApproval(input.id)),

  decide: publicProcedure
    .input(z.object({ id: z.number(), decision: z.enum(['pending', 'approved', 'denied']) }))
    .mutation(({ input }) => ({ ok: decideApproval(input.id, input.decision) })),

  autoApprove: publicProcedure.query(() => isAutoApprove()),

  setAutoApprove: publicProcedure
    .input(z.object({ value: z.boolean() }))
    .mutation(async ({ input }) => {
      await setSetting(SETTING_KEYS.AUTO_APPPROVE_TOOLS, input.value ? 'true' : 'false');
      return { ok: true as const };
    }),

  getUserInput: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getUserInput(input.id)),

  respondUserInput: publicProcedure
    .input(z.object({ id: z.number(), answer: z.string() }))
    .mutation(({ input }) => ({ ok: respondUserInput(input.id, input.answer) })),
});
