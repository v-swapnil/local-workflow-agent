import { getParser } from './language.js';
import { walk, toLine } from './ast.js';
import type { SyntaxNode } from './ast.js';
import type { ExportEntry, Language } from './types.js';

export function parseExports(source: string, lang: Language): ExportEntry[] {
  let tree: ReturnType<ReturnType<typeof getParser>['parse']>;
  try {
    tree = getParser(lang).parse(source);
  } catch {
    return [];
  }

  if (lang === 'python') return parsePythonExports(tree.rootNode);
  return parseTsJsExports(tree.rootNode);
}

function parseTsJsExports(root: SyntaxNode): ExportEntry[] {
  const entries: ExportEntry[] = [];

  walk(root, (node) => {
    if (node.type !== 'export_statement') return;

    const line = toLine(node.startPosition.row);

    // export default ...
    const isDefault = node.children.some((c) => c.type === 'default');
    if (isDefault) {
      // Try to get a name from the exported value
      const val = node.children.find(
        (c) =>
          c.type === 'function_declaration' ||
          c.type === 'class_declaration' ||
          c.type === 'identifier',
      );
      const name = val?.childForFieldName?.('name')?.text ?? val?.text ?? 'default';
      entries.push({ name, kind: 'default', line, isReExport: false });
      return;
    }

    // export { a, b } from './module'  OR  export { a, b }
    const exportClause = node.children.find((c) => c.type === 'export_clause');
    if (exportClause) {
      const fromNode = node.children.find((c) => c.type === 'string');
      const source = fromNode?.text.replace(/^['"`]|['"`]$/g, '');
      const isReExport = !!source;
      for (const spec of exportClause.namedChildren) {
        if (spec.type !== 'export_specifier') continue;
        // use 'name' field (original name) not 'alias'
        const nameNode =
          spec.childForFieldName('name') ?? spec.children.find((c) => c.type === 'identifier');
        if (!nameNode) continue;
        entries.push({
          name: nameNode.text,
          kind: 're-export',
          line,
          isReExport,
          source,
        });
      }
      return;
    }

    // export * from './module'
    const starNode = node.children.find((c) => c.type === 'namespace_export' || c.text === '*');
    if (starNode) {
      const fromNode = node.children.find((c) => c.type === 'string');
      const source = fromNode?.text.replace(/^['"`]|['"`]$/g, '');
      entries.push({ name: '*', kind: 're-export', line, isReExport: true, source });
      return;
    }

    // export const/let/var, export function, export class, export type, export interface, export enum
    for (const child of node.children) {
      switch (child.type) {
        case 'function_declaration':
        case 'generator_function_declaration': {
          const name = child.childForFieldName('name')?.text;
          if (name) entries.push({ name, kind: 'function', line, isReExport: false });
          break;
        }
        case 'class_declaration': {
          const name = child.childForFieldName('name')?.text;
          if (name) entries.push({ name, kind: 'class', line, isReExport: false });
          break;
        }
        case 'interface_declaration': {
          const name = child.childForFieldName('name')?.text;
          if (name) entries.push({ name, kind: 'interface', line, isReExport: false });
          break;
        }
        case 'type_alias_declaration': {
          const name = child.childForFieldName('name')?.text;
          if (name) entries.push({ name, kind: 'type', line, isReExport: false });
          break;
        }
        case 'enum_declaration': {
          const name = child.childForFieldName('name')?.text;
          if (name) entries.push({ name, kind: 'enum', line, isReExport: false });
          break;
        }
        case 'lexical_declaration':
        case 'variable_declaration': {
          for (const decl of child.namedChildren) {
            if (decl.type !== 'variable_declarator') continue;
            const name = decl.childForFieldName('name')?.text;
            if (!name) continue;
            const val = decl.childForFieldName('value');
            const kind =
              val?.type === 'arrow_function' || val?.type === 'function_expression'
                ? ('function' as const)
                : ('variable' as const);
            entries.push({ name, kind, line, isReExport: false });
          }
          break;
        }
      }
    }
  });

  return entries;
}

function parsePythonExports(root: SyntaxNode): ExportEntry[] {
  // Python doesn't have explicit export keywords; surface top-level public names.
  const entries: ExportEntry[] = [];

  for (const node of root.children) {
    // __all__ = [...]
    if (node.type === 'expression_statement' || node.type === 'assignment') {
      const assignment = node.type === 'expression_statement' ? node.children[0] : node;
      if (!assignment) continue;
      const lhs = assignment.childForFieldName?.('left') ?? assignment.children[0];
      if (lhs?.text === '__all__') {
        const rhs = assignment.childForFieldName?.('right') ?? assignment.children[2];
        if (rhs) {
          for (const item of rhs.namedChildren) {
            const name = item.text.replace(/^['"]|['"]$/g, '');
            if (name) {
              entries.push({
                name,
                kind: 'variable',
                line: toLine(node.startPosition.row),
                isReExport: false,
              });
            }
          }
        }
        return entries; // __all__ is authoritative
      }
    }

    // Top-level public functions and classes (not starting with _)
    if (node.type === 'function_definition') {
      const name = node.childForFieldName('name')?.text;
      if (name && !name.startsWith('_')) {
        entries.push({
          name,
          kind: 'function',
          line: toLine(node.startPosition.row),
          isReExport: false,
        });
      }
    }
    if (node.type === 'class_definition') {
      const name = node.childForFieldName('name')?.text;
      if (name && !name.startsWith('_')) {
        entries.push({
          name,
          kind: 'class',
          line: toLine(node.startPosition.row),
          isReExport: false,
        });
      }
    }
    if (node.type === 'decorated_definition') {
      const inner = node.children.find(
        (c) => c.type === 'function_definition' || c.type === 'class_definition',
      );
      if (inner) {
        const name = inner.childForFieldName('name')?.text;
        const kind = inner.type === 'class_definition' ? 'class' : 'function';
        if (name && !name.startsWith('_')) {
          entries.push({ name, kind, line: toLine(node.startPosition.row), isReExport: false });
        }
      }
    }
  }

  return entries;
}
