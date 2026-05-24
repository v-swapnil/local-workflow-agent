import { BrowserWindow, dialog } from 'electron';
import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import {
  listWorkspaces,
  getWorkspace,
  createManagedWorkspace,
  attachExistingWorkspace,
  deleteWorkspace,
  fileTree,
  readWorkspaceFile,
  writeWorkspaceFile,
  renameWorkspaceFile,
  deleteWorkspacePath,
  readTextFileFromRoot,
} from '../services/workspaces.js';
import { getSetting, setSetting, SETTING_KEYS } from '../services/settings.js';
import { getWorktree } from '../services/worktrees.js';

export const workspaceRouter = router({
  list: publicProcedure.query(() => listWorkspaces()),
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => getWorkspace(input.id)),
  create: publicProcedure
    .input(z.object({ name: z.string().min(1).max(64) }))
    .mutation(({ input }) => createManagedWorkspace(input.name)),
  openExisting: publicProcedure.mutation(async () => {
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const res = await (parent
      ? dialog.showOpenDialog(parent, {
          title: 'Open existing folder as workspace',
          properties: ['openDirectory', 'createDirectory'],
        })
      : dialog.showOpenDialog({
          title: 'Open existing folder as workspace',
          properties: ['openDirectory', 'createDirectory'],
        }));
    if (res.canceled || !res.filePaths[0]) return null;
    return attachExistingWorkspace(res.filePaths[0]);
  }),
  delete: publicProcedure
    .input(z.object({ id: z.string(), deleteFiles: z.boolean().default(false) }))
    .mutation(({ input }) => deleteWorkspace(input.id, input.deleteFiles)),
  active: publicProcedure.query(async () => {
    const id = await getSetting(SETTING_KEYS.ACTIVE_WORKSPACE);
    return id ?? null;
  }),
  setActive: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    await setSetting(SETTING_KEYS.ACTIVE_WORKSPACE, input.id);
    return { ok: true };
  }),
});

export const fileRouter = router({
  tree: publicProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        path: z.string().default(''),
        depth: z.number().int().min(1).max(8).default(4),
      }),
    )
    .query(({ input }) => fileTree(input.workspaceId, input.path, input.depth)),
  read: publicProcedure
    .input(z.object({ workspaceId: z.string(), path: z.string() }))
    .query(({ input }) => readWorkspaceFile(input.workspaceId, input.path)),
  readForWorktree: publicProcedure
    .input(
      z.object({ workspaceId: z.string(), path: z.string(), worktreeId: z.string().optional() }),
    )
    .query(async ({ input }) => {
      if (!input.worktreeId) return readWorkspaceFile(input.workspaceId, input.path);
      const wt = getWorktree(input.worktreeId);
      if (!wt || wt.workspaceId !== input.workspaceId || wt.status !== 'active') {
        return readWorkspaceFile(input.workspaceId, input.path);
      }
      return readTextFileFromRoot(wt.path, input.path);
    }),
  write: publicProcedure
    .input(z.object({ workspaceId: z.string(), path: z.string(), content: z.string() }))
    .mutation(async ({ input }) => {
      await writeWorkspaceFile(input.workspaceId, input.path, input.content);
      return { ok: true, savedAt: Date.now() };
    }),
  rename: publicProcedure
    .input(z.object({ workspaceId: z.string(), from: z.string(), to: z.string() }))
    .mutation(async ({ input }) => {
      await renameWorkspaceFile(input.workspaceId, input.from, input.to);
      return { ok: true };
    }),
  delete: publicProcedure
    .input(z.object({ workspaceId: z.string(), path: z.string() }))
    .mutation(async ({ input }) => {
      await deleteWorkspacePath(input.workspaceId, input.path);
      return { ok: true };
    }),
});
