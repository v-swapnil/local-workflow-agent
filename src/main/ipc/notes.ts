import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import * as notesService from '../services/notes.js';

export const notesRouter = router({
  listCollections: publicProcedure.query(() => notesService.listCollections()),

  createCollection: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(({ input }) => notesService.createCollection(input.name)),

  deleteCollection: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => {
      notesService.deleteCollection(input.id);
      return { ok: true as const };
    }),

  list: publicProcedure.query(() => notesService.listNotes()),

  get: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ input }) => notesService.getNote(input.id)),

  create: publicProcedure
    .input(z.object({ collectionId: z.string().min(1) }))
    .mutation(({ input }) => notesService.createNote(input.collectionId)),

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
