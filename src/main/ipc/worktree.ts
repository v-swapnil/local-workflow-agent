import { z } from 'zod';
import { shell } from 'electron';
import { router, publicProcedure } from './trpc.js';
import {
  listWorktrees,
  getWorktree,
  getWorktreeForSession,
  removeWorktree,
  deleteWorktreeRecord,
} from '../services/worktrees.js';
import { getSetting, SETTING_KEYS } from '../services/settings.js';
import { getWorkspace } from '../services/workspaces';

export const worktreeRouter = router({
  list: publicProcedure.query(async () => {
    const wsId = await getSetting(SETTING_KEYS.ACTIVE_WORKSPACE);
    if (!wsId) return [];
    try {
      await getWorkspace(Number(wsId)); // validate it still exists
    } catch {
      return [];
    }
    return listWorktrees(Number(wsId));
  }),

  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getWorktree(input.id)),

  getForSession: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(({ input }) => getWorktreeForSession(input.sessionId)),

  remove: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await removeWorktree(input.id);
      return { ok: true as const };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteWorktreeRecord(input.id);
      return { ok: true as const };
    }),

  openPath: publicProcedure
    .input(z.object({ path: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await shell.openPath(input.path);
      return { ok: true as const };
    }),
});
