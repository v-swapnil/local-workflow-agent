import { z } from 'zod';
import { fileTree, readWorkspaceFile, writeWorkspaceFile, getWorkspace } from '../workspaces.js';
import { safeJoin } from '../../util/safePath.js';
import { planPatch } from '../../util/patch.js';
import { readFileSync, existsSync } from 'node:fs';
import { grep } from '../grep.js';
import type { Tool } from './types.js';
import { writeWorkspaceFile as writeWS, deleteWorkspacePath } from '../workspaces.js';

export const readFileTool: Tool<
  { path: string },
  { content: string; size: number; truncated: boolean }
> = {
  name: 'read_file',
  description: 'Read a UTF-8 text file from the workspace.',
  schema: z.object({ path: z.string().min(1) }),
  needsApproval: false,
  run: async ({ path }, ctx) => readWorkspaceFile(ctx.workspaceId, path),
};

export const writeFileTool: Tool<{ path: string; content: string }, { ok: true; bytes: number }> = {
  name: 'write_file',
  description: 'Create or overwrite a UTF-8 text file in the workspace.',
  schema: z.object({ path: z.string().min(1), content: z.string() }),
  needsApproval: true,
  run: async ({ path, content }, ctx) => {
    await writeWorkspaceFile(ctx.workspaceId, path, content);
    return { ok: true, bytes: Buffer.byteLength(content, 'utf8') };
  },
};

export const listDirTool: Tool<{ path?: string; depth?: number }, unknown> = {
  name: 'list_dir',
  description: 'Return a directory tree of the workspace (or a sub-path).',
  schema: z.object({
    path: z.string().optional(),
    depth: z.number().int().min(1).max(8).optional(),
  }),
  needsApproval: false,
  run: async ({ path, depth }, ctx) => fileTree(ctx.workspaceId, path ?? '', depth ?? 4),
};

export const grepTool: Tool<
  { pattern: string; isRegex?: boolean; caseSensitive?: boolean; path?: string; maxHits?: number },
  unknown
> = {
  name: 'grep',
  description: 'Search file contents in the workspace for a substring or regex.',
  schema: z.object({
    pattern: z.string().min(1),
    isRegex: z.boolean().optional(),
    caseSensitive: z.boolean().optional(),
    path: z.string().optional(),
    maxHits: z.number().int().min(1).max(2000).optional(),
  }),
  needsApproval: false,
  run: async (args, ctx) => {
    const ws = await getWorkspace(ctx.workspaceId);
    return grep(ws.path, {
      pattern: args.pattern,
      isRegex: args.isRegex,
      caseSensitive: args.caseSensitive,
      rel: args.path,
      maxHits: args.maxHits,
    });
  },
};

export const applyPatchTool: Tool<
  { patch: string },
  { applied: { path: string; isNew: boolean; isDelete: boolean }[] }
> = {
  name: 'apply_patch',
  description: 'Apply a unified diff to one or more files in the workspace.',
  schema: z.object({ patch: z.string().min(1) }),
  needsApproval: true,
  run: async ({ patch }, ctx) => {
    const ws = await getWorkspace(ctx.workspaceId);
    const planned = planPatch(patch, (rel) => {
      const abs = safeJoin(ws.path, rel);
      if (!existsSync(abs)) return null;
      return readFileSync(abs, 'utf8');
    });
    const applied: { path: string; isNew: boolean; isDelete: boolean }[] = [];
    for (const change of planned) {
      if (change.isDelete) {
        await deleteWorkspacePath(ctx.workspaceId, change.path);
      } else {
        await writeWS(ctx.workspaceId, change.path, change.content);
      }
      applied.push({ path: change.path, isNew: change.isNew, isDelete: change.isDelete });
    }
    return { applied };
  },
};
