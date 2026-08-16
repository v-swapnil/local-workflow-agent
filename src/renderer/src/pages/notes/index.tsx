import { useState } from 'react';
import { trpc } from '../../trpc';
import { NotesSidebar } from './NotesSidebar';
import { NoteEditor } from './NoteEditor';
import { NewNoteModal } from './NewNoteModal';

export function Notes() {
  const utils = trpc.useUtils();
  const notesQuery = trpc.notes.list.useQuery();
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const createNote = trpc.notes.create.useMutation({
    onSuccess: (note) => {
      utils.notes.list.invalidate();
      setSelectedNoteId(note.id);
      setIsCreating(false);
    },
  });
  const deleteNote = trpc.notes.delete.useMutation({
    onSuccess: (_result, variables) => {
      utils.notes.list.invalidate();
      setSelectedNoteId((current) => (current === variables.id ? null : current));
    },
  });

  const selectedNote = notesQuery.data?.find((note) => note.id === selectedNoteId) ?? null;

  return (
    <div className="grid h-full grid-cols-[280px_1fr] gap-6">
      <NotesSidebar
        notes={notesQuery.data ?? []}
        selectedNoteId={selectedNoteId}
        onSelectNote={setSelectedNoteId}
        onCreateNote={() => setIsCreating(true)}
        onDeleteNote={(id) => {
          if (window.confirm('Delete this note?')) deleteNote.mutate({ id });
        }}
      />

      <section className="min-h-0 min-w-0 overflow-y-auto rounded-lg border border-ink-800/60 bg-ink-900/20 p-5">
        {selectedNote ? (
          <NoteEditor key={selectedNote.id} note={selectedNote} />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-ui-sm text-ink-500">
            select or create a note
          </div>
        )}
      </section>

      {isCreating && (
        <NewNoteModal
          onCreate={(input) => createNote.mutate(input)}
          onClose={() => setIsCreating(false)}
          isPending={createNote.isPending}
        />
      )}
    </div>
  );
}
