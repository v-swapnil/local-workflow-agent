import { z } from 'zod';
import { fileTree, readWorkspaceFile, writeWorkspaceFile, getWorkspace } from '../workspaces.js';
import type { ReadFileResult } from '../workspaces.js';
import { safeJoin } from '../../util/safePath.js';
import { planPatch } from '../../util/patch.js';
import { readFileSync, existsSync } from 'node:fs';
import { grep } from '../grep.js';
import { glob } from '../glob.js';
import type { Tool } from './types.js';
import { writeWorkspaceFile as writeWS, deleteWorkspacePath } from '../workspaces.js';

export const readFileTool: Tool<
  { path: string; startLine?: number; endLine?: number },
  ReadFileResult
> = {
  name: 'read_file',
  description:
    'Read a UTF-8 text file from the workspace. ' +
    'Use startLine (1-based, inclusive) and endLine (1-based, inclusive) to read a specific range. ' +
    'Omitting both reads up to the first 2000 lines. ' +
    'Use the grep tool to find content in large files. Call in parallel when reading multiple files.',
  schema: z.object({
    path: z.string().min(1),
    startLine: z.number().int().min(1).optional().describe('First line to read (1-based, inclusive).'),
    endLine: z.number().int().min(1).optional().describe('Last line to read (1-based, inclusive).'),
  }),
  needsApproval: false,
  run: async ({ path, startLine, endLine }, ctx) => readWorkspaceFile(ctx.workspaceId, path, startLine, endLine),
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
  { pattern: string; path?: string; include?: string },
  unknown
> = {
  name: 'grep',
  description:
    'Search file contents in the workspace for a regex pattern. ' +
    'Returns matching lines with file paths and line numbers.',
  schema: z.object({
    pattern: z.string().min(1).describe('The regex pattern to search for in file contents.'),
    path: z.string().optional().describe('Directory to search in (relative to workspace root). Defaults to workspace root.'),
    include: z.string().optional().describe('File glob to include (e.g. "*.ts", "*.{ts,tsx}").'),
  }),
  needsApproval: false,
  run: async (args, ctx) => {
    const ws = await getWorkspace(ctx.workspaceId);
    return grep(ws.path, {
      pattern: args.pattern,
      isRegex: true,
      caseSensitive: false,
      rel: args.path,
      include: args.include,
    });
  },
};

export const globTool: Tool<
  { pattern: string; path?: string },
  { files: string[]; count: number; truncated: boolean }
> = {
  name: 'glob',
  description:
    'Search for files by name pattern in the workspace. ' +
    'Returns matching file paths sorted by modification time (most recent first).',
  schema: z.object({
    pattern: z.string().min(1).describe('Glob pattern to match files (e.g. "**/*.ts", "src/**/*.test.*").'),
    path: z.string().optional().describe('Directory to search in (relative to workspace root). Defaults to workspace root.'),
  }),
  needsApproval: false,
  run: async (args, ctx) => {
    const ws = await getWorkspace(ctx.workspaceId);
    return glob(ws.path, { pattern: args.pattern, rel: args.path });
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

export const editTool: Tool<
  { path: string; oldString: string; newString: string; replaceAll?: boolean },
  { ok: true }
> = {
  name: 'edit',
  description:
    'Replace an exact string in a file. The oldString must appear in the file ' +
    '(exactly once unless replaceAll is true). Use an empty oldString to append to the file.',
  schema: z.object({
    path: z.string().min(1).describe('File path relative to workspace root.'),
    oldString: z.string().describe('The exact text to find and replace.'),
    newString: z.string().describe('The replacement text (must differ from oldString).'),
    replaceAll: z.boolean().optional().describe('Replace all occurrences (default false).'),
  }),
  needsApproval: true,
  run: async ({ path, oldString, newString, replaceAll }, ctx) => {
    if (oldString === newString) throw new Error('oldString and newString are identical');
    const ws = await getWorkspace(ctx.workspaceId);
    const abs = safeJoin(ws.path, path);
    if (!existsSync(abs)) {
      if (oldString === '') {
        // Create new file
        await writeWS(ctx.workspaceId, path, newString);
        return { ok: true as const };
      }
      throw new Error(`file not found: ${path}`);
    }
    const content = readFileSync(abs, 'utf8');
    if (oldString === '') {
      // Append
      await writeWS(ctx.workspaceId, path, content + newString);
      return { ok: true as const };
    }
    if (!content.includes(oldString)) {
      throw new Error('oldString not found in file');
    }
    if (!replaceAll) {
      const first = content.indexOf(oldString);
      const second = content.indexOf(oldString, first + 1);
      if (second !== -1) {
        throw new Error(
          'oldString appears multiple times. Provide more context to make it unique, or set replaceAll=true.',
        );
      }
    }
    const updated = replaceAll
      ? content.replaceAll(oldString, newString)
      : content.replace(oldString, newString);
    await writeWS(ctx.workspaceId, path, updated);
    return { ok: true as const };
  },
};
