import { stat } from 'node:fs/promises';
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

const MAX_RESULTS = 100;

export interface GlobOptions {
  pattern: string;
  rel?: string;
  limit?: number;
}

/**
 * Search for files by glob pattern within `root`.
 * Returns results sorted by modification time (most recent first), capped at 100.
 */
export async function glob(
  root: string,
  opts: GlobOptions,
): Promise<{ files: string[]; count: number; truncated: boolean }> {
  const cwd = opts.rel ? join(root, opts.rel) : root;

  const entries = await fg(opts.pattern, {
    cwd,
    ignore: DEFAULT_IGNORE,
    onlyFiles: true,
    dot: true,
    suppressErrors: true,
  });

  // Get mtime for sorting
  const withMtime: { path: string; mtime: number }[] = [];
  for (const entry of entries) {
    const abs = join(cwd, entry);
    try {
      const s = await stat(abs);
      withMtime.push({
        path: relative(root, abs).split(sep).join('/'),
        mtime: s.mtimeMs,
      });
    } catch {
      withMtime.push({
        path: relative(root, abs).split(sep).join('/'),
        mtime: 0,
      });
    }
  }

  // Sort by mtime descending (most recently modified first)
  withMtime.sort((a, b) => b.mtime - a.mtime);

  const limit = opts.limit ?? MAX_RESULTS;
  const truncated = withMtime.length > limit;
  const files = withMtime.slice(0, limit).map((f) => f.path);

  return { files, count: withMtime.length, truncated };
}
