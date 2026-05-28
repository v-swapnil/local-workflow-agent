import { relative, join, sep } from 'node:path';
import fg from 'fast-glob';
import { detectLanguage, IGNORE_PATTERNS, SUPPORTED_GLOB, MAX_FILES, MAX_FILE_BYTES } from './language.js';
import type { CodeFile } from './types.js';

/**
 * Return up to MAX_FILES code files under `root`, optionally scoped to `rel`.
 * Files larger than MAX_FILE_BYTES are silently skipped.
 */
export async function enumerateCodeFiles(root: string, rel?: string): Promise<CodeFile[]> {
  const cwd = rel ? join(root, rel) : root;
  const entries = await fg(SUPPORTED_GLOB, {
    cwd,
    ignore: IGNORE_PATTERNS,
    onlyFiles: true,
    dot: true,
    suppressErrors: true,
    stats: true,
  });

  const results: CodeFile[] = [];
  for (const entry of entries) {
    if (results.length >= MAX_FILES) break;
    const stats = (entry as { stats?: { size: number } }).stats;
    if (stats && stats.size > MAX_FILE_BYTES) continue;
    const relPath = relative(root, join(cwd, (entry as { path: string }).path))
      .split(sep).join('/');
    const lang = detectLanguage(relPath);
    if (!lang) continue;
    results.push({ absPath: join(root, relPath), relPath, lang });
  }
  return results;
}
