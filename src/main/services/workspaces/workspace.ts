import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../../db/index.js';
import { workspaces } from '../../db/schema.js';
import type { WorkspaceRecord } from '@shared/schema.js';

function toWorkspace(row: typeof workspaces.$inferSelect): WorkspaceRecord {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
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

export async function attachExistingWorkspace(path: string): Promise<WorkspaceRecord> {
  const fileStat = await stat(path);
  if (!fileStat.isDirectory()) throw new Error(`not a directory: ${path}`);
  const id = nanoid(10);
  const ws: WorkspaceRecord = {
    id,
    name: basename(path),
    path,
    createdAt: Date.now(),
  };
  getDb()
    .insert(workspaces)
    .values({
      id: ws.id,
      name: ws.name,
      path: ws.path,
      createdAt: ws.createdAt,
    })
    .run();
  return ws;
}

export async function deleteWorkspace(id: string): Promise<void> {
  getDb().delete(workspaces).where(eq(workspaces.id, id)).run();
}
