import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { getWorkspace } from '../workspaces.js';
import { safeJoin } from '../../util/safePath.js';
import { grep } from '../grep.js';
import {
  detectLanguage,
  parseOutline,
  parseImports,
  findSymbolNodes,
  findReferenceNodes,
  type OutlineSymbol,
  type ImportEntry,
  type DefinitionResult,
  type ReferenceResult,
} from '../codesearch/parser.js';
import type { Tool } from './types.js';

const MAX_DEFS = 10;
const MAX_REFS = 100;
const MAX_CANDIDATE_FILES = 100;
// High cap — we only use file paths from grep hits, not the individual lines
const GREP_CANDIDATE_HITS = 5000;

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function readSourceFile(absPath: string): Promise<string | null> {
  try {
    return await readFile(absPath, 'utf8');
  } catch {
    return null;
  }
}

async function grepCandidatePaths(
  root: string,
  symbol: string,
  path: string | undefined,
): Promise<string[]> {
  const hits = await grep(root, {
    pattern: symbol,
    isRegex: false,
    caseSensitive: true,
    rel: path,
    include: '**/*.{ts,tsx,js,jsx,mjs,cjs,py}',
    maxHits: GREP_CANDIDATE_HITS,
  });
  return [...new Set(hits.map((h) => h.path))].slice(0, MAX_CANDIDATE_FILES);
}

// ─── list_symbols ──────────────────────────────────────────────────────────────

export const listSymbolsTool: Tool<{ path: string }, OutlineSymbol[]> = {
  name: 'list_symbols',
  description:
    'Return all named symbols (functions, classes, methods, interfaces, types, enums, ' +
    'exported variables) in a workspace file. Each entry includes name, kind, parent ' +
    "class name, and line range. Use this to understand a file's structure without " +
    'reading its full content.',
  schema: z.object({ path: z.string().min(1) }),
  needsApproval: false,
  run: async ({ path }, ctx) => {
    const ws = await getWorkspace(ctx.workspaceId);
    const lang = detectLanguage(path);
    if (!lang) return [];
    const source = await readSourceFile(safeJoin(ws.path, path));
    if (!source) return [];
    return parseOutline(source, lang);
  },
};

// ─── list_imports ──────────────────────────────────────────────────────────────

export const listImportsTool: Tool<{ path: string }, ImportEntry[]> = {
  name: 'list_imports',
  description:
    'List all ES import statements in a workspace file. Returns the source module ' +
    'and the named identifiers imported. Use this to understand dependencies and trace ' +
    'where a symbol comes from, then call find_symbol on the source module. ' +
    'Note: CommonJS require() is not parsed in v1.',
  schema: z.object({ path: z.string().min(1) }),
  needsApproval: false,
  run: async ({ path }, ctx) => {
    const ws = await getWorkspace(ctx.workspaceId);
    const lang = detectLanguage(path);
    if (!lang) return [];
    const source = await readSourceFile(safeJoin(ws.path, path));
    if (!source) return [];
    return parseImports(source, lang);
  },
};

// ─── find_symbol ──────────────────────────────────────────────────────────────

export const findSymbolTool: Tool<
  { symbol: string; path?: string },
  DefinitionResult[]
> = {
  name: 'find_symbol',
  description:
    'Find where a named symbol (function, class, type, interface, variable) is defined ' +
    'across the workspace. Returns the file path, line number, the definition ' +
    'signature, and whether it is exported. Performs exact name matching — not substring.',
  schema: z.object({
    symbol: z.string().min(1).describe('Exact symbol name to find (case-sensitive).'),
    path: z
      .string()
      .optional()
      .describe('Narrow search to this directory (workspace-relative).'),
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
        results.push({ path: relPath, line: hit.line, signature: hit.signature, exported: hit.exported });
      }
    }

    return results;
  },
};

// ─── find_references ──────────────────────────────────────────────────────────

export const findReferencesTool: Tool<
  { symbol: string; path?: string },
  ReferenceResult[]
> = {
  name: 'find_references',
  description:
    'Find all usages of a named symbol across the workspace. Uses grep to locate ' +
    'candidate files, then tree-sitter to filter to real identifier nodes (excluding ' +
    'string literals and comments). Includes call sites, import bindings, and property ' +
    'accesses like obj.foo.',
  schema: z.object({
    symbol: z.string().min(1).describe('Exact symbol name to find (case-sensitive).'),
    path: z
      .string()
      .optional()
      .describe('Narrow search to this directory (workspace-relative).'),
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
        results.push({ path: relPath, line: hit.line, text: hit.text });
      }
    }

    return results;
  },
};

