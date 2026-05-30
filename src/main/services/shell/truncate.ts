import { mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nanoid } from 'nanoid';

export interface TruncationResult {
  text: string;
  truncated: boolean;
  fullOutputPath: string | null;
}

const MAX_INLINE_BYTES = 50 * 1024;
const MAX_INLINE_LINES = 2000;
const MAX_FILE_AGE_MS = 24 * 60 * 60 * 1000;

const truncDir = join(tmpdir(), 'ase-shell-output');

function saveTempOutput(content: string): string {
  mkdirSync(truncDir, { recursive: true });
  const filePath = join(truncDir, `shell-${nanoid(8)}.txt`);
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

export function truncateOutput(raw: string): TruncationResult {
  const byteSize = Buffer.byteLength(raw, 'utf8');
  const lines = raw.split('\n');

  if (byteSize <= MAX_INLINE_BYTES && lines.length <= MAX_INLINE_LINES) {
    return { text: raw, truncated: false, fullOutputPath: null };
  }

  const fullOutputPath = saveTempOutput(raw);

  // Tail truncate: keep last lines that fit within limits
  let bytes = 0;
  let startLine = lines.length;

  for (let i = lines.length - 1; i >= 0; i--) {
    const lineBytes = Buffer.byteLength(lines[i] + '\n', 'utf8');
    if (bytes + lineBytes > MAX_INLINE_BYTES || lines.length - i > MAX_INLINE_LINES) break;
    bytes += lineBytes;
    startLine = i;
  }

  const truncated = lines.slice(startLine).join('\n');
  const keptLines = lines.length - startLine;
  const header = `[Output truncated: showing last ${keptLines} of ${lines.length} lines. Full output: ${fullOutputPath}]\n\n`;

  return { text: header + truncated, truncated: true, fullOutputPath };
}

export function cleanupTruncationFiles(maxAgeMs = MAX_FILE_AGE_MS): void {
  try {
    const files = readdirSync(truncDir);
    const now = Date.now();
    for (const file of files) {
      const filePath = join(truncDir, file);
      try {
        const stat = statSync(filePath);
        if (now - stat.mtimeMs > maxAgeMs) {
          unlinkSync(filePath);
        }
      } catch {
        // ignore per-file errors
      }
    }
  } catch {
    // Directory may not exist yet — ignore
  }
}
