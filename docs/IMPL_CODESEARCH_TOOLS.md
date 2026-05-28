# Codebase Search Tools — Implementation Plan

## Overview

Add four new AST-aware tools to the agent tool registry so agents can navigate
a codebase structurally rather than relying purely on text grep.

**Languages supported:** TypeScript (`.ts`, `.tsx`), JavaScript (`.js`, `.jsx`, `.mjs`, `.cjs`), Python (`.py`).

**Parser:** tree-sitter (on-demand, no persistent index).

**Execution environment:** Electron main process (Node.js). All new code lives
in `src/main/` and follows the existing `Tool<I,O>` pattern in
`src/main/services/tools/`.

---

## Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Parser | tree-sitter | No server lifecycle, works on broken code, fast (~5-20ms/file) |
| Indexing | On-demand | Negligible latency per task; no invalidation complexity |
| Scope | Workspace-wide + optional `path` narrowing | Agent needs cross-file navigation |
| find_references strategy | grep (candidate files) + tree-sitter (identifier filter) | grep is 10x faster at eliminating non-matching files |
| find_symbol strategy | grep pre-filter + tree-sitter (same two-phase as references) | Avoids parsing all 300 files; grep eliminates ~95% in <50ms |
| Output format | Flat lists | LLMs consume flat arrays more reliably than nested trees |
| Permissions | `needsApproval: false`, added to `READ_ONLY_TOOLS` | Planner can use freely during exploration |
| Property accesses | Included in find_references | Without types, exclusion causes missed usages |
| Python imports | Unified `{ source, names, isTypeOnly }` shape | Same output for all languages |
| CJS `require()` | Not supported in v1 | Only ES `import` is parsed; document as known limitation |
| Testing | None for v1 | Defer until API is stable |

---

## Tools Spec

### 1. `list_symbols`

Extract all named symbols from a single file.

**Input schema:**
```ts
z.object({ path: z.string().min(1) })
```

**Output:** `OutlineSymbol[]`
```ts
interface OutlineSymbol {
  name: string;
  kind: 'function' | 'class' | 'method' | 'interface' | 'type' | 'enum' | 'variable';
  parentName: string | null;  // null for top-level; class name for methods
  exported: boolean;           // true if directly exported (export keyword or module-level in Python)
  startLine: number;          // 1-based
  endLine: number;            // 1-based, inclusive
}
```

**Symbol kinds by language:**

| Kind | TS/JS node types | Python node types |
|---|---|---|
| `function` | `function_declaration`, `function_expression` or `arrow_function` assigned to `const` | `function_definition` at module level |
| `class` | `class_declaration`, `class_expression` assigned to `const` | `class_definition` |
| `method` | `method_definition` inside `class_body` | `function_definition` inside `class_body` |
| `interface` | `interface_declaration` | — |
| `type` | `type_alias_declaration` | — |
| `enum` | `enum_declaration` | — |
| `variable` | exported `variable_declarator` with non-function value | — |

**Description string (in tool def):**
> Return all named symbols (functions, classes, methods, interfaces, types, enums, exported variables) in a workspace file. Each entry includes name, kind, parent class name, and line range. Use this to understand a file's structure without reading its full content.

---

### 2. `list_imports`

List all import statements in a file.

**Input schema:**
```ts
z.object({ path: z.string().min(1) })
```

**Output:** `ImportEntry[]`
```ts
interface ImportEntry {
  source: string;       // e.g. "./utils", "node:fs", "react"
  names: string[];      // named identifiers; ["*"] for default/namespace/wildcard
  isTypeOnly: boolean;  // true for TS `import type { ... }`; always false for Python
}
```

**Python import mapping:**

| Python syntax | Output |
|---|---|
| `import os` | `{ source: 'os', names: ['os'], isTypeOnly: false }` |
| `import os, sys` | Two entries: `{ source: 'os', names: ['os'] }`, `{ source: 'sys', names: ['sys'] }` |
| `from pathlib import Path, PurePath` | `{ source: 'pathlib', names: ['Path', 'PurePath'], isTypeOnly: false }` |
| `from . import utils` | `{ source: '.', names: ['utils'], isTypeOnly: false }` |
| `from ..models import User` | `{ source: '..models', names: ['User'], isTypeOnly: false }` |
| `from os import *` | `{ source: 'os', names: ['*'], isTypeOnly: false }` |

> **Note:** `import os` maps to `names: ['os']` (the local binding name), not `['*']`.
> `['*']` is reserved for wildcard imports (`from x import *`) and namespace imports.

**Known limitation (v1):** CommonJS `require()` calls (e.g. `const fs = require('fs')`)
are not parsed. Only ES `import` statements are extracted. This affects `.cjs` files
and older Node.js codebases.

**Description string:**
> List all ES import statements in a workspace file. Returns the source module and the named identifiers imported. Use this to understand dependencies and trace where a symbol comes from, then call find_symbol on the source module. Note: CommonJS require() is not parsed in v1.

---

### 3. `find_symbol`

Find where a named symbol is declared across the workspace.

**Input schema:**
```ts
z.object({
  symbol: z.string().min(1).describe('Exact symbol name to find (case-sensitive).'),
  path: z.string().optional().describe('Narrow search to this directory (workspace-relative).'),
})
```

**Output:** `DefinitionResult[]` (at most 10)
```ts
interface DefinitionResult {
  path: string;       // workspace-relative path
  line: number;       // 1-based line of the declaration
  signature: string;  // declaration text through the opening `{` or `)` (trimmed, max 200 chars)
  exported: boolean;  // true if wrapped in an export_statement (TS/JS) or at module level (Python)
}
```

> **Signature extraction:** instead of just the first line, the signature reads from
> the declaration's start row through the row of the first `{` or `)` child (whichever
> comes first), joined with a single space, trimmed, capped at 200 characters. This
> captures the full parameter list of multiline function declarations like:
> ```ts
> export async function createWorkspace(name: string, path: string): Promise<Workspace> {
> ```

**What counts as a definition node** — AST node types checked, by language:

| Language | Node types |
|---|---|
| TS/JS | `function_declaration`, `class_declaration`, `interface_declaration`, `type_alias_declaration`, `enum_declaration`, `method_definition`, `variable_declarator` |
| Python | `function_definition`, `class_definition` |

The `name` field child of each node is compared against `symbol` with exact,
case-sensitive equality. A node only emits a result if `nameNode.text === symbol`.

**Two-phase algorithm (same as `find_references`):**

1. **Grep phase** — use the existing `grep()` service to find files that contain the
   symbol string (fast text pre-filter, eliminates ~95% of files in <50ms).
2. **AST phase** — for each candidate file, parse with tree-sitter and check declaration
   nodes whose `name` field matches `symbol` exactly.

**Description string:**
> Find where a named symbol (function, class, type, interface, variable) is defined across the workspace. Returns the file path, line number, the definition signature, and whether it is exported. Performs exact name matching — not substring.

---

### 4. `find_references`

Find all identifier usages of a symbol across the workspace.

**Input schema:**
```ts
z.object({
  symbol: z.string().min(1).describe('Exact symbol name to find (case-sensitive).'),
  path: z.string().optional().describe('Narrow search to this directory (workspace-relative).'),
})
```

**Output:** `ReferenceResult[]` (at most 100)
```ts
interface ReferenceResult {
  path: string;   // workspace-relative
  line: number;   // 1-based
  text: string;   // trimmed source line
}
```

**Two-phase algorithm:**

1. **Grep phase** — call the existing `grep()` service with `isRegex: false`,
   `caseSensitive: true`, and a high `maxHits` to collect all candidate file paths
   that contain the symbol string anywhere. Deduplicate to unique paths.

2. **AST phase** — for each candidate file, parse with tree-sitter. Walk every
   node in the tree. Collect nodes where `node.type === 'identifier'` or
   `node.type === 'property_identifier'` and `node.text === symbol`. Deduplicate
   by line number (at most one result per line per file, matching `grep`'s behaviour).

**Includes:** standalone calls `foo()`, import bindings `import { foo }`, property
accesses `obj.foo` / `this.foo`.

**Excludes automatically (different AST node type):** string literals (`string`),
template strings (`template_string`), comments (`comment`).

**Description string:**
> Find all usages of a named symbol across the workspace. Uses grep to locate candidate files, then tree-sitter to filter to real identifier nodes (excluding string literals and comments). Includes call sites, import bindings, and property accesses like obj.foo.

---

## Hard Limits

| Limit | Value | Enforced in |
|---|---|---|
| Max files scanned (enumeration) | 300 | `enumerateCodeFiles()` in `parser.ts` |
| Max candidate files from grep (find_symbol/find_references) | 100 | tool `run()` — cap `candidatePaths` array |
| Max file size parsed | 512 KB | `enumerateCodeFiles()` — skip larger files |
| Max definition matches | 10 | `findSymbolTool.run()` |
| Max reference matches | 100 | `findReferencesTool.run()` |
| Max signature length | 200 chars | `extractSignature()` in `parser.ts` |

> **Note on common symbol names:** symbols like `data`, `result`, `error` appear in\n> nearly every file and will produce many grep hits. The 100-file candidate cap\n> prevents the AST phase from being too slow. Agents should use the `path` parameter\n> to narrow scope for generic names.

---

## File Layout

```
src/
  main/
    services/
      codesearch/
        parser.ts          ← NEW: all tree-sitter logic
      tools/
        codesearch.ts      ← NEW: Tool<> definitions for registry
        registry.ts        ← EDIT: add tools + READ_ONLY_TOOLS entries
    orchestrator/
      prompts.ts           ← EDIT: add new tools to planner system prompt
  shared/
    agent.ts               ← EDIT: add 4 new ToolName values
package.json               ← EDIT: postinstall + dependencies
```

---

## Step-by-Step Implementation

---

### Step 1 — Install dependencies

```bash
pnpm add tree-sitter tree-sitter-javascript tree-sitter-typescript tree-sitter-python
```

`tree-sitter` is a native Node addon (like `better-sqlite3`). The grammar packages
(`tree-sitter-javascript`, `tree-sitter-typescript`, `tree-sitter-python`) ship
pre-compiled grammar objects that are loaded by the core `tree-sitter` module.

**Edit `package.json`** — extend the `postinstall` script. Use `-f` (force rebuild
all native modules) instead of `-w` (whitelist), because grammar packages may also
contain native `.node` bindings compiled against the core:

```diff
- "postinstall": "electron-rebuild -f -w better-sqlite3"
+ "postinstall": "electron-rebuild -f"
```

> **Why `-f` instead of `-w`:** the old command already uses `-f` (force). Switching
> from `-w better-sqlite3` to no `-w` at all makes `electron-rebuild` recompile ALL
> native addons, including `better-sqlite3` and `tree-sitter` core. This is the safest
> approach since grammar packages may have native components linked to the core.
> If rebuild time is a concern, test with `-w better-sqlite3 -w tree-sitter` first,
> but fall back to `-f` (no `-w`) if any grammar fails at runtime.

> **Version pinning:** the latest `tree-sitter` Node.js binding is **v0.22.x**. All
> four packages must use the same ABI version. Install them together so pnpm resolves
> a compatible set:
> ```bash
> pnpm add tree-sitter@^0.22 tree-sitter-javascript@^0.23 \
>   tree-sitter-typescript@^0.23 tree-sitter-python@^0.23
> ```
> (Grammar packages are typically one minor version ahead of core. Check actual versions
> at install time and confirm all use the same tree-sitter ABI.)

---

### Step 2 — Create `src/main/services/codesearch/parser.ts`

This module owns all tree-sitter logic. Tool files import only from here — they
never import `tree-sitter` directly. This makes the tree-sitter dependency easy
to swap or mock later.

```ts
import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
// tree-sitter-typescript exports two SEPARATE entry points — not a single default
import TypeScript from 'tree-sitter-typescript/typescript';
import TSX from 'tree-sitter-typescript/tsx';
import Python from 'tree-sitter-python';
import { readFile } from 'node:fs/promises';
import { extname, relative, join, sep } from 'node:path';
import fg from 'fast-glob';

// ─── Public types ─────────────────────────────────────────────────────────────

export type Language = 'typescript' | 'tsx' | 'javascript' | 'python';

export interface OutlineSymbol {
  name: string;
  kind: 'function' | 'class' | 'method' | 'interface' | 'type' | 'enum' | 'variable';
  parentName: string | null;
  exported: boolean;   // true if directly exported
  startLine: number; // 1-based
  endLine: number;   // 1-based
}

export interface ImportEntry {
  source: string;
  names: string[];
  isTypeOnly: boolean;
}

export interface DefinitionResult {
  path: string;
  line: number;
  signature: string;
  exported: boolean;
}

export interface ReferenceResult {
  path: string;
  line: number;
  text: string;
}

// ─── Parser singletons (one per language, created lazily) ─────────────────────

const _parsers = new Map<Language, Parser>();

function getParser(lang: Language): Parser {
  const existing = _parsers.get(lang);
  if (existing) return existing;
  const p = new Parser();
  switch (lang) {
    case 'typescript': p.setLanguage(TypeScript); break;
    case 'tsx':        p.setLanguage(TSX); break;
    case 'javascript': p.setLanguage(JavaScript); break;
    case 'python':     p.setLanguage(Python); break;
  }
  _parsers.set(lang, p);
  return p;
}

// ─── Language detection ───────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, Language> = {
  '.ts':  'typescript',
  '.tsx': 'tsx',
  '.js':  'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py':  'python',
};

export function detectLanguage(filePath: string): Language | null {
  return EXT_TO_LANG[extname(filePath).toLowerCase()] ?? null;
}

// ─── File enumeration ─────────────────────────────────────────────────────────

const IGNORE_PATTERNS = [
  '**/.git/**', '**/node_modules/**', '**/.DS_Store',
  '**/.next/**', '**/dist/**', '**/out/**', '**/.turbo/**',
  '**/.venv/**', '**/venv/**', '**/__pycache__/**', '**/.cache/**',
];

const SUPPORTED_GLOB = '**/*.{ts,tsx,js,jsx,mjs,cjs,py}';
const MAX_FILES = 300;
const MAX_FILE_BYTES = 512 * 1024; // 512 KB — same limit used in grep.ts

export interface CodeFile {
  absPath: string;
  relPath: string; // workspace-relative, forward slashes
  lang: Language;
}

/**
 * Return up to MAX_FILES code files under `root`, optionally scoped to `rel`.
 * Files larger than MAX_FILE_BYTES are silently skipped.
 */
export async function enumerateCodeFiles(root: string, rel?: string): Promise<CodeFile[]> {
  const cwd = rel ? join(root, rel) : root;
  const entries = await fg(SUPPORTED_GLOB, {
    cwd,
    ignore: IGNORE_PATTERNS,
    onlyFiles: true,
    dot: true,
    suppressErrors: true,
    stats: true,
  });

  const results: CodeFile[] = [];
  for (const entry of entries) {
    if (results.length >= MAX_FILES) break;
    const stats = (entry as { stats?: { size: number } }).stats;
    if (stats && stats.size > MAX_FILE_BYTES) continue;
    const relPath = relative(root, join(cwd, (entry as { path: string }).path))
      .split(sep).join('/');
    const lang = detectLanguage(relPath);
    if (!lang) continue;
    results.push({ absPath: join(root, relPath), relPath, lang });
  }
  return results;
}

// ─── Internal AST helpers ─────────────────────────────────────────────────────

// Type alias so we don't need to import SyntaxNode directly
type SyntaxNode = ReturnType<Parser['parse']>['rootNode'];

/** Depth-first walk of every node in the tree, calling visitor for each. */
function walk(node: SyntaxNode, visitor: (n: SyntaxNode) => void): void {
  visitor(node);
  for (const child of node.children) {
    walk(child, visitor);
  }
}

/** Convert tree-sitter's 0-based row to a 1-based line number. */
function toLine(row: number): number {
  return row + 1;
}

/**
 * Extract a signature string from a declaration node.
 * Reads from the node's start row through the row containing the first `{` or `)` child,
 * joined with spaces, trimmed, capped at 200 chars.
 * Falls back to just the first line if no delimiter is found.
 */
function extractSignature(node: SyntaxNode, lines: string[]): string {
  const startRow = node.startPosition.row;
  let endRow = startRow;
  // Look for the first `{` or `)` to capture the full parameter list
  for (const child of node.children) {
    if (child.text === '{' || child.text === ')') {
      endRow = child.startPosition.row;
      break;
    }
  }
  // Collect lines from startRow to endRow
  const parts: string[] = [];
  for (let r = startRow; r <= endRow; r++) {
    parts.push((lines[r] ?? '').trim());
  }
  const sig = parts.join(' ').trim();
  return sig.length > 200 ? sig.slice(0, 200) + '…' : sig;
}

/** Check if a node is wrapped in an export_statement. */
function isNodeExported(node: SyntaxNode): boolean {
  let p: SyntaxNode | null = node.parent;
  while (p) {
    if (p.type === 'export_statement') return true;
    if (p.type === 'program' || p.type === 'class_body') break;
    p = p.parent;
  }
  return false;
}

const outline = lang === 'python'
    ? parsePythonOutline(tree.rootNode)
    : parseTsJsOutline(tree.rootNode, source);
  const imports = lang === 'python'
    ? parsePythonImports(tree.rootNode)
    : parseTsJsImports(tree.rootNode);

  return { outline, imports };
}

// ─── parseOutline ─────────────────────────────────────────────────────────────

export function parseOutline(source: string, lang: Language): OutlineSymbol[] {
  let tree: ReturnType<Parser['parse']>;
  try {
    tree = getParser(lang).parse(source);
  } catch {
    return []; // unparseable file — skip silently
  }

  if (lang === 'python') {
    return parsePythonOutline(tree.rootNode);
  }
  return parseTsJsOutline(tree.rootNode, source);
}

function parseTsJsOutline(root: SyntaxNode, source: string): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];
  const lines = source.split('\n');

  walk(root, (node) => {
    switch (node.type) {

      // ── function foo() {} / async function foo() {}
      case 'function_declaration': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) symbols.push({
          name: nameNode.text, kind: 'function', parentName: null,
          exported: isNodeExported(node),
          startLine: toLine(node.startPosition.row),
          endLine: toLine(node.endPosition.row),
        });
        break;
      }

      // ── class Foo {}
      case 'class_declaration': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) symbols.push({
          name: nameNode.text, kind: 'class', parentName: null,
          exported: isNodeExported(node),
          startLine: toLine(node.startPosition.row),
          endLine: toLine(node.endPosition.row),
        });
        break;
      }

      // ── foo() {} / get foo() {} inside class body
      case 'method_definition': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        // Walk up to find enclosing class name
        let cursor: SyntaxNode | null = node.parent;
        let parentName: string | null = null;
        while (cursor) {
          if (cursor.type === 'class_declaration' || cursor.type === 'class_expression') {
            const cn = cursor.childForFieldName('name');
            parentName = cn?.text ?? null;
            break;
          }
          cursor = cursor.parent;
        }
        symbols.push({
          name: nameNode.text, kind: 'method', parentName,
          exported: false, // methods are accessed via the class, not directly exported
          startLine: toLine(node.startPosition.row),
          endLine: toLine(node.endPosition.row),
        });
        break;
      }

      // ── interface Foo {} (TS only)
      case 'interface_declaration': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) symbols.push({
          name: nameNode.text, kind: 'interface', parentName: null,
          exported: isNodeExported(node),
          startLine: toLine(node.startPosition.row),
          endLine: toLine(node.endPosition.row),
        });
        break;
      }

      // ── type Foo = ... (TS only)
      case 'type_alias_declaration': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) symbols.push({
          name: nameNode.text, kind: 'type', parentName: null,
          exported: isNodeExported(node),
          startLine: toLine(node.startPosition.row),
          endLine: toLine(node.endPosition.row),
        });
        break;
      }

      // ── enum Foo {} (TS only)
      case 'enum_declaration': {
        const nameNode = node.childForFieldName('name');
        if (nameNode) symbols.push({
          name: nameNode.text, kind: 'enum', parentName: null,
          exported: isNodeExported(node),
          startLine: toLine(node.startPosition.row),
          endLine: toLine(node.endPosition.row),
        });
        break;
      }

      // ── const foo = ... / const foo = () => {} / const Foo = class {}
      case 'variable_declarator': {
        const nameNode = node.childForFieldName('name');
        const valueNode = node.childForFieldName('value');
        if (!nameNode) break;

        // Determine kind from value node type
        const isFunc = valueNode &&
          (valueNode.type === 'arrow_function' || valueNode.type === 'function_expression');
        const isClass = valueNode && valueNode.type === 'class_expression';
        const exported = isNodeExported(node);

        // Emit all named declarations (both exported and non-exported)
        // The `exported` field tells the agent whether it's public API
        symbols.push({
          name: nameNode.text,
          kind: isFunc ? 'function' : isClass ? 'class' : 'variable',
          parentName: null,
          exported,
          startLine: toLine(node.startPosition.row),
          endLine: toLine(node.endPosition.row),
        });
        break;
      }
    }
  });

  return symbols;
}

function parsePythonOutline(root: SyntaxNode): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];

  // Recursive: parentClassName is set when inside a class body
  function visit(node: SyntaxNode, parentClassName: string | null): void {
    if (node.type === 'decorated_definition') {
      // Unwrap decorator and recurse on the inner function/class
      const inner = node.children.find(
        (c) => c.type === 'function_definition' || c.type === 'class_definition',
      );
      if (inner) visit(inner, parentClassName);
      return;
    }

    if (node.type === 'function_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        symbols.push({
          name: nameNode.text,
          kind: parentClassName ? 'method' : 'function',
          parentName: parentClassName,
          exported: !parentClassName, // top-level Python functions are module-public
          startLine: toLine(node.startPosition.row),
          endLine: toLine(node.endPosition.row),
        });
      }
      // Don't recurse into the function body (nested functions are out of scope)
      return;
    }

    if (node.type === 'class_definition') {
      const nameNode = node.childForFieldName('name');
      const className = nameNode?.text ?? null;
      if (className) {
        symbols.push({
          name: className, kind: 'class', parentName: null,
          exported: true, // top-level Python classes are module-public
          startLine: toLine(node.startPosition.row),
          endLine: toLine(node.endPosition.row),
        });
      }
      // Recurse into class body to find methods
      const body = node.childForFieldName('body');
      if (body) {
        for (const child of body.children) {
          visit(child, className);
        }
      }
      return;
    }

    // Top-level nodes: recurse into children
    if (!parentClassName) {
      for (const child of node.children) {
        visit(child, null);
      }
    }
  }

  visit(root, null);
  return symbols;
}

// ─── parseImports ─────────────────────────────────────────────────────────────

export function parseImports(source: string, lang: Language): ImportEntry[] {
  let tree: ReturnType<Parser['parse']>;
  try {
    tree = getParser(lang).parse(source);
  } catch {
    return [];
  }

  if (lang === 'python') {
    return parsePythonImports(tree.rootNode);
  }
  return parseTsJsImports(tree.rootNode);
}

function parseTsJsImports(root: SyntaxNode): ImportEntry[] {
  const imports: ImportEntry[] = [];

  for (const node of root.children) {
    if (node.type !== 'import_statement') continue;

    // Detect `import type { ... }`
    const isTypeOnly = node.children.some(
      (c) => c.type === 'type' || (c.type === 'identifier' && c.text === 'type'),
    );

    // Source is the string node at the end: `"./utils"` — strip quotes
    const sourceNode = node.children.find((c) => c.type === 'string');
    if (!sourceNode) continue;
    const source = sourceNode.text.replace(/^['"`]|['"`]$/g, '');

    const clause = node.children.find((c) => c.type === 'import_clause');
    if (!clause) {
      // Side-effect import: `import "./polyfill"`
      imports.push({ source, names: ['*'], isTypeOnly: false });
      continue;
    }

    const names: string[] = [];
    for (const part of clause.children) {
      if (part.type === 'identifier') {
        // Default import: `import Foo from '...'`
        names.push(part.text);
      } else if (part.type === 'namespace_import') {
        // Namespace import: `import * as ns from '...'`
        names.push('*');
      } else if (part.type === 'named_imports') {
        // Named imports: `import { a, b as c } from '...'`
        for (const spec of part.namedChildren) {
          if (spec.type !== 'import_specifier') continue;
          // The `name` field is the original exported name
          const nm =
            spec.childForFieldName('name') ??
            spec.children.find((c) => c.type === 'identifier');
          if (nm) names.push(nm.text);
        }
      }
    }

    imports.push({ source, names: names.length ? names : ['*'], isTypeOnly });
  }

  return imports;
}

function parsePythonImports(root: SyntaxNode): ImportEntry[] {
  const imports: ImportEntry[] = [];

  for (const node of root.children) {
    // `import os` / `import os, sys`
    if (node.type === 'import_statement') {
      for (const child of node.namedChildren) {
        if (child.type === 'dotted_name') {
          // `import os` → names: ['os'] (the local binding name)
          imports.push({ source: child.text, names: [child.text], isTypeOnly: false });
        } else if (child.type === 'aliased_import') {
          const nm = child.childForFieldName('name') ?? child.children[0];
          if (nm) imports.push({ source: nm.text, names: [nm.text], isTypeOnly: false });
        }
      }
      continue;
    }

    // `from pathlib import Path` / `from . import utils`
    if (node.type === 'import_from_statement') {
      const modulePart = node.children.find(
        (c) => c.type === 'dotted_name' || c.type === 'relative_import',
      );
      const source = modulePart?.text ?? '.';

      const names: string[] = [];
      for (const child of node.namedChildren) {
        // Skip the module itself
        if (child === modulePart) continue;
        if (child.type === 'dotted_name') {
          names.push(child.text);
        } else if (child.type === 'aliased_import') {
          const nm = child.childForFieldName('name') ?? child.children[0];
          if (nm) names.push(nm.text);
        } else if (child.type === 'wildcard_import') {
          names.push('*');
        }
      }

      imports.push({ source, names: names.length ? names : ['*'], isTypeOnly: false });
    }
  }

  return imports;
}

// ─── findSymbolNodes ──────────────────────────────────────────────────────

/** AST node types that represent a symbol being *declared*. */
const DEFINITION_TYPES = new Set([
  // TS / JS
  'function_declaration',
  'class_declaration',
  'method_definition',
  'interface_declaration',   // TS
  'type_alias_declaration',  // TS
  'enum_declaration',        // TS
  'variable_declarator',
  // Python
  'function_definition',
  'class_definition',
]);

/**
 * Return all definition sites for `symbol` in `source`.
 * Checks the `name` field child of each declaration node.
 */
export function findSymbolNodes(
  source: string,
  symbol: string,
  lang: Language,
): Array<{ line: number; signature: string; exported: boolean }> {
  let tree: ReturnType<Parser['parse']>;
  try {
    tree = getParser(lang).parse(source);
  } catch {
    return [];
  }

  const results: Array<{ line: number; signature: string; exported: boolean }> = [];
  const lines = source.split('\n');

  walk(tree.rootNode, (node) => {
    if (!DEFINITION_TYPES.has(node.type)) return;
    const nameNode = node.childForFieldName('name');
    if (!nameNode || nameNode.text !== symbol) return;
    results.push({
      line: toLine(node.startPosition.row),
      signature: extractSignature(node, lines),
      exported: lang === 'python' ? true : isNodeExported(node),
    });
  });

  return results;
}

// ─── findReferenceNodes ───────────────────────────────────────────────────────

/**
 * Return all identifier usages of `symbol` in `source`.
 * Collects `identifier` and `property_identifier` AST nodes matching the name.
 * Deduplicates by line (at most one result per line, consistent with grep).
 */
export function findReferenceNodes(
  source: string,
  symbol: string,
  lang: Language,
): Array<{ line: number; text: string }> {
  let tree: ReturnType<Parser['parse']>;
  try {
    tree = getParser(lang).parse(source);
  } catch {
    return [];
  }

  const results: Array<{ line: number; text: string }> = [];
  const lines = source.split('\n');
  const seenLines = new Set<number>();

  walk(tree.rootNode, (node) => {
    // Only identifier-type leaf nodes — not strings, comments, keywords, etc.
    if (node.type !== 'identifier' && node.type !== 'property_identifier') return;
    if (node.text !== symbol) return;
    const row = node.startPosition.row;
    if (seenLines.has(row)) return; // deduplicate
    seenLines.add(row);
    results.push({
      line: toLine(row),
      text: (lines[row] ?? '').trim(),
    });
  });

  return results;
}
```

---

### Step 3 — Create `src/main/services/tools/codesearch.ts`

Five `Tool<I,O>` definitions following the pattern established in `fs.ts` and `memory.ts`.

```ts
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getWorkspace } from '../workspaces.js';
import { safeJoin } from '../../util/safePath.js';
import { grep } from '../grep.js';
import {
  detectLanguage,
  enumerateCodeFiles,
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
const MAX_CANDIDATE_FILES = 100; // cap grep candidates before AST parsing

// ─── list_symbols ──────────────────────────────────────────────────────────────

export const listSymbolsTool: Tool<{ path: string }, OutlineSymbol[]> = {
  name: 'list_symbols',
  description:
    'Return all named symbols (functions, classes, methods, interfaces, types, enums, ' +
    "exported variables) in a workspace file. Each entry includes name, kind, parent " +
    'class name, and line range. Use this to understand a file\'s structure without ' +
    'reading its full content.',
  schema: z.object({ path: z.string().min(1) }),
  needsApproval: false,
  run: async ({ path }, ctx) => {
    const ws = await getWorkspace(ctx.workspaceId);
    const abs = safeJoin(ws.path, path);
    const lang = detectLanguage(path);
    if (!lang) return [];
    let source: string;
    try {
      source = await readFile(abs, 'utf8');
    } catch {
      return [];
    }
    return parseOutline(source, lang);
  },
};

// ─── list_imports ──────────────────────────────────────────────────────────────

export const listImportsTool: Tool<{ path: string }, ImportEntry[]> = {
  name: 'list_imports',
  description:
    'List all import/require statements in a workspace file. Returns the source module ' +
    'and the named identifiers imported. Use this to understand dependencies and trace ' +
    'where a symbol comes from, then call find_symbol on the source module.',
  schema: z.object({ path: z.string().min(1) }),
  needsApproval: false,
  run: async ({ path }, ctx) => {
    const ws = await getWorkspace(ctx.workspaceId);
    const abs = safeJoin(ws.path, path);
    const lang = detectLanguage(path);
    if (!lang) return [];
    let source: string;
    try {
      source = await readFile(abs, 'utf8');
    } catch {
      return [];
    }
    return parseImports(source, lang);
  },
};

// ─── find_symbol ──────────────────────────────────────────────────────────

export const findSymbolTool: Tool<
  { symbol: string; path?: string },
  DefinitionResult[]
> = {
  name: 'find_symbol',
  description:
    'Find where a named symbol (function, class, type, interface, variable) is defined ' +
    'across the workspace. Returns the file path, line number, and the definition ' +
    'signature. Performs exact name matching — not substring.',
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

    // Phase 1: grep to narrow candidate files (same strategy as find_references)
    const grepHits = await grep(ws.path, {
      pattern: symbol,
      isRegex: false,
      caseSensitive: true,
      rel: path,
      include: '**/*.{ts,tsx,js,jsx,mjs,cjs,py}',
      maxHits: 5000,
    });

    const candidatePaths = [...new Set(grepHits.map((h) => h.path))].slice(0, MAX_CANDIDATE_FILES);
    const results: DefinitionResult[] = [];

    // Phase 2: AST check only on candidate files
    for (const relPath of candidatePaths) {
      if (results.length >= MAX_DEFS) break;
      const lang = detectLanguage(relPath);
      if (!lang) continue;
      let source: string;
      try {
        source = await readFile(safeJoin(ws.path, relPath), 'utf8');
      } catch {
        continue;
      }
      const hits = findSymbolNodes(source, symbol, lang);
      for (const hit of hits) {
        if (results.length >= MAX_DEFS) break;
        results.push({
          path: relPath, line: hit.line,
          signature: hit.signature, exported: hit.exported,
        });
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

    // Phase 1: grep to collect candidate file paths — fast, no AST needed
    const grepHits = await grep(ws.path, {
      pattern: symbol,
      isRegex: false,
      caseSensitive: true,
      rel: path,
      include: '**/*.{ts,tsx,js,jsx,mjs,cjs,py}',
      maxHits: 5000, // high cap — we only use the file paths, not the line hits
    });

    // Deduplicate to unique file paths, cap at MAX_CANDIDATE_FILES to prevent
    // runaway AST parsing for common symbol names like 'data', 'result', 'error'
    const candidatePaths = [...new Set(grepHits.map((h) => h.path))].slice(0, MAX_CANDIDATE_FILES);

    const results: ReferenceResult[] = [];

    for (const relPath of candidatePaths) {
      if (results.length >= MAX_REFS) break;
      const lang = detectLanguage(relPath);
      if (!lang) continue;
      let source: string;
      try {
        source = await readFile(safeJoin(ws.path, relPath), 'utf8');
      } catch {
        continue;
      }

      // Phase 2: tree-sitter walk to filter out strings/comments
      const hits = findReferenceNodes(source, symbol, lang);
      for (const hit of hits) {
        if (results.length >= MAX_REFS) break;
        results.push({ path: relPath, line: hit.line, text: hit.text });
      }
    }

    return results;
  },
};
```

---

### Step 4 — Edit `src/shared/agent.ts`

Add the four new names to the `ToolName` union. This is the **source of truth** —
`src/main/services/tools/types.ts` re-exports it, so only this file needs touching.

**Exact diff:**
```diff
 export type ToolName =
   | 'read_file'
   | 'write_file'
   | 'edit'
   | 'apply_patch'
   | 'list_dir'
   | 'grep'
   | 'glob'
   | 'run_shell'
   | 'run_tests'
   | 'git_status'
   | 'git_diff'
   | 'git_branch'
   | 'git_commit'
   | 'ask_user'
   | 'read_memories'
-  | 'add_memory';
+  | 'add_memory'
+  // ── codebase search ──
+  | 'list_symbols'
+  | 'list_imports'
+  | 'find_symbol'
+  | 'find_references';
```

---

### Step 5 — Edit `src/main/services/tools/registry.ts`

Three changes to this file:

**5a — Add import** (alongside existing tool imports at the top):
```ts
import {
  listSymbolsTool,
  listImportsTool,
  findSymbolTool,
  findReferencesTool,
} from './codesearch.js';
```

**5b — Add entries to `REGISTRY`:**
```diff
 const REGISTRY: Record<ToolName, Tool<unknown, unknown>> = {
   read_file: readFileTool as Tool<unknown, unknown>,
   // ... existing entries ...
   read_memories: readMemoriesTool as Tool<unknown, unknown>,
   add_memory: addMemoryTool as Tool<unknown, unknown>,
+  // ── codebase search ──
+  list_symbols:        listSymbolsTool       as Tool<unknown, unknown>,
+  list_imports:        listImportsTool       as Tool<unknown, unknown>,
+  find_symbol:    findSymbolTool   as Tool<unknown, unknown>,
+  find_references:    findReferencesTool   as Tool<unknown, unknown>,
 };
```

**5c — Add to `READ_ONLY_TOOLS`:**
```diff
 const READ_ONLY_TOOLS: ToolName[] = [
   'read_file',
   'list_dir',
   'grep',
   'glob',
   'git_status',
   'git_diff',
   'read_memories',
+  // ── codebase search ──
+  'list_symbols',
+  'list_imports',
+  'find_symbol',
+  'find_references',
 ];
```

---

### Step 6 — Edit `src/main/orchestrator/prompts.ts`

The planner system prompt hardcodes the available read-only tool list. Add the new
tools so the LLM knows they exist and when to use them.

**In `PLANNER_SYSTEM`**, update the tool list:
```diff
 You have read-only tools: read_file, list_dir, grep, glob, git_status, git_diff, read_memories.
+You also have codebase search tools: list_symbols, list_imports, find_symbol, find_references.
```

**And add usage guidance** below the existing tool bullet points:
```diff
 - Call multiple tools in parallel when you need independent pieces of information.
+- Use list_symbols to understand a file's structure without reading it.
+- Use list_imports to see what a file depends on.
+- Use find_symbol to locate where a symbol is defined across the workspace.
+- Use find_references to find all usages of a symbol (call sites, imports, property accesses).
```

---

### Step 7 — Verify

```bash
pnpm typecheck
```

TypeScript's `Record<ToolName, ...>` is an exhaustiveness check — if any new
`ToolName` value is missing from `REGISTRY`, this command errors. Zero new errors
is the expected outcome.

---

## Edge Cases & Invariants

### Parsing failures
Every `parser.parse()` call is wrapped in try/catch. If tree-sitter throws (binary
file decoded as UTF-8, grammar version mismatch), the affected function returns `[]`.
The tool `run()` also wraps `readFile` in try/catch and skips unreadable files with
`continue`. Neither layer ever throws to the tool invocation layer — they return
empty results silently.

### Unsupported file types
`detectLanguage` returns `null` for any extension not in `EXT_TO_LANG`. Tool
`run()` methods check this before calling `readFile` and return an empty result
immediately. `enumerateCodeFiles` also skips non-matching extensions via the glob
pattern `**/*.{ts,tsx,js,jsx,mjs,cjs,py}`.

### Binary / oversized files
`enumerateCodeFiles` uses fast-glob's `stats: true` and skips files above 512 KB
before any `readFile` call. This matches the behaviour in `src/main/services/grep.ts`
(which has an identical 512 KB guard) and keeps memory usage bounded during workspace
scans.

### Deduplication in find_references
`findReferenceNodes` uses a `Set<number>` of seen row indices. At most one result is
emitted per line per file, consistent with the existing `grep` tool's output format.

### Parser singletons and thread safety
Parsers are created lazily in a module-level `Map` and reused across calls.
`Parser.parse()` is synchronous. The Electron main process is single-threaded (no
worker threads are used here), so concurrent access is not possible.

### tree-sitter-typescript two grammars
The package exports two **separate entry points**: `tree-sitter-typescript/typescript`
and `tree-sitter-typescript/tsx`. They are imported as separate default imports, NOT
destructured from a single package export. Using the TypeScript grammar on a `.tsx`
file would cause JSX syntax nodes to be classified as errors and produce an
incomplete AST.

### Method definition — class name lookup
`parseTsJsOutline` walks up `node.parent` pointers to find the enclosing
`class_declaration` or `class_expression`. If no enclosing class is found (e.g., a
loose `method_definition` in a malformed AST), `parentName` is set to `null` rather
than crashing.

### Common symbol names in find_references / find_symbol
Symbols like `data`, `result`, `error`, `name` appear in nearly every file. Grep
returns almost all files, defeating the pre-filter purpose. The `MAX_CANDIDATE_FILES`
cap (100 files) limits the AST phase to prevent slowdowns. Agents should use the
`path` parameter to narrow scope for generic names.

### CJS `require()` not supported
`parseTsJsImports` only scans `import_statement` AST nodes. CommonJS `require()`
calls (`const fs = require('fs')`) are `call_expression` nodes and are not extracted.
This is a known v1 limitation. `.cjs` files and older Node.js codebases will show
empty import lists.

### Path traversal prevention
All single-file tools (`list_symbols`, `list_imports`) use
`safeJoin(ws.path, path)` to prevent path traversal attacks. The workspace-wide
tools (`find_symbol`, `find_references`) also use `safeJoin` when reading
candidate files, even though paths come from grep output (defence in depth).

### Signature extraction
`extractSignature()` reads from the declaration's start row through the row of the
first `{` or `)` child, joined with spaces, capped at 200 characters. If no
delimiter child is found (e.g., a one-line declaration), it falls back to just the
first line. The 200-char cap prevents oversized signatures from cluttering tool
output.

---

## Dependency Notes

| Package | Purpose | Notes |
|---|---|---|
| `tree-sitter` | Core parser runtime (v0.22.x) | Native addon — needs `electron-rebuild` |
| `tree-sitter-javascript` | JS + JSX grammar | Loaded by core; may have native component |
| `tree-sitter-typescript` | TS + TSX (two separate entry points) | `tree-sitter-typescript/typescript` and `tree-sitter-typescript/tsx` |
| `tree-sitter-python` | Python grammar | Loaded by core; may have native component |

All four packages must use the same ABI version. Install them together in a single
`pnpm add` command so the package manager resolves a mutually compatible set. If a
version conflict occurs at runtime, tree-sitter throws with message
`"Error: The language was generated with an incompatible version of tree-sitter"`.
In that case, pin all to a single compatible minor version.

> **Note on grammar native bindings:** grammar packages are NOT guaranteed to be "pure JS".
> Some include native `.node` bindings compiled against the core. This is why the
> postinstall uses `electron-rebuild -f` (rebuild all native modules) instead of
> whitelisting only `tree-sitter`. Test at install time — if a grammar fails to load,
> it likely needs rebuilding too.

---

## Known Limitations (v1)

| Limitation | Impact | Potential v2 fix |
|---|---|---|
| No CommonJS `require()` parsing | `.cjs` files and legacy Node.js code show empty imports | Add `call_expression` check for `require()` |
| No type-aware cross-file resolution | `find_references` may include unrelated `obj.foo` from different classes | Add optional LSP integration |
| No persistent index | Repeated queries re-parse the same files | Add SQLite symbol index with file-watch invalidation |
| Signature extraction is heuristic | May truncate complex generic signatures | Use tree-sitter queries for precise extraction |
| `import os` in Python mapped to `names: ['os']` | Doesn't distinguish `import os` from `from os import os` | Use distinct `importKind` field |

