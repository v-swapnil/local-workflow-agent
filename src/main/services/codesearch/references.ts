import { getParser } from './language.js';
import { walk, toLine, extractSignature, isNodeExported } from './ast.js';
import type { DefinitionResult, ReferenceResult, Language } from './types.js';

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
): Array<Pick<DefinitionResult, 'line' | 'signature' | 'exported'>> {
  let tree: ReturnType<ReturnType<typeof getParser>['parse']>;
  try {
    tree = getParser(lang).parse(source);
  } catch {
    return [];
  }

  const results: Array<Pick<DefinitionResult, 'line' | 'signature' | 'exported'>> = [];
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

export function findReferenceNodes(
  source: string,
  symbol: string,
  lang: Language,
): Array<Pick<ReferenceResult, 'line' | 'text'>> {
  let tree: ReturnType<ReturnType<typeof getParser>['parse']>;
  try {
    tree = getParser(lang).parse(source);
  } catch {
    return [];
  }

  const results: Array<Pick<ReferenceResult, 'line' | 'text'>> = [];
  const lines = source.split('\n');
  const seenLines = new Set<number>();

  walk(tree.rootNode, (node) => {
    if (node.type !== 'identifier' && node.type !== 'property_identifier') return;
    if (node.text !== symbol) return;
    const row = node.startPosition.row;
    if (seenLines.has(row)) return;
    seenLines.add(row);
    results.push({ line: toLine(row), text: (lines[row] ?? '').trim() });
  });

  return results;
}
