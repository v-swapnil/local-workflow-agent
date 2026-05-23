import { readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import fg from 'fast-glob';

const DEFAULT_IGNORE = [
  '**/.git/**',
  '**/node_modules/**',
  '**/.DS_Store',
  '**/.next/**',
  '**/dist/**',
  '**/out/**',
  '**/.turbo/**',
  '**/.venv/**',
  '**/venv/**',
  '**/__pycache__/**',
  '**/.cache/**',
];

export interface GrepHit {
  path: string;
  line: number;
  text: string;
}

export interface GrepOptions {
  pattern: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  rel?: string;
  /** Glob pattern to filter which files are searched (e.g. "*.ts"). */
  include?: string;
  maxHits?: number;
  /** Skip files larger than this (bytes). */
  maxFileBytes?: number;
}

/**
 * Recursive content grep within `root`. File traversal via fast-glob;
 * per-file scanning is plain string/regex search.
 */
export async function grep(root: string, opts: GrepOptions): Promise<GrepHit[]> {
  const maxHits = opts.maxHits ?? 500;
  const maxFileBytes = opts.maxFileBytes ?? 512 * 1024;
  const cwd = opts.rel ? join(root, opts.rel) : root;

  const matcher = opts.isRegex ? new RegExp(opts.pattern, opts.caseSensitive ? '' : 'i') : null;
  const needle = opts.caseSensitive ? opts.pattern : opts.pattern.toLowerCase();

  const globPattern = opts.include ?? '**/*';
  const entries = await fg(globPattern, {
    cwd,
    ignore: DEFAULT_IGNORE,
    onlyFiles: true,
    dot: true,
    suppressErrors: true,
    stats: true,
  });

  const hits: GrepHit[] = [];
  for (const entry of entries) {
    if (hits.length >= maxHits) break;
    const stats = (entry as { stats?: { size: number } }).stats;
    if (stats && stats.size > maxFileBytes) continue;
    const abs = join(cwd, (entry as { path: string }).path);
    let text: string;
    try {
      text = await readFile(abs, 'utf8');
    } catch {
      continue;
    }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const hay = opts.caseSensitive ? line : line.toLowerCase();
      const match = matcher ? matcher.test(line) : hay.includes(needle);
      if (match) {
        const rel = relative(root, abs).split(sep).join('/');
        hits.push({ path: rel, line: i + 1, text: line });
        if (hits.length >= maxHits) break;
      }
    }
  }
  return hits;
}
