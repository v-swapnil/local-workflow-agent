import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { notes } from '../db/schema.js';
import type { Note } from '@shared/types';

function toNote(row: typeof notes.$inferSelect): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: row.tags.split(',') ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// --- notes ---

export function listNotes(): Note[] {
  const rows = getDb().select().from(notes).all();
  return rows.map(toNote).sort((a, b) => b.createdAt - a.createdAt);
}

export function getNote(id: string): Note | undefined {
  const [row] = getDb().select().from(notes).where(eq(notes.id, id)).all();
  return row ? toNote(row) : undefined;
}

export function createNote(input?: { title?: string; tags?: string[] }): Note {
  const db = getDb();
  const now = Date.now();
  const row = {
    id: nanoid(10),
    title: input?.title?.trim() || 'Untitled',
    content: '',
    tags: (input?.tags ?? []).join(','),
    createdAt: now,
    updatedAt: now,
  };
  db.insert(notes).values(row).run();
  return toNote(row);
}

export function updateNote(
  id: string,
  patch: { title?: string; content?: string; tags?: string[] },
): Note {
  const db = getDb();
  const existing = getNote(id);
  if (!existing) throw new Error(`note not found: ${id}`);
  const update: Partial<typeof notes.$inferInsert> = { updatedAt: Date.now() };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.content !== undefined) update.content = patch.content;
  if (patch.tags !== undefined) update.tags = patch.tags.join(',');
  db.update(notes).set(update).where(eq(notes.id, id)).run();
  const updated = getNote(id);
  if (!updated) throw new Error(`note not found after update: ${id}`);
  return updated;
}

export function deleteNote(id: string): void {
  getDb().delete(notes).where(eq(notes.id, id)).run();
}
