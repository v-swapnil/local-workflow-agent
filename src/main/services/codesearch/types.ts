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

export interface CodeFile {
  absPath: string;
  relPath: string; // workspace-relative, forward slashes
  lang: Language;
}
