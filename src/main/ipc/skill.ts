import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import {
  listSkills,
  getSkillByName,
  setSkillEnabled,
  createSkill,
  deleteSkill,
  revealSkillInOS,
  syncSkills,
} from '../services/skills';

export const skillRouter = router({
  list: publicProcedure.query(() => listSkills()),

  get: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(({ input }) => getSkillByName(input.name)),

  toggle: publicProcedure
    .input(z.object({ name: z.string().min(1), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      await setSkillEnabled(input.name, input.enabled);
      return { ok: true as const };
    }),

  refresh: publicProcedure.mutation(() => syncSkills()),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        whenToUse: z.string().optional(),
        tags: z.array(z.string()).optional(),
        body: z.string().optional(),
      }),
    )
    .mutation(({ input }) => createSkill(input)),

  delete: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await deleteSkill(input.name);
      return { ok: true as const };
    }),

  reveal: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await revealSkillInOS(input.name);
      return { ok: true as const };
    }),
});
