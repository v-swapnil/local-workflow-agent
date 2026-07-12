import { useState } from 'react';
import { PageShell } from '../../components/PageShell';
import { trpc } from '../../trpc';
import { NotesSidebar } from './NotesSidebar';
import { NoteEditor } from './NoteEditor';
import { NewCollectionModal } from './NewCollectionModal';

export function Notes() {
  const utils = trpc.useUtils();
  const collections = trpc.notes.listCollections.useQuery();
  const notesQuery = trpc.notes.list.useQuery();
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [showNewCollection, setShowNewCollection] = useState(false);

  const createCollection = trpc.notes.createCollection.useMutation({
    onSuccess: () => {
      utils.notes.listCollections.invalidate();
      setShowNewCollection(false);
    },
  });
  const deleteCollection = trpc.notes.deleteCollection.useMutation({
    onSuccess: () => {
      utils.notes.listCollections.invalidate();
      utils.notes.list.invalidate();
    },
  });
  const createNote = trpc.notes.create.useMutation({
    onSuccess: (note) => {
      utils.notes.list.invalidate();
      setSelectedNoteId(note.id);
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
    <PageShell path="notes" title="Notes" subtitle="Markdown notes & prompts">
      <div className="grid h-[calc(100vh-220px)] grid-cols-[280px_1fr] gap-6">
        <NotesSidebar
          collections={collections.data ?? []}
          notes={notesQuery.data ?? []}
          selectedNoteId={selectedNoteId}
          onSelectNote={setSelectedNoteId}
          onCreateNote={(collectionId) => createNote.mutate({ collectionId })}
          onCreateCollection={() => setShowNewCollection(true)}
          onDeleteNote={(id) => {
            if (window.confirm('Delete this note?')) deleteNote.mutate({ id });
          }}
          onDeleteCollection={(id) => {
            if (window.confirm('Delete this collection and all its notes?')) {
              deleteCollection.mutate({ id });
            }
          }}
        />

        <main className="min-h-0 min-w-0 overflow-y-auto rounded-lg border border-ink-800/60 bg-ink-900/20 p-5">
          {selectedNote ? (
            <NoteEditor key={selectedNote.id} note={selectedNote} />
          ) : (
            <div className="flex h-full items-center justify-center font-mono text-ui-sm text-ink-500">
              select or create a note
            </div>
          )}
        </main>
      </div>

      {showNewCollection && (
        <NewCollectionModal
          onCreate={(name) => createCollection.mutate({ name })}
          onClose={() => setShowNewCollection(false)}
        />
      )}
    </PageShell>
  );
}
