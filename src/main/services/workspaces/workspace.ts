import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { workspaces } from '../../db/schema.js';
import type { WorkspaceRecord } from '@shared/schema.js';

export const listWorkspaces = (): WorkspaceRecord[] => {
  return getDb()
    .select()
    .from(workspaces)
    .all()
    .sort((a, b) => b.createdAt - a.createdAt);
};

export const getWorkspace = (id: number): WorkspaceRecord => {
  const row = getDb().select().from(workspaces).where(eq(workspaces.id, id)).get();
  if (!row) throw new Error(`workspace not found: ${id}`);
  return row;
};

export const attachExistingWorkspace = async (path: string): Promise<WorkspaceRecord> => {
  const fileStat = await stat(path);

  if (!fileStat.isDirectory()) throw new Error(`not a directory: ${path}`);

  return getDb()
    .insert(workspaces)
    .values({
      name: basename(path),
      path,
      createdAt: Date.now(),
    })
    .returning()
    .get();
};

export const deleteWorkspace = (id: number) => {
  getDb().delete(workspaces).where(eq(workspaces.id, id)).run();
};
