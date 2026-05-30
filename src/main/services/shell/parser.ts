import Parser from 'tree-sitter';
import Bash from 'tree-sitter-bash';

export interface SubCommand {
  text: string;
  executable: string;
  args: string[];
}

export interface ParsedCommand {
  raw: string;
  subCommands: SubCommand[];
}

let cachedParser: Parser | null = null;

function getBashParser(): Parser {
  if (cachedParser) return cachedParser;
  const p = new Parser();
  p.setLanguage(Bash as Parameters<Parser['setLanguage']>[0]);
  cachedParser = p;
  return p;
}

function extractSubCommandsFromNode(node: Parser.SyntaxNode, out: SubCommand[]): void {
  switch (node.type) {
    case 'command': {
      // command_name field holds the executable
      const nameNode = node.childForFieldName('name');
      const executableText = nameNode?.firstChild?.text ?? nameNode?.text ?? '';
      if (!executableText) break;

      const args: string[] = [];
      for (const child of node.namedChildren) {
        if (child.type === 'variable_assignment') continue;
        if (child === nameNode) continue;
        args.push(child.text);
      }

      out.push({ text: node.text, executable: executableText, args });
      break;
    }
    case 'pipeline':
    case 'list':
    case 'compound_statement':
    case 'subshell':
    case 'command_substitution':
    case 'program': {
      for (const child of node.namedChildren) {
        extractSubCommandsFromNode(child, out);
      }
      break;
    }
    default: {
      for (const child of node.namedChildren) {
        extractSubCommandsFromNode(child, out);
      }
    }
  }
}

function fallbackParse(command: string): SubCommand[] {
  return command
    .split(/\s*(?:&&|\|\||;|\|)\s*/)
    .filter(Boolean)
    .map((part) => {
      const tokens = part.trim().split(/\s+/);
      return { text: part.trim(), executable: tokens[0] ?? '', args: tokens.slice(1) };
    });
}

export function parseCommand(command: string): ParsedCommand {
  try {
    const parser = getBashParser();
    const tree = parser.parse(command);
    const subCommands: SubCommand[] = [];
    extractSubCommandsFromNode(tree.rootNode, subCommands);
    if (subCommands.length === 0) {
      return { raw: command, subCommands: fallbackParse(command) };
    }
    return { raw: command, subCommands };
  } catch {
    return { raw: command, subCommands: fallbackParse(command) };
  }
}
