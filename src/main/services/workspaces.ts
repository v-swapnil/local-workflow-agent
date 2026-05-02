import { mkdir, readdir, stat, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join, basename, dirname, sep } from 'node:path';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { workspaces } from '../db/schema.js';
import { workspacesRoot } from '../util/paths.js';
import { safeJoin } from '../util/safePath.js';

export interface Workspace {
  id: string;
  name: string;
  path: string;
  managed: boolean;
  createdAt: number;
}

const IGNORED = new Set(['.git', 'node_modules', '.DS_Store', '.next', 'dist', 'out', '.turbo']);
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

export async function listWorkspaces(): Promise<Workspace[]> {
  const rows = getDb().select().from(workspaces).all();
  return rows.map(toWorkspace).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getWorkspace(id: string): Promise<Workspace> {
  const row = getDb().select().from(workspaces).where(eq(workspaces.id, id)).get();
  if (!row) throw new Error(`workspace not found: ${id}`);
  return toWorkspace(row);
}

export async function createManagedWorkspace(name: string): Promise<Workspace> {
  const id = nanoid(10);
  const safe =
    name
      .trim()
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .slice(0, 64) || 'workspace';
  const dir = join(workspacesRoot(), `${safe}-${id}`);
  await mkdir(dir, { recursive: true });
  const ws: Workspace = {
    id,
    name: safe,
    path: dir,
    managed: true,
    createdAt: Date.now(),
  };
  getDb()
    .insert(workspaces)
    .values({
      id: ws.id,
      name: ws.name,
      path: ws.path,
      managed: ws.managed,
      createdAt: ws.createdAt,
    })
    .run();
  return ws;
}

export async function attachExistingWorkspace(path: string): Promise<Workspace> {
  const s = await stat(path);
  if (!s.isDirectory()) throw new Error(`not a directory: ${path}`);
  const id = nanoid(10);
  const ws: Workspace = {
    id,
    name: basename(path),
    path,
    managed: false,
    createdAt: Date.now(),
  };
  getDb()
    .insert(workspaces)
    .values({
      id: ws.id,
      name: ws.name,
      path: ws.path,
      managed: ws.managed,
      createdAt: ws.createdAt,
    })
    .run();
  return ws;
}

export async function deleteWorkspace(id: string, alsoDeleteFiles: boolean): Promise<void> {
  const ws = await getWorkspace(id);
  getDb().delete(workspaces).where(eq(workspaces.id, id)).run();
  if (alsoDeleteFiles && ws.managed) {
    await rm(ws.path, { recursive: true, force: true });
  }
}

// ───────── files ─────────

export interface FileNode {
  name: string;
  path: string; // workspace-relative, posix-style
  isDir: boolean;
  size?: number;
  children?: FileNode[];
}

export async function fileTree(workspaceId: string, relPath = '', depth = 4): Promise<FileNode> {
  const ws = await getWorkspace(workspaceId);
  const abs = relPath ? safeJoin(ws.path, relPath) : ws.path;
  return walk(ws.path, abs, depth);
}

async function walk(root: string, abs: string, depth: number): Promise<FileNode> {
  const s = await stat(abs);
  const rel =
    abs === root
      ? ''
      : abs
          .slice(root.length + 1)
          .split(sep)
          .join('/');
  const name = abs === root ? basename(root) : basename(abs);
  if (!s.isDirectory()) {
    return { name, path: rel, isDir: false, size: s.size };
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

export async function readWorkspaceFile(
  workspaceId: string,
  relPath: string,
): Promise<{ content: string; size: number; truncated: boolean }> {
  const ws = await getWorkspace(workspaceId);
  const abs = safeJoin(ws.path, relPath);
  const s = await stat(abs);
  if (s.isDirectory()) throw new Error('is a directory');
  const truncated = s.size > MAX_FILE_BYTES;
  const buf = await readFile(abs);
  const content = truncated
    ? buf.subarray(0, MAX_FILE_BYTES).toString('utf8')
    : buf.toString('utf8');
  return { content, size: s.size, truncated };
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

function toWorkspace(row: typeof workspaces.$inferSelect): Workspace {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    managed: !!row.managed,
    createdAt: row.createdAt,
  };
}
