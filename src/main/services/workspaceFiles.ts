import { mkdir, readdir, stat, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join, dirname, sep } from 'node:path';
import { safeJoin } from '../util/safePath.js';
import { getWorkspace } from './workspaceDb.js';

const IGNORED = new Set(['.git', 'node_modules', '.DS_Store', '.next', 'dist', 'out', '.turbo']);
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
const DEFAULT_READ_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;
const MAX_OUTPUT_BYTES = 50 * 1024; // 50 KB

export interface FileNode {
  name: string;
  path: string; // workspace-relative, posix-style
  isDir: boolean;
  size?: number;
  children?: FileNode[];
}

export interface ReadFileResult {
  content: string;
  /** Total bytes of the file on disk. */
  size: number;
  /** Total line count in the file. */
  lines: number;
  /** Whether the returned content is a subset of the file. */
  truncated: boolean;
}

export async function fileTree(workspaceId: string, relPath = '', depth = 4): Promise<FileNode> {
  const ws = await getWorkspace(workspaceId);
  const abs = relPath ? safeJoin(ws.path, relPath) : ws.path;
  return walk(ws.path, abs, depth);
}

async function walk(root: string, abs: string, depth: number): Promise<FileNode> {
  const fileStat = await stat(abs);
  const rel =
    abs === root
      ? ''
      : abs
          .slice(root.length + 1)
          .split(sep)
          .join('/');
  const name = abs.split(sep).at(-1)!;
  if (!fileStat.isDirectory()) {
    return { name, path: rel, isDir: false, size: fileStat.size };
  }
  const node: FileNode = { name, path: rel, isDir: true, children: [] };
  if (depth <= 0) return node;
  let entries: string[];
  try {
    entries = await readdir(abs);
  } catch {
    return node;
  }
  entries.sort((a, b) => a.localeCompare(b));
  const children: FileNode[] = [];
  for (const entry of entries) {
    if (IGNORED.has(entry)) continue;
    const childAbs = join(abs, entry);
    try {
      const child = await walk(root, childAbs, depth - 1);
      children.push(child);
    } catch {
      /* skip unreadable */
    }
  }
  // dirs first, then files
  children.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
  node.children = children;
  return node;
}

export async function readSourceFile(filePath: string): Promise<{ content: string; size: number }> {
  const fileStats = await stat(filePath);
  if (fileStats.isDirectory()) throw new Error('is a directory');
  const content = await readFile(filePath, 'utf8');
  return { content, size: fileStats.size };
}

export async function readWorkspaceFile(
  workspaceId: string,
  relPath: string,
  offset?: number,
  limit?: number,
): Promise<ReadFileResult> {
  const ws = await getWorkspace(workspaceId);
  const filePath = safeJoin(ws.path, relPath);

  if (offset === undefined && limit === undefined) {
    const { content, size } = await readSourceFile(filePath);
    return {
      content,
      size,
      lines: content.split('\n').length,
      truncated: false,
    };
  }

  return readTextFileFromRoot(filePath, offset, limit);
}

export async function readTextFileFromRoot(
  filePath: string,
  offset?: number,
  limit?: number,
): Promise<ReadFileResult> {
  const { content: fileContent, size: fileSize } = await readSourceFile(filePath);

  if (fileSize > MAX_FILE_BYTES)
    throw new Error(`file too large (${fileSize} bytes, max ${MAX_FILE_BYTES})`);

  const allLines = fileContent.split('\n');
  const totalLines = allLines.length;

  const start = (offset ?? 1) - 1; // 1-based → 0-based
  const maxLines = limit ?? DEFAULT_READ_LIMIT;

  const lines: string[] = [];
  let bytes = 0;
  let cut = false;
  let more = false;

  for (let i = start; i < totalLines; i++) {
    if (lines.length >= maxLines) {
      more = true;
      break;
    }
    let line = allLines[i]!;
    if (line.length > MAX_LINE_LENGTH) {
      line = line.substring(0, MAX_LINE_LENGTH) + `... (line truncated)`;
    }
    const entryBytes = Buffer.byteLength(line, 'utf8') + (lines.length > 0 ? 1 : 0);
    if (bytes + entryBytes > MAX_OUTPUT_BYTES) {
      cut = true;
      more = true;
      break;
    }
    lines.push(line);
    bytes += entryBytes;
  }

  const last = start + lines.length;
  const truncated = more || cut || start > 0;

  const content = [`<path>${filePath}</path>`, `<type>file</type>`, '<content>\n'];

  if (lines.length === 0) {
    content.push('\n\n(file is empty)');
  } else {
    content.push(lines.join('\n'));
  }

  if (cut) {
    content.push(`\n\n(output truncated at ${MAX_OUTPUT_BYTES} bytes)`);
    content.push(
      `\n\n(Output capped at ${MAX_OUTPUT_BYTES / 1024} KB. Showing lines ${start + 1}-${last}. Use offset=${last + 1} to continue.)`,
    );
  } else if (more) {
    content.push(
      `\n\n(Showing lines ${start + 1}-${last} of ${totalLines}. Use offset=${last + 1} to continue.)`,
    );
  } else {
    content.push(`\n\n(End of file — total ${totalLines} lines)`);
  }

  content.push('\n</content>');

  return { content: content.join('\n'), size: fileSize, lines: totalLines, truncated };
}

export async function writeWorkspaceFile(
  workspaceId: string,
  relPath: string,
  content: string,
): Promise<void> {
  const ws = await getWorkspace(workspaceId);
  const abs = safeJoin(ws.path, relPath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf8');
}

export async function renameWorkspaceFile(
  workspaceId: string,
  fromRel: string,
  toRel: string,
): Promise<void> {
  const ws = await getWorkspace(workspaceId);
  const fromAbs = safeJoin(ws.path, fromRel);
  const toAbs = safeJoin(ws.path, toRel);
  await mkdir(dirname(toAbs), { recursive: true });
  await rename(fromAbs, toAbs);
}

export async function deleteWorkspacePath(workspaceId: string, relPath: string): Promise<void> {
  const ws = await getWorkspace(workspaceId);
  const abs = safeJoin(ws.path, relPath);
  await rm(abs, { recursive: true, force: true });
}
