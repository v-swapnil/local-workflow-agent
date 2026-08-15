import { z } from 'zod';
import { getWorkspace, readSourceFile } from '../workspaces';
import { safeJoin } from '../../util/safePath.js';
import { grep } from '../grep.js';
import {
  detectLanguage,
  parseOutline,
  parseImports,
  parseExports,
  findSymbolNodes,
  findReferenceNodes,
} from '../codesearch/parser.js';
import type { Tool } from './types.js';
import { DefinitionResult, FileOutline, ReferenceResult } from '../codesearch/types';
import { ToolResultV2 } from '@shared/types';

const MAX_DEFS = 10;
const MAX_REFS = 100;
const MAX_CANDIDATE_FILES = 100;

async function grepCandidatePaths(
  root: string,
  symbol: string,
  path: string | undefined,
): Promise<string[]> {
  const result = await grep(root, {
    pattern: symbol,
    isRegex: false,
    caseSensitive: true,
    path: path,
    include: '**/*.{ts,tsx,js,jsx,mjs,cjs,py}',
  });
  return [...new Set(result.files.map((h) => h.path))].slice(0, MAX_CANDIDATE_FILES);
}

// ─── outline_file ──────────────────────────────────────────────────────────────

export const outlineFileTool: Tool<{ path: string }, ToolResultV2> = {
  name: 'outline_file',
  description:
    'Summarize the structure of a single workspace file in one call. Returns:\n' +
    '- symbols: all named symbols (functions, classes, methods, interfaces, types, ' +
    'enums, exported variables) with kind, exported flag, and line range.\n' +
    '- imports: ES import statements with source module and imported identifiers ' +
    '(CommonJS require() is not parsed).\n' +
    '- exports: exported symbols with kind, line, and whether each is a re-export.\n' +
    "Use this to understand a file's structure and dependencies without reading its " +
    'full content. Trace an import to its source module, then call outline_file on that ' +
    'module to see what it provides.',
  schema: z.object({ path: z.string().min(1).describe('File path relative to workspace root.') }),
  needsApproval: false,
  run: async ({ path }, ctx) => {
    const ws = await getWorkspace(ctx.workspaceId);
    const lang = detectLanguage(path);
    const source = lang ? await readSourceFile(safeJoin(ws.path, path)) : null;
    const outline =
      lang && source
        ? {
            symbols: parseOutline(source, lang),
            imports: parseImports(source, lang),
            exports: parseExports(source, lang),
          }
        : { symbols: [], imports: [], exports: [] };
    return {
      status: 'success',
      truncated: false,
      content: outline as unknown as Record<string, unknown>,
    };
  },
};

// ─── find_symbol ──────────────────────────────────────────────────────────────

export const findSymbolTool: Tool<{ symbol: string; path?: string }, ToolResultV2> = {
  name: 'find_symbol',
  description:
    'Find where a named symbol (function, class, type, interface, variable) is defined ' +
    'across the workspace. Returns the file path, line number, the definition ' +
    'signature, and whether it is exported. Performs exact name matching — not substring.',
  schema: z.object({
    symbol: z.string().min(1).describe('Exact symbol name to find (case-sensitive).'),
    path: z.string().optional().describe('Narrow search to this directory (workspace-relative).'),
  }),
  needsApproval: false,
  run: async ({ symbol, path }, ctx) => {
    const ws = await getWorkspace(ctx.workspaceId);
    const candidatePaths = await grepCandidatePaths(ws.path, symbol, path);
    const results: DefinitionResult[] = [];

    for (const relPath of candidatePaths) {
      if (results.length >= MAX_DEFS) break;
      const lang = detectLanguage(relPath);
      if (!lang) continue;
      const source = await readSourceFile(safeJoin(ws.path, relPath));
      if (!source) continue;
      for (const hit of findSymbolNodes(source, symbol, lang)) {
        if (results.length >= MAX_DEFS) break;
        results.push({
          path: relPath,
          line: hit.line,
          content: hit.content,
        });
      }
    }

    return {
      status: 'success',
      truncated: false,
      content: results as unknown as Record<string, unknown>,
    };
  },
};

// ─── find_references ──────────────────────────────────────────────────────────

export const findReferencesTool: Tool<{ symbol: string; path?: string }, ToolResultV2> = {
  name: 'find_references',
  description:
    'Find all usages of a named symbol across the workspace. Uses grep to locate ' +
    'candidate files, then tree-sitter to filter to real identifier nodes (excluding ' +
    'string literals and comments). Includes call sites, import bindings, and property ' +
    'accesses like obj.foo.',
  schema: z.object({
    symbol: z.string().min(1).describe('Exact symbol name to find (case-sensitive).'),
    path: z.string().optional().describe('Narrow search to this directory (workspace-relative).'),
  }),
  needsApproval: false,
  run: async ({ symbol, path }, ctx) => {
    const ws = await getWorkspace(ctx.workspaceId);
    const candidatePaths = await grepCandidatePaths(ws.path, symbol, path);
    const results: ReferenceResult[] = [];

    for (const relPath of candidatePaths) {
      if (results.length >= MAX_REFS) break;
      const lang = detectLanguage(relPath);
      if (!lang) continue;
      const source = await readSourceFile(safeJoin(ws.path, relPath));
      if (!source) continue;
      for (const hit of findReferenceNodes(source, symbol, lang)) {
        if (results.length >= MAX_REFS) break;
        results.push({ path: relPath, line: hit.line, content: hit.content });
      }
    }

    return {
      status: 'success',
      truncated: false,
      content: results as unknown as Record<string, unknown>,
    };
  },
};
