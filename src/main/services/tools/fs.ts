import { z } from 'zod';
import { fileTree, readWorkspaceFile, writeWorkspaceFile, getWorkspace, deleteWorkspacePath } from '../workspaces';
import type { ReadFileResult } from '../workspaces';
import { safeJoin } from '../../util/safePath.js';
import { planPatch } from '../../util/patch.js';
import { readFileSync, existsSync } from 'node:fs';
import { grep } from '../grep.js';
import type { GrepResult } from '../grep.js';
import { glob } from '../glob.js';
import type { Tool } from './types.js';

export const readFileTool: Tool<{ path: string; offset?: number; limit?: number }, ReadFileResult> =
  {
    name: 'read_file',
    description:
      'Read a UTF-8 text file from the workspace. Returns file content with size and line metadata.\n\n' +
      'Parameters:\n' +
      '- offset: 1-based start line (default: 1)\n' +
      '- limit: number of lines to read (default: 2000, max output: 50 KB)\n\n' +
      'Tips:\n' +
      '- Use grep to find relevant lines in large files before reading specific ranges\n' +
      '- Call read_file in parallel when reading multiple files\n' +
      '- Binary files (images, executables) return an error — use run_shell for those\n' +
      '- For files >2000 lines, use offset to paginate (offset=N to continue from line N)',
    schema: z.object({
      path: z.string().min(1),
      offset: z.number().int().min(1).optional().describe('Start line (1-based, inclusive).'),
      limit: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Number of lines to read from offset (default 2000).'),
    }),
    needsApproval: false,
    run: async ({ path, offset, limit }, ctx) =>
      readWorkspaceFile(ctx.workspaceId, path, offset, limit),
  };

export const writeFileTool: Tool<{ path: string; content: string }, { ok: true; bytes: number }> = {
  name: 'write_file',
  description:
    'Create or overwrite a UTF-8 text file in the workspace.\n\n' +
    'WARNING: This completely replaces the file contents. For targeted edits, use edit_file instead.\n' +
    'Parent directories are created automatically if they do not exist.',
  schema: z.object({ path: z.string().min(1), content: z.string() }),
  needsApproval: true,
  run: async ({ path, content }, ctx) => {
    await writeWorkspaceFile(ctx.workspaceId, path, content);
    return { ok: true, bytes: Buffer.byteLength(content, 'utf8') };
  },
};

export const listDirTool: Tool<{ path?: string; depth?: number }, unknown> = {
  name: 'list_dir',
  description:
    'Return a directory tree of the workspace (or a sub-path).\n\n' +
    'Directories are listed first, sorted alphabetically. Ignored: .git, node_modules, .DS_Store, .next, dist, out, .turbo.\n\n' +
    'Parameters:\n' +
    '- path: subdirectory to list (default: workspace root)\n' +
    '- depth: recursion depth 1-8 (default: 4)\n\n' +
    'Tips:\n' +
    '- Use depth=1 for a quick overview of immediate children\n' +
    '- Use depth=2-3 to understand project structure without overwhelming output\n' +
    '- For finding specific files, use glob instead',
  schema: z.object({
    path: z.string().optional(),
    depth: z.number().int().min(1).max(8).optional(),
  }),
  needsApproval: false,
  run: async ({ path, depth }, ctx) => fileTree(ctx.workspaceId, path ?? '', depth ?? 4),
};

export const grepTool: Tool<{ pattern: string; path?: string; include?: string; context?: number }, GrepResult> = {
  name: 'grep',
  description:
    'Search file contents in the workspace for a regex pattern.\n\n' +
    'Returns matching lines with file paths and line numbers. Default limit: 500 matches. ' +
    'Files >512 KB are skipped. Case-insensitive by default.\n\n' +
    'Parameters:\n' +
    '- pattern: regex pattern to search for\n' +
    '- path: subdirectory to search in (default: workspace root)\n' +
    '- include: file glob filter (e.g. "*.ts", "*.{ts,tsx}")\n' +
    '- context: lines before/after each match to include (default: 0)\n\n' +
    'Tips:\n' +
    '- Use include to narrow to specific file types for faster results\n' +
    '- If results are truncated, narrow your pattern or add path/include filters\n' +
    '- For file name search, use glob instead',
  schema: z.object({
    pattern: z.string().min(1).describe('The regex pattern to search for in file contents.'),
    path: z
      .string()
      .optional()
      .describe('Directory to search in (relative to workspace root). Defaults to workspace root.'),
    include: z.string().optional().describe('File glob to include (e.g. "*.ts", "*.{ts,tsx}").'),
    context: z
      .number()
      .int()
      .min(0)
      .max(10)
      .optional()
      .describe('Number of context lines before and after each match (default 0).'),
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
      context: args.context,
    });
  },
};

export const globTool: Tool<
  { pattern: string; path?: string; limit?: number },
  { files: string[]; count: number; truncated: boolean }
> = {
  name: 'glob',
  description:
    'Search for files by name pattern in the workspace.\n\n' +
    'Returns matching file paths sorted by modification time (most recent first). Default limit: 100 results.\n\n' +
    'Parameters:\n' +
    '- pattern: glob pattern (e.g. "**/*.ts", "src/**/*.test.*", "**/schema.*")\n' +
    '- path: subdirectory to search in (default: workspace root)\n' +
    '- limit: max results to return (default: 100, max: 1000)\n\n' +
    'Tips:\n' +
    '- Use "**/" prefix to search recursively\n' +
    '- For content search within files, use grep instead',
  schema: z.object({
    pattern: z
      .string()
      .min(1)
      .describe('Glob pattern to match files (e.g. "**/*.ts", "src/**/*.test.*").'),
    path: z
      .string()
      .optional()
      .describe('Directory to search in (relative to workspace root). Defaults to workspace root.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .describe('Max results to return (default 100).'),
  }),
  needsApproval: false,
  run: async (args, ctx) => {
    const ws = await getWorkspace(ctx.workspaceId);
    return glob(ws.path, { pattern: args.pattern, rel: args.path, limit: args.limit });
  },
};

export const applyPatchTool: Tool<
  { patch: string },
  { applied: { path: string; isNew: boolean; isDelete: boolean }[] }
> = {
  name: 'apply_patch',
  description:
    'Apply a unified diff patch to one or more files in the workspace.\n\n' +
    'Expects standard unified diff format (as produced by `diff -u` or `git diff`). ' +
    'Supports creating new files (old path = /dev/null), deleting files (new path = /dev/null), ' +
    'and modifying existing files.\n\n' +
    'Tips:\n' +
    '- For single-string replacements, prefer edit_file — it is simpler and more reliable\n' +
    '- Use apply_patch for coordinated multi-file changes\n' +
    '- If a patch fails, use read_file to verify the current file content matches your context lines',
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
        await writeWorkspaceFile(ctx.workspaceId, change.path, change.content);
      }
      applied.push({ path: change.path, isNew: change.isNew, isDelete: change.isDelete });
    }
    return { applied };
  },
};

export const editFileTool: Tool<
  { path: string; oldString: string; newString: string; replaceAll?: boolean },
  { ok: true }
> = {
  name: 'edit_file',
  description:
    'Replace an exact string in a file with a new string.\n\n' +
    'IMPORTANT: oldString must match the file content exactly (minor whitespace differences and smart-quote ' +
    'variations are tolerated automatically). Include 3-5 lines of surrounding context to ensure a unique match.\n\n' +
    'Parameters:\n' +
    '- path: file path relative to workspace root\n' +
    '- oldString: text to find (empty string = append to file or create new file)\n' +
    '- newString: replacement text (must differ from oldString)\n' +
    '- replaceAll: replace all occurrences (default: false)\n\n' +
    'Common mistakes:\n' +
    '- Too little context → "oldString appears multiple times"\n' +
    '- Stale content → "oldString not found" (use read_file to verify current content)\n' +
    '- Same old/new → "oldString and newString are identical"',
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
        await writeWorkspaceFile(ctx.workspaceId, path, newString);
        return { ok: true as const };
      }
      throw new Error(`file not found: ${path}`);
    }
    const content = readFileSync(abs, 'utf8');
    if (oldString === '') {
      // Append
      await writeWorkspaceFile(ctx.workspaceId, path, content + newString);
      return { ok: true as const };
    }

    // 1. Try exact match
    if (content.includes(oldString)) {
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
      await writeWorkspaceFile(ctx.workspaceId, path, updated);
      return { ok: true as const };
    }

    // 2. Fuzzy fallback — normalize whitespace/smart-quotes on both sides
    const contentLines = content.split('\n');
    const oldLines = oldString.split('\n');
    const normContentLines = contentLines.map(normalizeLine);
    const normOldLines = oldLines.map(normalizeLine);

    const matchStart = findFuzzyMatch(normContentLines, normOldLines);
    if (matchStart === -1) {
      throw new Error('oldString not found in file');
    }

    if (!replaceAll) {
      // Check for a second fuzzy match
      const second = findFuzzyMatch(normContentLines, normOldLines, matchStart + 1);
      if (second !== -1) {
        throw new Error(
          'oldString appears multiple times (after whitespace normalization). Provide more context to make it unique, or set replaceAll=true.',
        );
      }
      const before = contentLines.slice(0, matchStart).join('\n');
      const after = contentLines.slice(matchStart + oldLines.length).join('\n');
      const parts = [before, newString, after].filter((p, i) => i === 1 || p !== '');
      await writeWorkspaceFile(ctx.workspaceId, path, parts.join('\n'));
      return { ok: true as const };
    }

    // replaceAll with fuzzy — replace all non-overlapping fuzzy matches
    let result = contentLines.slice();
    let normResult = normContentLines.slice();
    let offset = 0;
    let idx = findFuzzyMatch(normResult, normOldLines, 0);
    while (idx !== -1) {
      const newLines = newString.split('\n');
      result = [...result.slice(0, idx + offset), ...newLines, ...result.slice(idx + offset + oldLines.length)];
      normResult = [...normResult.slice(0, idx + offset), ...newLines.map(normalizeLine), ...normResult.slice(idx + offset + oldLines.length)];
      offset += newLines.length - oldLines.length;
      idx = findFuzzyMatch(normResult, normOldLines, idx + newLines.length);
    }
    await writeWorkspaceFile(ctx.workspaceId, path, result.join('\n'));
    return { ok: true as const };
  },
};

/** Normalize a single line for fuzzy matching: smart quotes, dashes, whitespace. */
function normalizeLine(line: string): string {
  return line
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .trimEnd();
}

/**
 * Find the starting index in `haystack` where `needle` lines match (normalized),
 * starting the search from `fromIdx`.  Returns -1 if not found.
 */
function findFuzzyMatch(haystack: string[], needle: string[], fromIdx = 0): number {
  for (let i = fromIdx; i <= haystack.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}
