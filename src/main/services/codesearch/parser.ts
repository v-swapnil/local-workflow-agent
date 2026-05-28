import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
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
  exported: boolean;
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
 */
function extractSignature(node: SyntaxNode, lines: string[]): string {
  const startRow = node.startPosition.row;
  let endRow = startRow;
  for (const child of node.children) {
    if (child.text === '{' || child.text === ')') {
      endRow = child.startPosition.row;
      break;
    }
  }
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

// ─── parseOutline ─────────────────────────────────────────────────────────────

export function parseOutline(source: string, lang: Language): OutlineSymbol[] {
  let tree: ReturnType<Parser['parse']>;
  try {
    tree = getParser(lang).parse(source);
  } catch {
    return [];
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
          exported: false,
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

        const isFunc = valueNode &&
          (valueNode.type === 'arrow_function' || valueNode.type === 'function_expression');
        const isClass = valueNode && valueNode.type === 'class_expression';
        const exported = isNodeExported(node);

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

  // suppress unused variable warning for lines
  void lines;
  return symbols;
}

function parsePythonOutline(root: SyntaxNode): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];

  function visit(node: SyntaxNode, parentClassName: string | null): void {
    if (node.type === 'decorated_definition') {
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
          exported: !parentClassName,
          startLine: toLine(node.startPosition.row),
          endLine: toLine(node.endPosition.row),
        });
      }
      return;
    }

    if (node.type === 'class_definition') {
      const nameNode = node.childForFieldName('name');
      const className = nameNode?.text ?? null;
      if (className) {
        symbols.push({
          name: className, kind: 'class', parentName: null,
          exported: true,
          startLine: toLine(node.startPosition.row),
          endLine: toLine(node.endPosition.row),
        });
      }
      const body = node.childForFieldName('body');
      if (body) {
        for (const child of body.children) {
          visit(child, className);
        }
      }
      return;
    }

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

    const isTypeOnly = node.children.some(
      (c) => c.type === 'type' || (c.type === 'identifier' && c.text === 'type'),
    );

    const sourceNode = node.children.find((c) => c.type === 'string');
    if (!sourceNode) continue;
    const source = sourceNode.text.replace(/^['"`]|['"`]$/g, '');

    const clause = node.children.find((c) => c.type === 'import_clause');
    if (!clause) {
      imports.push({ source, names: ['*'], isTypeOnly: false });
      continue;
    }

    const names: string[] = [];
    for (const part of clause.children) {
      if (part.type === 'identifier') {
        names.push(part.text);
      } else if (part.type === 'namespace_import') {
        names.push('*');
      } else if (part.type === 'named_imports') {
        for (const spec of part.namedChildren) {
          if (spec.type !== 'import_specifier') continue;
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
    if (node.type === 'import_statement') {
      for (const child of node.namedChildren) {
        if (child.type === 'dotted_name') {
          imports.push({ source: child.text, names: [child.text], isTypeOnly: false });
        } else if (child.type === 'aliased_import') {
          const nm = child.childForFieldName('name') ?? child.children[0];
          if (nm) imports.push({ source: nm.text, names: [nm.text], isTypeOnly: false });
        }
      }
      continue;
    }

    if (node.type === 'import_from_statement') {
      const modulePart = node.children.find(
        (c) => c.type === 'dotted_name' || c.type === 'relative_import',
      );
      const source = modulePart?.text ?? '.';

      const names: string[] = [];
      for (const child of node.namedChildren) {
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

// ─── findSymbolNodes ──────────────────────────────────────────────────────────

const DEFINITION_TYPES = new Set([
  'function_declaration',
  'class_declaration',
  'method_definition',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'variable_declarator',
  'function_definition',
  'class_definition',
]);

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
    if (node.type !== 'identifier' && node.type !== 'property_identifier') return;
    if (node.text !== symbol) return;
    const row = node.startPosition.row;
    if (seenLines.has(row)) return;
    seenLines.add(row);
    results.push({
      line: toLine(row),
      text: (lines[row] ?? '').trim(),
    });
  });

  return results;
}
