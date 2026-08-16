import { useEffect, useRef } from 'react';
import { trpc } from '../../trpc';

interface NotePatch {
  title?: string;
  content?: string;
  tags?: string[];
}

const AUTOSAVE_DELAY_MS = 600;

/** Debounced autosave for a note. Cancels pending saves when the note changes. */
export function useNoteAutosave(noteId: string, patch: NotePatch) {
  const utils = trpc.useUtils();
  const update = trpc.notes.update.useMutation({
    onSuccess: () => utils.notes.list.invalidate(),
  });
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const { title, content, tags } = patch;

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      update.mutate({ id: noteId, title, content, tags });
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [noteId, title, content, tags]);

  return { isSaving: update.isPending };
}
