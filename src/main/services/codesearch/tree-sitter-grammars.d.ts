declare module 'tree-sitter-javascript' {
  import type Parser from 'tree-sitter';
  const grammar: Parser.Language;
  export = grammar;
}

declare module 'tree-sitter-typescript/typescript' {
  import type Parser from 'tree-sitter';
  const grammar: Parser.Language;
  export = grammar;
}

declare module 'tree-sitter-typescript/tsx' {
  import type Parser from 'tree-sitter';
  const grammar: Parser.Language;
  export = grammar;
}

declare module 'tree-sitter-python' {
  import type Parser from 'tree-sitter';
  const grammar: Parser.Language;
  export = grammar;
}
