import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
  /** Number of context lines before and after each match (default 0). */
  context?: number;
}

export interface GrepResult {
  hits: GrepHit[];
  /** Total number of matches found (may exceed hits.length if truncated). */
  total: number;
  truncated: boolean;
}

// Resolved once per process lifetime — null means rg not available.
let rgPath: string | null | undefined;

const execFileAsync = promisify(execFile);

async function findRipgrep(): Promise<string | null> {
  if (rgPath !== undefined) return rgPath;
  try {
    const { stdout } = await execFileAsync('which', ['rg'], { timeout: 3000 });
    rgPath = stdout.trim();
  } catch {
    rgPath = null;
  }
  return rgPath;
}

async function grepWithRipgrep(root: string, opts: GrepOptions): Promise<GrepResult> {
  const rg = await findRipgrep();
  if (!rg) throw new Error('rg not available');

  const maxHits = opts.maxHits ?? 500;
  const maxFileBytes = opts.maxFileBytes ?? 512 * 1024;
  const cwd = opts.rel ? join(root, opts.rel) : root;
  const contextLines = opts.context ?? 0;

  const args: string[] = ['--json'];
  if (!opts.caseSensitive) args.push('--ignore-case');
  if (!opts.isRegex) args.push('--fixed-strings');
  args.push('--max-filesize', String(maxFileBytes));
  if (contextLines > 0) args.push('-C', String(contextLines));
  if (opts.include) args.push('--glob', opts.include);
  // Ignore default dirs
  for (const ig of DEFAULT_IGNORE) {
    args.push('--glob', `!${ig}`);
  }
  args.push('--', opts.pattern);

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(rg, args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30_000,
    }));
  } catch (err: unknown) {
    // rg exits with code 1 when no matches found — that's OK
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: number | string }).code === 1
    ) {
      return { hits: [], total: 0, truncated: false };
    }
    // stderr in the error or real failures — fall through to JS
    throw err;
  }

  const hits: GrepHit[] = [];
  let total = 0;
  const MAX_COUNT = maxHits * 10; // stop counting after this to avoid O(n) on huge repos

  for (const line of stdout.split('\n')) {
    if (!line) continue;
    let msg: {
      type: string;
      data: { path: { text: string }; line_number: number; lines: { text: string } };
    };
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.type !== 'match') continue;
    total++;
    if (hits.length < maxHits) {
      const relPath = relative(root, join(cwd, msg.data.path.text)).split(sep).join('/');
      hits.push({
        path: relPath,
        line: msg.data.line_number,
        text: msg.data.lines.text.trimEnd(),
      });
    }
    if (total >= MAX_COUNT) break;
  }

  return { hits, total, truncated: total > maxHits };
}

/**
 * Recursive content grep within `root`. Uses native ripgrep when available,
 * falls back to fast-glob + JS scanning. Returns hits with truncation metadata.
 */
export async function grep(root: string, opts: GrepOptions): Promise<GrepResult> {
  // Try ripgrep first
  try {
    return await grepWithRipgrep(root, opts);
  } catch {
    // Fall through to JS implementation
  }

  const maxHits = opts.maxHits ?? 500;
  const maxFileBytes = opts.maxFileBytes ?? 512 * 1024;
  const cwd = opts.rel ? join(root, opts.rel) : root;
  const contextLines = opts.context ?? 0;

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
  let total = 0;
  const MAX_COUNT = maxHits * 10;
  let done = false;

  for (const entry of entries) {
    if (done) break;
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
        total++;
        if (hits.length < maxHits) {
          const rel = relative(root, abs).split(sep).join('/');
          if (contextLines > 0) {
            for (let c = Math.max(0, i - contextLines); c < i; c++) {
              hits.push({ path: rel, line: c + 1, text: lines[c] ?? '' });
            }
          }
          hits.push({ path: rel, line: i + 1, text: line });
          if (contextLines > 0) {
            for (let c = i + 1; c <= Math.min(lines.length - 1, i + contextLines); c++) {
              hits.push({ path: rel, line: c + 1, text: lines[c] ?? '' });
            }
          }
        }
        if (total >= MAX_COUNT) { done = true; break; }
      }
    }
  }

  return { hits, total, truncated: total > maxHits };
}
