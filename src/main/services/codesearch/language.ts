import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import TypeScript from 'tree-sitter-typescript/bindings/node/typescript.js';
import TSX from 'tree-sitter-typescript/bindings/node/tsx.js';
import Python from 'tree-sitter-python';
import { extname } from 'node:path';
import type { Language } from './types.js';

export const IGNORE_PATTERNS = [
  '**/.git/**', '**/node_modules/**', '**/.DS_Store',
  '**/.next/**', '**/dist/**', '**/out/**', '**/.turbo/**',
  '**/.venv/**', '**/venv/**', '**/__pycache__/**', '**/.cache/**',
];

export const SUPPORTED_GLOB = '**/*.{ts,tsx,js,jsx,mjs,cjs,py}';
export const MAX_FILES = 300;
export const MAX_FILE_BYTES = 512 * 1024; // 512 KB — same limit used in grep.ts
export const MAX_SIGNATURE_LENGTH = 200;

const EXT_TO_LANG: Record<string, Language> = {
  '.ts':  'typescript',
  '.tsx': 'tsx',
  '.js':  'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py':  'python',
};

export function detectLanguage(filePath: string): Language | null {
  return EXT_TO_LANG[extname(filePath).toLowerCase()] ?? null;
}

const parserCache = new Map<Language, Parser>();

export function getParser(lang: Language): Parser {
  const existing = parserCache.get(lang);
  if (existing) return existing;
  const p = new Parser();
  switch (lang) {
    case 'typescript': p.setLanguage(TypeScript); break;
    case 'tsx':        p.setLanguage(TSX); break;
    case 'javascript': p.setLanguage(JavaScript); break;
    case 'python':     p.setLanguage(Python); break;
  }
  parserCache.set(lang, p);
  return p;
}
