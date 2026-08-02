import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, relative, sep } from 'node:path';
import { globby } from 'globby';
import { safeJoin } from '@main/util/safePath';

const MAX_RESULTS = 500;
const MAX_FILE_BYTES = 512 * 1024; // 512 KB

interface GrepOptions {
  pattern: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  path?: string;
  include?: string;
}

interface GrepHit {
  path: string;
  line: number;
  content: string;
}
interface GrepResultV2 {
  files: Array<{
    path: string;
    matches: string[];
  }>;
  count: number;
  truncated: boolean;
}

const execFileAsync = promisify(execFile);

// Resolved once per process lifetime — null means rg not available.
let rgPath: string | null | undefined;

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

function aggregateMatches(matches: GrepHit[]): Array<{ path: string; matches: string[] }> {
  const filesMap = new Map<string, string[]>();
  for (const match of matches) {
    if (!filesMap.has(match.path)) {
      filesMap.set(match.path, []);
    }
    filesMap.get(match.path)?.push(`${match.line}:${match.content}`);
  }
  return Array.from(filesMap.entries()).map(([path, matches]) => ({ path, matches }));
}

async function grepWithRipgrep(root: string, opts: GrepOptions): Promise<GrepResultV2> {
  const rg = await findRipgrep();
  if (!rg) throw new Error('rg not available');

  const args = ['--no-config', '--json', '--hidden', '--glob=!.git/*', '--no-messages'];
  if (!opts.caseSensitive) args.push('--ignore-case');
  if (!opts.isRegex) args.push('--fixed-strings');
  args.push('--max-filesize', String(MAX_FILE_BYTES));
  if (opts.include) args.push('--glob', opts.include);
  // Always pass '.' so rg searches the filesystem, not stdin.
  // Without an explicit path, rg reads stdin when it isn't a TTY (e.g. inside Electron).
  args.push('--', opts.pattern, '.');

  try {
    const cwd = opts.path ? safeJoin(root, opts.path) : root;
    const result = await execFileAsync(rg, args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30_000,
    });

    const lines = result.stdout.split('\n');
    const matches: GrepHit[] = [];
    let total = 0;

    for (const line of lines) {
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

      if (matches.length < MAX_RESULTS) {
        const relativePath = relative(root, join(cwd, msg.data.path.text)).split(sep).join('/');
        matches.push({
          path: relativePath,
          line: msg.data.line_number,
          content: msg.data.lines.text,
        });
      }
    }

    return { files: aggregateMatches(matches), count: total, truncated: total > MAX_RESULTS };
  } catch (err: unknown) {
    // rg exits with code 1 when no matches found — that's OK
    if (err && typeof err === 'object' && 'code' in err && err.code === 1) {
      return { files: [], count: 0, truncated: false };
    }
    throw err; // stderr in the error or real failures — fall through to JS
  }
}

/**
 * Recursive content grep within `root`. Uses native ripgrep when available,
 * falls back to fast-glob + JS scanning. Returns hits with truncation metadata.
 */
export async function grep(root: string, opts: GrepOptions): Promise<GrepResultV2> {
  // Try ripgrep first
  try {
    return await grepWithRipgrep(root, opts);
  } catch {}

  const matcher = opts.isRegex ? new RegExp(opts.pattern, opts.caseSensitive ? '' : 'i') : null;
  const needle = opts.caseSensitive ? opts.pattern : opts.pattern.toLowerCase();

  const cwd = opts.path ? safeJoin(root, opts.path) : root;

  // Use || (not ??) so empty string also falls back to '**/*'
  const globPattern = opts.include || '**/*';
  const entries = await globby(globPattern, {
    cwd,
    onlyFiles: true,
    dot: true,
    suppressErrors: true,
    stats: true,
    gitignore: true,
  });

  const matches: GrepHit[] = [];

  let total = 0;

  for (const entry of entries) {
    const stats = entry.stats;
    if (stats && stats.size > MAX_FILE_BYTES) continue;
    const abs = join(cwd, entry.path);
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
        if (matches.length < MAX_RESULTS) {
          const rel = relative(root, abs).split(sep).join('/');
          matches.push({ path: rel, line: i + 1, content: line });
        }
      }
    }
  }

  return { files: aggregateMatches(matches), count: total, truncated: total > MAX_RESULTS };
}
