import { mkdir, readdir, stat, readFile, writeFile, rename, rm, open } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { safeJoin } from '../../util/safePath.js';
import { getWorkspace } from './workspace.js';
import { gitFor } from '../git/gitCore.js';
import { FileNode } from '@shared/types.js';

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_LINE_LENGTH = 2000;

export async function readWorkspaceDirectory(
  workspaceId: number,
  relativePath?: string,
): Promise<FileNode[]> {
  const ws = await getWorkspace(workspaceId);
  const abs = relativePath ? safeJoin(ws.path, relativePath) : ws.path;
  if (!(await stat(abs)).isDirectory()) throw new Error('ERROR: not a directory.');
  const entries = await readdir(abs);
  const results: FileNode[] = [];
  for (const entry of entries) {
    const stats = await stat(join(abs, entry));
    results.push({
      type: stats.isDirectory() ? 'directory' : 'file',
      path: entry,
      size: stats.size,
    });
  }
  return results;
}

export async function listWorkspaceFiles({ workspaceId }: { workspaceId: number }) {
  const workspace = await getWorkspace(workspaceId);
  const git = gitFor(workspace.path);
  const result = await git.raw(['ls-files', '--cached', '--others', '--exclude-standard']);
  const paths = result.split('\n');
  return paths;
}

async function isBinaryFile(filePath: string): Promise<boolean> {
  const fd = await open(filePath, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const { bytesRead } = await fd.read(buf, 0, 8192, 0);
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0) return true;
    }
    return false;
  } finally {
    await fd.close();
  }
}

export async function readSourceFile(filePath: string): Promise<string> {
  const stats = await stat(filePath);
  if (stats.isDirectory()) throw new Error('ERROR: path is a directory, not a file.');
  if (await isBinaryFile(filePath)) throw new Error('ERROR: binary file detected.');
  if (stats.size > MAX_FILE_BYTES)
    throw new Error(
      `ERROR: file too large (${stats.size} bytes). max allowed is ${MAX_FILE_BYTES} bytes.`,
    );
  const content = await readFile(filePath, 'utf8');
  return content;
}

export async function readWorkspaceFile(
  workspaceId: number,
  relativePath: string,
  options?: { offset?: number; limit?: number; prefixLineNumber?: boolean },
): Promise<string> {
  const workspace = await getWorkspace(workspaceId);
  const filePath = safeJoin(workspace.path, relativePath);
  const fileContent = await readSourceFile(filePath);

  if (options?.offset || options?.limit) {
    const lines = fileContent.split('\n');
    const start = (options.offset ?? 1) - 1; // 1-based → 0-based
    const end = start + (options.limit ?? MAX_LINE_LENGTH);

    if (start < 0) throw new Error(`ERROR: offset must be >= 1.`);
    if (start >= lines.length)
      throw new Error(`ERROR: offset ${options.offset} exceeds total lines ${lines.length}.`);

    const content = options.prefixLineNumber
      ? lines.slice(start, end).map((line, index) => `${start + 1 + index}:${line}`)
      : lines.slice(start, end);

    return content.join('\n');
  }

  return options?.prefixLineNumber
    ? fileContent
        .split('\n')
        .map((line, index) => `${index + 1}:${line}`)
        .join('\n')
    : fileContent;
}

export async function writeWorkspaceFile(
  workspaceId: number,
  relPath: string,
  content: string,
): Promise<void> {
  const ws = await getWorkspace(workspaceId);
  const abs = safeJoin(ws.path, relPath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf8');
}

export async function renameWorkspaceFile(
  workspaceId: number,
  fromRel: string,
  toRel: string,
): Promise<void> {
  const ws = await getWorkspace(workspaceId);
  const fromAbs = safeJoin(ws.path, fromRel);
  const toAbs = safeJoin(ws.path, toRel);
  await mkdir(dirname(toAbs), { recursive: true });
  await rename(fromAbs, toAbs);
}

export async function deleteWorkspacePath(workspaceId: number, relPath: string): Promise<void> {
  const ws = await getWorkspace(workspaceId);
  const abs = safeJoin(ws.path, relPath);
  await rm(abs, { recursive: true, force: true });
}
