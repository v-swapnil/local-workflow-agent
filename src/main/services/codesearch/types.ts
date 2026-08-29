export type Language = 'typescript' | 'tsx' | 'javascript' | 'python';

export interface OutlineSymbol {
  name: string;
  kind: 'function' | 'class' | 'method' | 'interface' | 'type' | 'enum' | 'variable';
  exported: boolean;
  startLine: number; // 1-based
  endLine: number; // 1-based
  signature: string; // length-capped declaration header
}

export interface ImportEntry {
  source: string;
  names: string[];
}

export interface ExportEntry {
  name: string;
  kind: 'function' | 'class' | 'type' | 'interface' | 'variable' | 'enum' | 'default' | 're-export';
  line: number;
}

export interface DefinitionResult {
  path: string;
  line: number;
  content: string;
}

export interface ReferenceResult {
  path: string;
  line: number;
  content: string;
}

export interface FileOutline {
  symbols: OutlineSymbol[];
  imports: ImportEntry[];
  exports: ExportEntry[];
}
