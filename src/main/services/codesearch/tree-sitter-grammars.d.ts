declare module 'tree-sitter-javascript' {
  import type Parser from 'tree-sitter';
  const grammar: Parser.Language;
  export = grammar;
}

declare module 'tree-sitter-typescript/bindings/node/typescript.js' {
  import type Parser from 'tree-sitter';
  const grammar: Parser.Language;
  export = grammar;
}

declare module 'tree-sitter-typescript/bindings/node/tsx.js' {
  import type Parser from 'tree-sitter';
  const grammar: Parser.Language;
  export = grammar;
}

declare module 'tree-sitter-python' {
  import type Parser from 'tree-sitter';
  const grammar: Parser.Language;
  export = grammar;
}
