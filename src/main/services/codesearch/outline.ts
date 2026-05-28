import { getParser } from './language.js';
import { walk, toLine, tryMakeSymbol, findParentClassName, variableKind, isNodeExported } from './ast.js';
import type { SyntaxNode } from './ast.js';
import type { OutlineSymbol, Language } from './types.js';

export function parseOutline(source: string, lang: Language): OutlineSymbol[] {
  let tree: ReturnType<ReturnType<typeof getParser>['parse']>;
  try {
    tree = getParser(lang).parse(source);
  } catch {
    return [];
  }

  if (lang === 'python') {
    return parsePythonOutline(tree.rootNode);
  }
  return parseTsJsOutline(tree.rootNode);
}

function parseTsJsOutline(root: SyntaxNode): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = [];

  walk(root, (node) => {
    let sym: OutlineSymbol | null = null;
    switch (node.type) {
      case 'function_declaration':   sym = tryMakeSymbol(node, 'function');   break;
      case 'class_declaration':      sym = tryMakeSymbol(node, 'class');       break;
      case 'interface_declaration':  sym = tryMakeSymbol(node, 'interface');   break;
      case 'type_alias_declaration': sym = tryMakeSymbol(node, 'type');        break;
      case 'enum_declaration':       sym = tryMakeSymbol(node, 'enum');        break;
      case 'method_definition':
        sym = tryMakeSymbol(node, 'method', findParentClassName(node), false);
        break;
      case 'variable_declarator': {
        const nameNode = node.childForFieldName('name');
        if (!nameNode) break;
        sym = {
          name: nameNode.text,
          kind: variableKind(node.childForFieldName('value')),
          parentName: null,
          exported: isNodeExported(node),
          startLine: toLine(node.startPosition.row),
          endLine: toLine(node.endPosition.row),
        };
        break;
      }
    }
    if (sym) symbols.push(sym);
  });

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
