import { mkdir, stat, rm } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../../db/index.js';
import { workspaces } from '../../db/schema.js';
import { workspacesRoot } from '../../util/paths.js';
import type { WorkspaceRecord } from '@shared/schema.js';

export function toWorkspace(row: typeof workspaces.$inferSelect): WorkspaceRecord {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    managed: !!row.managed,
    createdAt: row.createdAt,
  };
}

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  const rows = getDb().select().from(workspaces).all();
  return rows.map(toWorkspace).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getWorkspace(id: string): Promise<WorkspaceRecord> {
  const row = getDb().select().from(workspaces).where(eq(workspaces.id, id)).get();
  if (!row) throw new Error(`workspace not found: ${id}`);
  return toWorkspace(row);
}

export async function createManagedWorkspace(name: string): Promise<WorkspaceRecord> {
  const id = nanoid(10);
  const safeName =
    name
      .trim()
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .slice(0, 64) || 'workspace';
  const dir = join(workspacesRoot(), `${safeName}-${id}`);
  await mkdir(dir, { recursive: true });
  const ws: WorkspaceRecord = {
    id,
    name: safeName,
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

export async function attachExistingWorkspace(path: string): Promise<WorkspaceRecord> {
  const fileStat = await stat(path);
  if (!fileStat.isDirectory()) throw new Error(`not a directory: ${path}`);
  const id = nanoid(10);
  const ws: WorkspaceRecord = {
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
