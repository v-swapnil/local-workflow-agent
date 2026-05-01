import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import {
  workspaceStatus,
  workspaceDiff,
  showFileAtHead,
  fileDiff,
  currentBranch,
  createBranch,
  commitAll,
} from '../services/git.js';
import { getSetting, setSetting, SETTING_KEYS } from '../services/settings.js';

const workspaceIn = z.object({ workspaceId: z.string().min(1) });

export const gitRouter = router({
  status: publicProcedure
    .input(workspaceIn)
    .query(({ input }) => workspaceStatus(input.workspaceId)),
  diff: publicProcedure
    .input(workspaceIn.extend({ staged: z.boolean().optional() }))
    .query(({ input }) => workspaceDiff(input.workspaceId, !!input.staged)),
  showFileAtHead: publicProcedure
    .input(workspaceIn.extend({ path: z.string().min(1) }))
    .query(({ input }) => showFileAtHead(input.workspaceId, input.path)),
  fileDiff: publicProcedure
    .input(workspaceIn.extend({ path: z.string().min(1), staged: z.boolean().optional() }))
    .query(({ input }) => fileDiff(input.workspaceId, input.path, !!input.staged)),
  currentBranch: publicProcedure
    .input(workspaceIn)
    .query(({ input }) => currentBranch(input.workspaceId)),
  createBranch: publicProcedure
    .input(workspaceIn.extend({ name: z.string().min(1).max(120) }))
    .mutation(({ input }) => createBranch(input.workspaceId, input.name)),
  commitAll: publicProcedure
    .input(workspaceIn.extend({ message: z.string().min(1).max(500) }))
    .mutation(({ input }) => commitAll(input.workspaceId, input.message)),
  autoBranch: publicProcedure.query(async () => {
    return (await getSetting(SETTING_KEYS.GIT_AUTO_BRANCH)) === '1';
  }),
  setAutoBranch: publicProcedure
    .input(z.object({ value: z.boolean() }))
    .mutation(async ({ input }) => {
      await setSetting(SETTING_KEYS.GIT_AUTO_BRANCH, input.value ? '1' : '0');
      return { ok: true as const };
    }),
});
