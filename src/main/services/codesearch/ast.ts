import Parser from 'tree-sitter';
import { MAX_SIGNATURE_LENGTH } from './language.js';
import type { OutlineSymbol } from './types.js';

// Type alias so we don't need to import SyntaxNode from tree-sitter directly
export type SyntaxNode = ReturnType<Parser['parse']>['rootNode'];

/** Depth-first walk of every node in the tree, calling visitor for each. */
export function walk(node: SyntaxNode, visitor: (n: SyntaxNode) => void): void {
  visitor(node);
  for (const child of node.children) {
    walk(child, visitor);
  }
}

/** Convert tree-sitter's 0-based row to a 1-based line number. */
export function toLine(row: number): number {
  return row + 1;
}

/**
 * Extract a signature string from a declaration node.
 * Reads from the node's start row through the row of the first `{` or `)` child,
 * joined with spaces, trimmed, capped at MAX_SIGNATURE_LENGTH chars.
 */
export function extractSignature(node: SyntaxNode, lines: string[]): string {
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
  return sig.length > MAX_SIGNATURE_LENGTH ? sig.slice(0, MAX_SIGNATURE_LENGTH) + '...' : sig;
}

/** Check if a node is wrapped in an export_statement. */
export function isNodeExported(node: SyntaxNode): boolean {
  let ancestor: SyntaxNode | null = node.parent;
  while (ancestor) {
    if (ancestor.type === 'export_statement') return true;
    // Stop at a function body so nested declarations don't inherit the enclosing function's export.
    if (
      ancestor.type === 'program' ||
      ancestor.type === 'class_body' ||
      ancestor.type === 'statement_block'
    ) {
      break;
    }
    ancestor = ancestor.parent;
  }
  return false;
}

/**
 * True when a declaration sits at module top level or is a class member,
 * i.e. it is not nested inside a function/method body (`statement_block`).
 */
export function isTopLevelDeclaration(node: SyntaxNode): boolean {
  let ancestor: SyntaxNode | null = node.parent;
  while (ancestor) {
    if (ancestor.type === 'statement_block') return false;
    if (ancestor.type === 'program') return true;
    ancestor = ancestor.parent;
  }
  return true;
}

/** Build an OutlineSymbol from a declaration node, or null if it has no name. */
export function tryMakeSymbol(
  node: SyntaxNode,
  kind: OutlineSymbol['kind'],
  lines: string[],
  exported?: boolean,
): OutlineSymbol | null {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return null;
  return {
    name: nameNode.text,
    kind,
    exported: exported ?? isNodeExported(node),
    startLine: toLine(node.startPosition.row),
    endLine: toLine(node.endPosition.row),
    signature: extractSignature(node, lines),
  };
}

/** Determine symbol kind for a variable_declarator based on its value node type. */
export function variableKind(valueNode: SyntaxNode | null): OutlineSymbol['kind'] {
  if (valueNode?.type === 'arrow_function' || valueNode?.type === 'function_expression') {
    return 'function';
  }
  if (valueNode?.type === 'class_expression') return 'class';
  return 'variable';
}
