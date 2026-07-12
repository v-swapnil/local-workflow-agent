import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { noteCollections, notes } from '../db/schema.js';
import type { Note, NoteCollection } from '@shared/types';

function toCollection(row: typeof noteCollections.$inferSelect): NoteCollection {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as NoteCollection['kind'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toNote(row: typeof notes.$inferSelect): Note {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags);
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    collectionId: row.collectionId,
    title: row.title,
    content: row.content,
    tags,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// --- collections ---

export function listCollections(): NoteCollection[] {
  const rows = getDb().select().from(noteCollections).all();
  return rows.map(toCollection);
}

export function createCollection(name: string): NoteCollection {
  const now = Date.now();
  const row = {
    id: nanoid(10),
    name,
    kind: 'user' as const,
    createdAt: now,
    updatedAt: now,
  };
  getDb().insert(noteCollections).values(row).run();
  return toCollection(row);
}

export function deleteCollection(id: string): void {
  const db = getDb();
  const [row] = db.select().from(noteCollections).where(eq(noteCollections.id, id)).all();
  if (!row) return;
  if (row.kind === 'default') throw new Error('cannot delete a default collection');
  db.delete(notes).where(eq(notes.collectionId, id)).run();
  db.delete(noteCollections).where(eq(noteCollections.id, id)).run();
}

// --- notes ---

export function listNotes(): Note[] {
  const rows = getDb().select().from(notes).all();
  return rows.map(toNote).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getNote(id: string): Note | undefined {
  const [row] = getDb().select().from(notes).where(eq(notes.id, id)).all();
  return row ? toNote(row) : undefined;
}

export function createNote(collectionId: string): Note {
  const db = getDb();
  const [collection] = db
    .select()
    .from(noteCollections)
    .where(eq(noteCollections.id, collectionId))
    .all();
  if (!collection) throw new Error(`collection not found: ${collectionId}`);
  const now = Date.now();
  const row = {
    id: nanoid(10),
    collectionId,
    title: 'Untitled',
    content: '',
    tags: '[]',
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
  if (patch.tags !== undefined) update.tags = JSON.stringify(patch.tags);
  db.update(notes).set(update).where(eq(notes.id, id)).run();
  const updated = getNote(id);
  if (!updated) throw new Error(`note not found after update: ${id}`);
  return updated;
}

export function deleteNote(id: string): void {
  getDb().delete(notes).where(eq(notes.id, id)).run();
}
