import { join, relative, sep } from 'node:path';
import { globby } from 'globby';

export const MAX_RESULTS = 100;

export interface GlobOptions {
  pattern: string;
  path?: string;
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
  const cwd = opts.path ? join(root, opts.path) : root;

  const entries = await globby(opts.pattern, {
    cwd,
    onlyFiles: true,
    dot: true,
    suppressErrors: true,
    gitignore: true,
    stats: true,
  });

  // Get mtime for sorting
  const withMtime: { path: string; mtime: number }[] = [];
  for (const entry of entries) {
    const abs = join(cwd, entry.path);
    withMtime.push({
      path: relative(root, abs).split(sep).join('/'),
      mtime: entry.stats?.mtimeMs ?? 0,
    });
  }

  // Sort by mtime descending (most recently modified first)
  withMtime.sort((a, b) => b.mtime - a.mtime);

  const limit = opts.limit ?? MAX_RESULTS;
  const truncated = withMtime.length > limit;
  const files = withMtime.slice(0, limit).map((f) => f.path);

  return { files, count: withMtime.length, truncated };
}
