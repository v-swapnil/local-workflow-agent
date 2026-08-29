import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import * as notesService from '../services/notes.js';

export const notesRouter = router({
  list: publicProcedure.query(() => notesService.listNotes()),

  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => notesService.getNote(input.id)),

  create: publicProcedure
    .input(
      z
        .object({
          title: z.string().optional(),
          tags: z.array(z.string()).optional(),
        })
        .optional(),
    )
    .mutation(({ input }) => notesService.createNote(input)),

  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        content: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(({ input }) =>
      notesService.updateNote(input.id, { ...input, tags: input.tags?.join(',') }),
    ),

  delete: publicProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    notesService.deleteNote(input.id);
    return { ok: true as const };
  }),
});
