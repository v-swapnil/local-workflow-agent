import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import * as notesService from '../services/notes.js';

export const notesRouter = router({
  list: publicProcedure.query(() => notesService.listNotes()),

  get: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ input }) => notesService.getNote(input.id)),

  create: publicProcedure.mutation(() => notesService.createNote()),

  update: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        title: z.string().optional(),
        content: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(({ input }) => notesService.updateNote(input.id, input)),

  delete: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => {
      notesService.deleteNote(input.id);
      return { ok: true as const };
    }),
});
