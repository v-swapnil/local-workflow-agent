import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { notes } from '../db/schema.js';
import { NoteRecord } from '@shared/schema.js';

export const listNotes = (): NoteRecord[] => {
  return getDb()
    .select()
    .from(notes)
    .all()
    .sort((a, b) => b.createdAt - a.createdAt);
};

export const getNote = (id: number): NoteRecord | undefined => {
  return getDb().select().from(notes).where(eq(notes.id, id)).get();
};

export const createNote = (input?: { title?: string; tags?: string[] }): NoteRecord => {
  const now = Date.now();
  return getDb()
    .insert(notes)
    .values({
      title: input?.title?.trim() || 'Untitled',
      content: '',
      tags: (input?.tags ?? []).join(','),
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
};

export const updateNote = (id: number, patch: Partial<NoteRecord>): NoteRecord => {
  const existing = getNote(id);
  if (!existing) throw new Error(`note not found: ${id}`);
  return getDb().update(notes).set(patch).where(eq(notes.id, id)).returning().get();
};

export const deleteNote = (id: number): void => {
  getDb().delete(notes).where(eq(notes.id, id)).run();
};
