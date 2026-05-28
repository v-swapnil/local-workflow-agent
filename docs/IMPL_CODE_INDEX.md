# Persistent Code Index — Implementation Plan

> **Prerequisite:** `IMPL_CODESEARCH_TOOLS.md` (v1) must be implemented first.
> This plan builds on top of the on-demand tree-sitter tools by adding a persistent
> SQLite index that makes them faster.

## Overview

Add a background code indexer that parses workspace files using tree-sitter (already
installed from v1) and stores symbols, imports/exports, and references in a per-workspace
SQLite database. The existing 4 codesearch tools (`list_symbols`, `list_imports`,
`find_symbol`, `find_references`) are upgraded to query the
index when available, falling back to on-demand parsing when the index is building or stale.

**Key wins:**
- `find_symbol("foo")` returns in <5ms from SQLite vs 50-500ms parsing on-demand
- `list_symbols("file.ts")` returns instantly from cached index vs 5-20ms parse per file
- `find_references("foo")` queries the index instead of grep → AST two-phase scan
- Planner burns fewer tool calls on navigation → more budget for deeper exploration
- Agent token usage drops ~90% per search (structured data vs raw file contents)

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Parser | Native tree-sitter (reuse from v1) | Already installed, working, electron-rebuilt |
| Languages | TS, TSX, JS, JSX, Python | Same as v1 |
| Symbol detail | Declarations + imports/exports | Enough for navigation. Full call-graph deferred. |
| Index granularity | Location + signature (declaration line) | Agent sees function signatures without reading files |
| References | Name-based (all identifier/property_identifier nodes) | May have false positives; LLM filters from context |
| Storage | Separate SQLite DB per workspace | Clean isolation. Delete workspace = delete DB. |
| DB location | `<workspace>/.ase/index.db` | Visible, inspectable. Auto-gitignored. |
| Staleness | SHA-256 content hash per file | Re-index only changed files. Stale flag in tool output. |
| Indexing cadence | Non-blocking initial + 5-min poll + re-index on agent writes | Balanced CPU vs freshness |
| Indexer execution | Worker thread (`worker_threads`) | Non-blocking. Parsing is CPU-bound. |
| Tool strategy | Upgrade existing 4 tools in-place | No new tools. Same interface, faster backend. |
| Query matching | Glob-style (`*` wildcards) for `find_symbol` | Agent can search `grep*` to find `grep`, `grepTool`, etc. |
| Tool output | Include `indexStatus` field | LLM knows whether to trust results or fall back to grep |
| Planner integration | All tools always available + index status in env context | LLM decides when to use grep vs index tools |
| Limits | 10k files, 512KB/file, skip generated patterns | Prevents runaway indexing on massive repos |
| Gitignore | Auto-add `.ase/` to `.gitignore` + `DEFAULT_IGNORE` | Invisible to grep/glob/list_dir and git |

---

## SQLite Schema

The index DB is a **separate SQLite file** from the main app database.
One index DB per workspace, stored at `<workspace_root>/.ase/index.db`.

```sql
-- ─── Table: indexed_files ─────────────────────────────────────────────────────
-- Tracks which files have been indexed and their content hash for staleness detection.

CREATE TABLE IF NOT EXISTS indexed_files (
  id           TEXT PRIMARY KEY,           -- nanoid
  path         TEXT NOT NULL UNIQUE,       -- workspace-relative, forward slashes
  language     TEXT NOT NULL,              -- 'typescript' | 'tsx' | 'javascript' | 'python'
  content_hash TEXT NOT NULL,              -- SHA-256 hex of file content
  indexed_at   INTEGER NOT NULL            -- epoch ms
);

CREATE INDEX IF NOT EXISTS idx_files_path ON indexed_files(path);

-- ─── Table: symbols ──────────────────────────────────────────────────────────
-- Declarations: functions, classes, interfaces, types, enums, methods, variables.

CREATE TABLE IF NOT EXISTS symbols (
  id           TEXT PRIMARY KEY,           -- nanoid
  file_id      TEXT NOT NULL REFERENCES indexed_files(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL,              -- 'function' | 'class' | 'method' | 'interface' | 'type' | 'enum' | 'variable'
  signature    TEXT,                        -- declaration line text (max 200 chars)
  start_line   INTEGER NOT NULL,           -- 1-based
  end_line     INTEGER NOT NULL,           -- 1-based, inclusive
  exported     INTEGER NOT NULL DEFAULT 0, -- 0 or 1
  parent_name  TEXT                        -- null for top-level; class name for methods
);

CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);
CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);

-- ─── Table: references ───────────────────────────────────────────────────────
-- Every identifier/property_identifier usage of a symbol name across the workspace.
-- Name-based (not scope-resolved). May include false positives for common names.

CREATE TABLE IF NOT EXISTS refs (
  id           TEXT PRIMARY KEY,           -- nanoid
  file_id      TEXT NOT NULL REFERENCES indexed_files(id) ON DELETE CASCADE,
  symbol_name  TEXT NOT NULL,              -- the identifier text
  line         INTEGER NOT NULL,           -- 1-based
  context      TEXT                        -- trimmed source line (max 200 chars)
);

CREATE INDEX IF NOT EXISTS idx_refs_name ON refs(symbol_name);
CREATE INDEX IF NOT EXISTS idx_refs_file ON refs(file_id);
```

**Size estimates** (3k-file TS project):
- `indexed_files`: ~3k rows, ~200KB
- `symbols`: ~15-25k rows, ~2-4MB
- `refs`: ~100-300k rows, ~15-40MB
- **Total: ~20-45MB** per workspace

---

## File Layout

```
src/
  main/
    services/
      codesearch/
        parser.ts              ← EXISTS (from v1): tree-sitter parsing logic
        index-db.ts            ← NEW: index SQLite setup, schema, queries
        indexer.ts             ← NEW: indexing logic (runs in worker thread)
        indexer-worker.ts      ← NEW: worker thread entry point
        index-manager.ts       ← NEW: manages worker lifecycle, polling, status
      tools/
        codesearch.ts          ← EDIT: upgrade tools to query index with fallback
        registry.ts            ← (no changes — tools already registered from v1)
      workspaces.ts            ← EDIT: init/teardown index on workspace create/delete
      grep.ts                  ← EDIT: add '.ase' to DEFAULT_IGNORE
    orchestrator/
      graph.ts                 ← EDIT: trigger re-index after tool execution (write tools)
      prompts.ts               ← EDIT: add index status to env context
  shared/
    constants.ts               ← EDIT: add index-related constants
```

---

## Step-by-Step Implementation

---

### Step 1 — Add constants and shared types

**Edit `src/shared/constants.ts`:**

```ts
// ── Code index ──
export const INDEX_DIR = '.ase';
export const INDEX_DB_NAME = 'index.db';
export const INDEX_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const INDEX_MAX_FILES = 10_000;
export const INDEX_MAX_FILE_BYTES = 512 * 1024; // 512 KB
export const INDEX_SKIP_PATTERNS = [
  '*.min.js',
  '*.min.css',
  '*.bundle.js',
  '*.generated.*',
  '*.d.ts',        // declaration files are derived
  'dist/**',
  'build/**',
  'out/**',
  '.next/**',
  'coverage/**',
];
```

**Add type to `src/shared/types.ts` (or `agent.ts`):**

```ts
export type IndexStatus = 'ready' | 'building' | 'stale' | 'disabled';
```

---

### Step 2 — Add `.ase` to ignore patterns

**Edit `src/main/services/grep.ts`** — add `'**/.ase/**'` to `DEFAULT_IGNORE`:

```diff
 const DEFAULT_IGNORE = [
   '**/.git/**',
   '**/node_modules/**',
+  '**/.ase/**',
   '**/.DS_Store',
   // ... rest unchanged
 ];
```

**Edit `src/main/services/codesearch/parser.ts`** — add to `IGNORE_PATTERNS`:

```diff
 const IGNORE_PATTERNS = [
   '**/.git/**', '**/node_modules/**', '**/.DS_Store',
+  '**/.ase/**',
   '**/.next/**', '**/dist/**', '**/out/**', '**/.turbo/**',
   // ... rest unchanged
 ];
```

**Edit `src/main/services/workspaces.ts`** — add `'.ase'` to the ignore list used
by `fileTree()` (if separate from grep's list).

---

### Step 3 — Create `src/main/services/codesearch/index-db.ts`

This module manages the per-workspace index SQLite database.

```ts
// index-db.ts — per-workspace index database
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import { INDEX_DIR, INDEX_DB_NAME } from '@shared/constants';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS indexed_files ( ... );  -- as defined above
  CREATE TABLE IF NOT EXISTS symbols ( ... );
  CREATE TABLE IF NOT EXISTS refs ( ... );
  -- indexes as defined above
`;

/** Open (or create) the index DB for a workspace root path. */
export function openIndexDb(workspacePath: string): Database.Database {
  const dir = join(workspacePath, INDEX_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, INDEX_DB_NAME);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  return db;
}

/** Close and optionally delete the index DB. */
export function closeIndexDb(db: Database.Database): void { db.close(); }

/** Delete all index data (for full rebuild). */
export function clearIndex(db: Database.Database): void {
  db.exec('DELETE FROM refs; DELETE FROM symbols; DELETE FROM indexed_files;');
}
```

**Query functions** (also in this file):

```ts
/** Get file record by path. Returns null if not indexed. */
export function getIndexedFile(db, path: string);

/** Upsert a file record. Returns the file id. */
export function upsertFile(db, id, path, language, contentHash);

/** Delete all symbols and refs for a file (before re-indexing). */
export function clearFileData(db, fileId: string);

/** Insert symbols in batch. */
export function insertSymbols(db, fileId: string, symbols: SymbolRow[]);

/** Insert refs in batch. */
export function insertRefs(db, fileId: string, refs: RefRow[]);

/** Query symbols by name (glob-style: * wildcards → LIKE). */
export function querySymbols(db, namePattern: string, kind?: string, limit?: number);

/** Query symbols by file path. */
export function querySymbolsByFile(db, filePath: string, kind?: string);

/** Query refs by symbol name. */
export function queryRefs(db, symbolName: string, filePath?: string, limit?: number);

/** Query imports/exports by file. */
export function queryImportsByFile(db, filePath: string);

/** Get index stats (file count, symbol count, ref count, last indexed). */
export function getIndexStats(db);
```

**Glob-to-LIKE conversion:**
```ts
function globToLike(pattern: string): string {
  // 'grep*' → 'grep%'
  // '*Handler' → '%Handler'
  // 'parse*File' → 'parse%File'
  return pattern.replace(/\*/g, '%');
}
```

When `namePattern` contains no `*`, use exact match (`WHERE name = ?`).
When it contains `*`, convert to LIKE (`WHERE name LIKE ?`).

---

### Step 4 — Create `src/main/services/codesearch/indexer.ts`

Core indexing logic. This module is imported by both the worker thread and (for
single-file re-indexing) the main process.

```ts
// indexer.ts — file parsing and index population

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { nanoid } from 'nanoid';
import {
  detectLanguage,
  parseOutline,
  parseImports,
  findReferenceNodes,
} from './parser.js';
import {
  getIndexedFile,
  upsertFile,
  clearFileData,
  insertSymbols,
  insertRefs,
} from './index-db.js';

export function contentHash(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

/**
 * Index a single file. Skips if content hash hasn't changed.
 * Returns true if the file was (re-)indexed, false if skipped.
 */
export async function indexFile(db, workspacePath, relPath): Promise<boolean> {
  const lang = detectLanguage(relPath);
  if (!lang) return false;

  const absPath = join(workspacePath, relPath);
  let source: string;
  try { source = await readFile(absPath, 'utf8'); } catch { return false; }

  const hash = contentHash(source);
  const existing = getIndexedFile(db, relPath);
  if (existing && existing.content_hash === hash) return false; // unchanged

  // Parse structure (symbols + imports)
  const outline = parseOutline(source, lang);
  const imports = parseImports(source, lang);

  // Collect all references (every identifier in the file)
  // We extract unique symbol names from the outline and scan for their references
  const allSymbolNames = new Set(outline.map(s => s.name));
  // Also scan for ALL identifiers to build a comprehensive reference index
  const refEntries = extractAllIdentifiers(source, lang);

  const fileId = existing?.id ?? nanoid(10);

  // Transaction: clear old data, upsert file, insert new data
  db.transaction(() => {
    if (existing) clearFileData(db, fileId);
    upsertFile(db, fileId, relPath, lang, hash);

    // Insert symbols from outline
    insertSymbols(db, fileId, outline.map(s => ({
      id: nanoid(10),
      name: s.name,
      kind: s.kind,
      signature: extractSignatureFromOutline(s, source),
      startLine: s.startLine,
      endLine: s.endLine,
      exported: s.exported ? 1 : 0,
      parentName: s.parentName,
    })));

    // Insert import entries as symbols with kind='import'
    // (stored in symbols table with kind='import' for unified querying)
    for (const imp of imports) {
      for (const name of imp.names) {
        insertSymbols(db, fileId, [{
          id: nanoid(10),
          name: name === '*' ? imp.source : name,
          kind: 'import',
          signature: `import { ${imp.names.join(', ')} } from '${imp.source}'`,
          startLine: 0, // imports don't have meaningful line ranges in index
          endLine: 0,
          exported: 0,
          parentName: imp.source, // overload: stores the import source module
        }]);
      }
    }

    // Insert references
    insertRefs(db, fileId, refEntries.map(r => ({
      id: nanoid(10),
      symbolName: r.name,
      line: r.line,
      context: r.text.slice(0, 200),
    })));
  })();

  return true;
}

/**
 * Extract ALL identifier and property_identifier nodes from a file.
 * Returns deduplicated by line (at most one per symbol name per line).
 */
function extractAllIdentifiers(source, lang) {
  // Reuse tree-sitter: parse, walk all nodes, collect identifier nodes
  // Same logic as findReferenceNodes but for ALL identifiers, not filtered by name
  // ... implementation ...
}
```

**Full workspace indexing:**

```ts
/**
 * Index all supported files in a workspace.
 * Yields progress callbacks for the manager to relay to the UI.
 * Respects INDEX_MAX_FILES and INDEX_MAX_FILE_BYTES limits.
 * Skips INDEX_SKIP_PATTERNS (minified, generated, etc.).
 */
export async function indexWorkspace(
  db,
  workspacePath: string,
  onProgress?: (indexed: number, total: number) => void,
  signal?: AbortSignal,
): Promise<{ indexed: number; skipped: number; total: number }> {
  // 1. Enumerate files (fast-glob, same patterns as parser.ts but with higher limit)
  // 2. For each file, call indexFile() — skip if hash unchanged
  // 3. Remove indexed_files entries for files that no longer exist on disk
  // 4. Report progress
}
```

---

### Step 5 — Create `src/main/services/codesearch/indexer-worker.ts`

Worker thread entry point. Receives messages from the main process, runs indexing,
sends results back.

```ts
// indexer-worker.ts — worker_threads entry point
import { parentPort, workerData } from 'node:worker_threads';
import { openIndexDb, closeIndexDb } from './index-db.js';
import { indexWorkspace, indexFile } from './indexer.js';

// Message types:
// { type: 'index-workspace', workspacePath: string }
// { type: 'index-file', workspacePath: string, relPath: string }
// { type: 'shutdown' }

parentPort?.on('message', async (msg) => {
  switch (msg.type) {
    case 'index-workspace': {
      const db = openIndexDb(msg.workspacePath);
      try {
        const result = await indexWorkspace(db, msg.workspacePath, (indexed, total) => {
          parentPort?.postMessage({ type: 'progress', indexed, total });
        });
        parentPort?.postMessage({ type: 'done', ...result });
      } finally {
        closeIndexDb(db);
      }
      break;
    }

    case 'index-file': {
      const db = openIndexDb(msg.workspacePath);
      try {
        const reindexed = await indexFile(db, msg.workspacePath, msg.relPath);
        parentPort?.postMessage({ type: 'file-done', relPath: msg.relPath, reindexed });
      } finally {
        closeIndexDb(db);
      }
      break;
    }

    case 'shutdown':
      process.exit(0);
  }
});
```

**Note on `better-sqlite3` in worker threads:** `better-sqlite3` is safe to use in
worker threads as long as each thread opens its own connection. The WAL journal mode
allows concurrent readers with one writer. The worker thread opens its own `Database`
instance — it does NOT share the main process's connection.

---

### Step 6 — Create `src/main/services/codesearch/index-manager.ts`

Manages the worker thread lifecycle, polling interval, and exposes the index status
to the rest of the app.

```ts
// index-manager.ts — manages index worker, polling, and status

import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { INDEX_POLL_INTERVAL_MS } from '@shared/constants';
import { openIndexDb, getIndexStats, querySymbols, querySymbolsByFile, queryRefs } from './index-db.js';
import type { IndexStatus } from '@shared/types';
import { logger } from '../logger.js';

const log = logger.child({ mod: 'code-index' });

interface WorkspaceIndex {
  workspacePath: string;
  worker: Worker | null;
  status: IndexStatus;
  pollTimer: ReturnType<typeof setInterval> | null;
  db: ReturnType<typeof openIndexDb> | null;
}

const indexes = new Map<string, WorkspaceIndex>(); // keyed by workspace ID

/**
 * Start indexing a workspace. Called when a workspace becomes active.
 * Non-blocking — returns immediately, indexing runs in background worker.
 */
export function startIndex(workspaceId: string, workspacePath: string): void {
  if (indexes.has(workspaceId)) return; // already started

  const entry: WorkspaceIndex = {
    workspacePath,
    worker: null,
    status: 'building',
    pollTimer: null,
    db: null,
  };
  indexes.set(workspaceId, entry);

  // Open a read-only connection for queries from the main thread
  entry.db = openIndexDb(workspacePath);

  // Spawn worker for initial full index
  spawnWorker(entry, { type: 'index-workspace', workspacePath });

  // Start periodic poll
  entry.pollTimer = setInterval(() => {
    if (entry.status !== 'building') {
      spawnWorker(entry, { type: 'index-workspace', workspacePath });
    }
  }, INDEX_POLL_INTERVAL_MS);

  log.info({ workspaceId, workspacePath }, 'code index started');
}

/**
 * Stop indexing a workspace. Called when workspace is deactivated or deleted.
 */
export function stopIndex(workspaceId: string): void {
  const entry = indexes.get(workspaceId);
  if (!entry) return;
  if (entry.pollTimer) clearInterval(entry.pollTimer);
  if (entry.worker) entry.worker.postMessage({ type: 'shutdown' });
  if (entry.db) entry.db.close();
  indexes.delete(workspaceId);
  log.info({ workspaceId }, 'code index stopped');
}

/**
 * Trigger re-index of a single file (called after agent writes).
 */
export function reindexFile(workspaceId: string, relPath: string): void {
  const entry = indexes.get(workspaceId);
  if (!entry) return;
  const { workspacePath } = entry;
  spawnWorker(entry, { type: 'index-file', workspacePath, relPath });
}

/**
 * Get current index status for a workspace.
 */
export function getIndexStatus(workspaceId: string): IndexStatus {
  return indexes.get(workspaceId)?.status ?? 'disabled';
}

/**
 * Query the index. Returns null if index is not available.
 * Callers should fall back to on-demand parsing.
 */
export function queryIndex(workspaceId: string) {
  const entry = indexes.get(workspaceId);
  if (!entry?.db) return null;
  return {
    status: entry.status,
    db: entry.db,
  };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function spawnWorker(entry: WorkspaceIndex, message: unknown): void {
  // If a worker is already running, queue the message or skip
  if (entry.worker) return;

  const workerPath = join(__dirname, 'indexer-worker.js');
  entry.worker = new Worker(workerPath);
  entry.status = 'building';

  entry.worker.on('message', (msg) => {
    if (msg.type === 'done') {
      entry.status = 'ready';
      entry.worker?.terminate();
      entry.worker = null;
      log.info({ indexed: msg.indexed, skipped: msg.skipped }, 'index build complete');
    } else if (msg.type === 'file-done') {
      entry.worker?.terminate();
      entry.worker = null;
      // Status stays 'ready' after single-file re-index
    } else if (msg.type === 'progress') {
      // Could relay to UI via event bus
    }
  });

  entry.worker.on('error', (err) => {
    log.error({ err }, 'index worker error');
    entry.status = 'stale';
    entry.worker = null;
  });

  entry.worker.postMessage(message);
}
```

---

### Step 7 — Auto-add `.ase` to `.gitignore`

Add a utility function called when the index DB directory is first created:

```ts
// In index-manager.ts or a utility module

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ensure `.ase` is listed in the workspace's .gitignore.
 * Creates .gitignore if it doesn't exist. Appends if .ase is not already ignored.
 */
export function ensureGitignore(workspacePath: string): void {
  const gitignorePath = join(workspacePath, '.gitignore');
  const entry = '.ase/';

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf8');
    if (content.includes(entry) || content.includes('.ase')) return; // already ignored
    // Append with a newline guard
    const separator = content.endsWith('\n') ? '' : '\n';
    writeFileSync(gitignorePath, content + separator + entry + '\n', 'utf8');
  } else {
    writeFileSync(gitignorePath, entry + '\n', 'utf8');
  }
}
```

Called in `startIndex()` right after `openIndexDb()`.

---

### Step 8 — Upgrade codesearch tools to use the index

**Edit `src/main/services/tools/codesearch.ts`:**

Each tool gains:
1. An `indexStatus` field in its output
2. Index query path (fast) with fallback to on-demand parsing (current v1 behavior)

**Pattern for each tool:**

```ts
import { queryIndex, getIndexStatus } from '../codesearch/index-manager.js';
import { querySymbols, querySymbolsByFile, queryRefs } from '../codesearch/index-db.js';

// Example: list_symbols upgrade
export const listSymbolsTool: Tool<{ path: string }, { symbols: OutlineSymbol[]; indexStatus: IndexStatus }> = {
  name: 'list_symbols',
  description: '...same as v1, plus: Returns indexStatus field indicating index freshness.',
  schema: z.object({ path: z.string().min(1) }),
  needsApproval: false,
  run: async ({ path }, ctx) => {
    const ws = await getWorkspace(ctx.workspaceId);
    const indexStatus = getIndexStatus(ctx.workspaceId);
    const idx = queryIndex(ctx.workspaceId);

    // Try index first
    if (idx && idx.status === 'ready') {
      const symbols = querySymbolsByFile(idx.db, path);
      if (symbols.length > 0) {
        return { symbols, indexStatus };
      }
    }

    // Fallback: on-demand parsing (v1 behavior)
    const abs = safeJoin(ws.path, path);
    const lang = detectLanguage(path);
    if (!lang) return { symbols: [], indexStatus };
    let source: string;
    try { source = await readFile(abs, 'utf8'); } catch { return { symbols: [], indexStatus }; }
    return { symbols: parseOutline(source, lang), indexStatus };
  },
};
```

**Specific changes per tool:**

| Tool | Index query | Fallback |
|---|---|---|
| `list_symbols` | `querySymbolsByFile(db, path)` | `parseOutline()` (v1) |
| `list_imports` | `querySymbolsByFile(db, path, 'import')` | `parseImports()` (v1) |
| `find_symbol` | `querySymbols(db, namePattern, kind)` with glob-to-LIKE | grep→AST two-phase (v1) |
| `find_references` | `queryRefs(db, symbolName, file)` | grep→AST two-phase (v1) |

**Glob matching for `find_symbol`:**

Update the schema to document wildcard support:

```ts
schema: z.object({
  symbol: z.string().min(1).describe(
    'Symbol name to find. Supports * wildcards (e.g. "grep*" matches grepTool, GrepHit). '
    + 'Case-sensitive exact match when no wildcards.'
  ),
  path: z.string().optional(),
}),
```

When the name contains `*`, use LIKE query. Otherwise, exact match.
The on-demand fallback (v1) does NOT support glob matching — it only works when the
index is ready. Tool output includes a note if glob was requested but index isn't ready.

---

### Step 9 — Trigger re-index on agent writes

**Edit `src/main/orchestrator/graph.ts`:**

In `executeToolCalls()`, after a write tool completes successfully, trigger re-indexing
of the affected file(s).

```ts
import { reindexFile } from '../services/codesearch/index-manager.js';

// Inside executeToolCalls(), after invokeOne returns for a write tool:
if (result.ok && ['write_file', 'edit'].includes(tool)) {
  const relPath = (args as { path?: string }).path;
  if (relPath) reindexFile(ctx.workspaceId, relPath);
}

// For apply_patch, re-index each affected file:
if (result.ok && tool === 'apply_patch') {
  const applied = result.output as { applied?: { path: string }[] };
  if (applied?.applied) {
    for (const f of applied.applied) {
      reindexFile(ctx.workspaceId, f.path);
    }
  }
}
```

---

### Step 10 — Add index status to environment context

**Edit `src/main/orchestrator/prompts.ts`:**

Add index status to `EnvironmentContext`:

```diff
 export interface EnvironmentContext {
   directory: string;
   worktree: string;
   isGitRepo: boolean;
   platform: string;
   shell: string | null;
   model: string;
+  indexStatus: 'ready' | 'building' | 'stale' | 'disabled';
   git: { ... };
 }
```

**In `formatEnvContext()`:**

```diff
   `  Model: ${env.model}`,
   `  Today's date: ${new Date().toDateString()}`,
+  `  Code index: ${env.indexStatus}`,
```

**In `gatherEnvContext()` (graph.ts):**

```diff
+ import { getIndexStatus } from '../services/codesearch/index-manager.js';

  return {
    directory: ctx.workspacePath,
    worktree,
    isGitRepo,
    platform: platform(),
    shell: process.env.SHELL ?? null,
    model: ctx.model,
+   indexStatus: getIndexStatus(ctx.workspaceId),
    git: { branch, changedFiles },
  };
```

**Update planner system prompt** — add guidance for index-aware tool usage:

```diff
 - Call multiple tools in parallel when you need independent pieces of information.
+- The code index status is shown in the environment context.
+  If the index is "ready", list_symbols/find_symbol/find_references query the
+  index instantly. find_symbol supports * wildcards (e.g. "parse*").
+  If the index is "building", these tools fall back to on-demand parsing (slower
+  but still functional). Use grep for text patterns that aren't symbol names.
```

---

### Step 11 — Start/stop index on workspace activation

**Edit `src/main/services/workspaces.ts` (or the workspace IPC layer):**

When a workspace becomes active, start its index. When deactivated, stop it.

```ts
import { startIndex, stopIndex } from './codesearch/index-manager.js';

// In setActiveWorkspace or equivalent:
export function activateWorkspace(workspaceId: string, workspacePath: string): void {
  // Stop previous workspace index (if any)
  const prevId = getSetting(SETTING_KEYS.ACTIVE_WORKSPACE);
  if (prevId) stopIndex(prevId);

  // Start new workspace index
  startIndex(workspaceId, workspacePath);
}

// In deleteWorkspace:
export function deleteWorkspace(id: string, alsoDeleteFiles: boolean): void {
  stopIndex(id);
  // ... existing deletion logic ...
}
```

---

### Step 12 — Verify

```bash
# TypeScript type checking
pnpm typecheck

# Ensure the app starts without errors
pnpm dev

# Manual verification checklist:
# 1. Open a workspace → .ase/index.db is created
# 2. .gitignore is updated with .ase/
# 3. list_dir / grep / glob do NOT show .ase/ directory
# 4. find_symbol("someFunction") returns results from index (check logs)
# 5. Edit a file → index re-indexes that file within seconds
# 6. Wait 5 min → poll re-indexes changed files
# 7. Kill Ollama → tools fall back to on-demand parsing
```

---

## Sequence Diagrams

### Initial index build (workspace open)

```
Main Process                    Worker Thread
    │                               │
    ├─ startIndex(wsId, path) ─────►│
    │   open read-only DB conn      │
    │   spawn Worker                │
    │   ├─ postMessage(index-ws) ──►│
    │   │                           ├─ open write DB conn
    │   │                           ├─ enumerate files (fast-glob)
    │   │                           ├─ for each file:
    │   │                           │   ├─ hash → skip if unchanged
    │   │                           │   ├─ parse (tree-sitter)
    │   │                           │   ├─ extract symbols + refs
    │   │                           │   └─ INSERT into SQLite
    │   │                           ├─ remove deleted files
    │   │  ◄── progress(50/300) ────┤
    │   │  ◄── progress(150/300) ───┤
    │   │  ◄── done(indexed: 300) ──┤
    │   │                           └─ close DB, exit
    │   status = 'ready'            │
    │                               │
    │   (tools now query index)     │
```

### Agent write → re-index

```
Agent Tool (edit)               Main Process                Worker Thread
    │                               │                           │
    ├─ edit(path, old, new) ───────►│                           │
    │                               ├─ write file to disk       │
    │                               ├─ reindexFile(wsId, path) ─►
    │                               │                           ├─ open DB
    │                               │                           ├─ hash → changed
    │                               │                           ├─ parse + extract
    │                               │                           ├─ UPDATE in SQLite
    │                               │  ◄── file-done ───────────┤
    │  ◄── { ok: true } ───────────┤                           │
    │                               │                           │
    │   (next find_symbol call  │                           │
    │    sees updated symbols)      │                           │
```

---

## Edge Cases & Invariants

### Worker crash recovery
If the worker thread crashes (OOM, segfault in tree-sitter), the `error` event
handler sets `status = 'stale'` and nulls the worker reference. The next poll
interval spawns a fresh worker. Tools fall back to on-demand parsing while stale.

### Concurrent workers
`spawnWorker()` guards against concurrent workers per workspace — if one is already
running, the request is dropped. The 5-min poll will pick it up next cycle.

### DB connection safety
The main process opens a **read-only** connection for queries. The worker thread
opens a **write** connection. WAL mode allows concurrent read + write across threads.
When the worker finishes and closes its connection, the main process's read connection
sees the updated data on next query (SQLite WAL checkpoint is automatic).

### Large repos (>10k files)
`enumerateCodeFiles` caps at `INDEX_MAX_FILES`. Files beyond the cap are not indexed
but are still searchable via on-demand parsing (the tools fall back). The cap is
applied after sorting by modification time (most recently modified files are indexed
first — they're most likely to be relevant).

### Workspace with no supported files
If a workspace contains no `.ts`, `.tsx`, `.js`, `.jsx`, `.py` files (e.g., a Rust
or Go project), the indexer completes immediately with `indexed: 0`. Status is set
to `'ready'` (the index is valid — it's just empty). Tools fall back to on-demand
parsing which also returns empty for unsupported files.

### File deleted between grep and read
During on-demand fallback (v1 path), `readFile` may fail if a file was deleted after
grep found it. The existing try/catch in the tool `run()` handles this — the file is
skipped with `continue`.

### Signature consistency
Index stores the signature extracted at parse time. If the file is later edited, the
stored signature may be stale until re-indexing. The `indexStatus` field warns the LLM.
After agent writes trigger re-indexing, the signature is updated within seconds.

### `.ase/index.db` in read-only workspaces
If the workspace filesystem is read-only (e.g., mounted volume, permissions issue),
`mkdirSync` will throw. Caught in `startIndex()` — index status is set to `'disabled'`
and tools always use on-demand parsing.

---

## Performance Expectations

| Operation | Without Index (v1) | With Index | Improvement |
|---|---|---|---|
| `list_symbols("file.ts")` | 5-20ms (parse) | <1ms (SQLite query) | ~10-20x |
| `find_symbol("foo")` | 50-500ms (grep → parse) | <5ms (indexed LIKE query) | ~50-100x |
| `find_references("foo")` | 100-2000ms (grep → parse all) | <10ms (indexed query) | ~100-200x |
| Initial index build (3k files) | n/a | 30-90s (background) | — |
| Incremental re-index (1 file) | n/a | 50-200ms (background) | — |
| Index DB size (3k files) | n/a | ~20-45MB | — |

---

## Known Limitations (v2 candidates)

| Limitation | Impact | Potential Fix |
|---|---|---|
| Name-based references (not scope-resolved) | False positives for common names (`data`, `error`) | Type-checker integration or import chain analysis |
| No call-graph edges | Can't answer "what does this function call?" | Add caller/callee table from AST |
| Glob matching only on `find_symbol` | `find_references` requires exact name | Add glob support to refs query |
| Worker thread per workspace (single) | Can't parallelize across files | Worker pool or batch parallelism |
| No incremental AST update | Re-parses entire file on any change | tree-sitter incremental parsing API |
| `.d.ts` files skipped | Type declarations not indexed | Add as optional scope |
| No cross-workspace index | Can't search across multiple workspaces | Merge query across DBs |
