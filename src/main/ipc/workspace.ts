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
} from '../services/workspaces';
import { getSetting, setSetting, SETTING_KEYS } from '../services/settings.js';
import { listWorkspaceFiles } from '@main/services/workspaces/workspaceFiles.js';
import { listWorkspaceMemories, deleteMemory } from '../services/memories.js';
import { grep } from '../services/grep.js';
import { glob } from '../services/glob.js';

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
  memories: publicProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(({ input }) => listWorkspaceMemories(input.workspaceId)),
  deleteMemory: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => {
      deleteMemory(input.id);
      return { ok: true };
    }),
  searchFiles: publicProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        query: z.string().min(1),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    )
    .query(async ({ input }) => {
      const ws = await getWorkspace(input.workspaceId);
      return glob(ws.path, { pattern: `**/*${input.query}*`, limit: input.limit ?? 50 });
    }),
  searchContent: publicProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        query: z.string().min(1),
        limit: z.number().int().min(1).max(500).optional(),
      }),
    )
    .query(async ({ input }) => {
      const ws = await getWorkspace(input.workspaceId);
      return grep(ws.path, {
        pattern: input.query,
        isRegex: false,
        caseSensitive: false,
        maxHits: input.limit ?? 100,
        context: 0,
      });
    }),
});

export const fileRouter = router({
  files: publicProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(({ input }) => listWorkspaceFiles({ workspaceId: input.workspaceId })),
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
