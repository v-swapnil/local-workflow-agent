import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import {
  createSession,
  listSessions,
  getSession,
  renameSession,
  deleteSession,
} from '@main/services/workspaces';
import { listSessionMemories } from '@main/services/memories.js';
import { getWorktreeForSession } from '@main/services/worktrees.js';

export const sessionRouter = router({
  create: publicProcedure
    .input(
      z.object({
        workspaceId: z.number(),
        title: z.string().min(1),
        context: z.string().optional(),
      }),
    )
    .mutation(({ input }) => createSession(input.workspaceId, input.title)),

  list: publicProcedure
    .input(z.object({ workspaceId: z.number().optional() }).optional())
    .query(({ input }) => listSessions(input?.workspaceId)),

  get: publicProcedure.input(z.object({ id: z.number() })).query(({ input }) => {
    const session = getSession(input.id);
    const worktree = getWorktreeForSession(input.id);
    const memory = listSessionMemories(input.id);
    return { ...session, worktree: worktree ?? undefined, memory };
  }),

  rename: publicProcedure
    .input(z.object({ id: z.number(), title: z.string().min(1) }))
    .mutation(({ input }) => {
      renameSession(input.id, input.title);
      return { ok: true as const };
    }),

  memories: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(({ input }) => listSessionMemories(input.sessionId)),

  delete: publicProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    deleteSession(input.id);
    return { ok: true as const };
  }),
});
