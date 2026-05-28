import { getParser } from './language.js';
import type { SyntaxNode } from './ast.js';
import type { ImportEntry, Language } from './types.js';

export function parseImports(source: string, lang: Language): ImportEntry[] {
  let tree: ReturnType<ReturnType<typeof getParser>['parse']>;
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
