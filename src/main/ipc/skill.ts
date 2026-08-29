import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import {
  listSkills,
  getSkillById,
  setSkillEnabled,
  revealSkillInOS,
  syncSkills,
} from '../services/skills';

export const skillRouter = router({
  list: publicProcedure.query(() => listSkills()),

  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getSkillById(input.id)),

  toggle: publicProcedure
    .input(z.object({ id: z.number(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      await setSkillEnabled(input.id, input.enabled);
      return { ok: true as const };
    }),

  refresh: publicProcedure.mutation(() => syncSkills()),

  reveal: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await revealSkillInOS(input.id);
      return { ok: true as const };
    }),
});
