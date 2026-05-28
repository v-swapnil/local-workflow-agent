// Barrel — re-exports all public APIs for the codesearch module.
// Internal consumers import from here so callers outside codesearch/
// have a single stable import path.
export type { Language, OutlineSymbol, ImportEntry, DefinitionResult, ReferenceResult, CodeFile } from './types.js';
export { detectLanguage } from './language.js';
export { enumerateCodeFiles } from './enumerate.js';
export { parseOutline } from './outline.js';
export { parseImports } from './imports.js';
export { findSymbolNodes, findReferenceNodes } from './references.js';
