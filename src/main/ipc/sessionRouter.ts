import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import {
  createSession,
  listSessions,
  getSession,
  renameSession,
  deleteSession,
} from '@main/services/workspaces';
import { addMemory, listSessionMemories } from '@main/services/memories.js';
import { getWorktreeForSession } from '@main/services/worktrees.js';
import { addMessage, listMessages } from '@main/services/store.js';

export const sessionRouter = router({
  create: publicProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        title: z.string().min(1),
        context: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const session = await createSession(input.workspaceId, input.title);
      const context = input.context?.trim();
      if (context) {
        addMemory({
          sessionId: session.id,
          workspaceId: input.workspaceId,
          type: 'fact',
          content: context,
        });
      }
      return session;
    }),

  list: publicProcedure
    .input(z.object({ workspaceId: z.string().optional() }).optional())
    .query(({ input }) => listSessions(input?.workspaceId)),

  get: publicProcedure.input(z.object({ id: z.string().min(1) })).query(({ input }) => {
    const session = getSession(input.id);
    const worktree = getWorktreeForSession(input.id);
    const memory = listSessionMemories(input.id);
    return { ...session, worktree: worktree ?? undefined, memory };
  }),

  rename: publicProcedure
    .input(z.object({ id: z.string().min(1), title: z.string().min(1) }))
    .mutation(({ input }) => {
      renameSession(input.id, input.title);
      return { ok: true as const };
    }),

  memories: publicProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(({ input }) => listSessionMemories(input.sessionId)),

  delete: publicProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ input }) => {
    deleteSession(input.id);
    return { ok: true as const };
  }),

  addMessage: publicProcedure
    .input(
      z.object({
        taskId: z.string().min(1),
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      }),
    )
    .mutation(({ input }) => addMessage(input.taskId, input.role, input.content)),

  messages: publicProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(({ input }) => listMessages(input.sessionId)),
});
