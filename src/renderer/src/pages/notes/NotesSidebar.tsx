import { useMemo, useState } from 'react';
import { ChevronRight, Plus, Trash2, X } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../components/ui/collapsible';
import { SidebarListItem } from '../../components/ui/sidebar-list-item';
import { cn } from '../../lib/utils';
import type { Note, NoteCollection } from '@shared/types';
import { Button } from '@renderer/components/ui/button';

interface NotesSidebarProps {
  collections: NoteCollection[];
  notes: Note[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: (collectionId: string) => void;
  onCreateCollection: () => void;
  onDeleteNote: (id: string) => void;
  onDeleteCollection: (id: string) => void;
}

export function NotesSidebar({
  collections,
  notes,
  selectedNoteId,
  onSelectNote,
  onCreateNote,
  onCreateCollection,
  onDeleteNote,
  onDeleteCollection,
}: NotesSidebarProps) {
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});

  const notesByCollection = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const note of notes) {
      const list = map.get(note.collectionId) ?? [];
      list.push(note);
      map.set(note.collectionId, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.createdAt - a.createdAt);
    return map;
  }, [notes]);

  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto rounded-lg border border-ink-800/60 bg-ink-900/20 p-3">
      <button
        type="button"
        onClick={onCreateCollection}
        className="mb-3 flex items-center gap-1.5 rounded-md border border-dashed border-ink-700/60 px-2.5 py-1.5 font-mono text-ui-xs text-ink-400 transition-colors hover:border-ink-600 hover:text-ink-200"
      >
        <Plus className="h-3 w-3" /> new collection
      </button>

      <div className="flex flex-col gap-2">
        {collections.map((collection) => {
          const collectionNotes = notesByCollection.get(collection.id) ?? [];
          const isOpen = !collapsedIds[collection.id];
          return (
            <Collapsible
              key={collection.id}
              open={isOpen}
              onOpenChange={(open) =>
                setCollapsedIds((prev) => ({ ...prev, [collection.id]: !open }))
              }
            >
              <div className="group/header flex items-center justify-between px-1">
                <CollapsibleTrigger className="flex flex-1 items-center gap-1.5 py-1 font-mono text-ui-xs uppercase tracking-widest2 text-ink-500 hover:text-ink-300">
                  <ChevronRight
                    className={cn('h-3 w-3 shrink-0 transition-transform', isOpen && 'rotate-90')}
                  />
                  <span className="truncate">{collection.name}</span>
                  <span className="text-ink-700">({collectionNotes.length})</span>
                </CollapsibleTrigger>
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/header:opacity-100">
                  <button
                    type="button"
                    onClick={() => onCreateNote(collection.id)}
                    title="new note"
                    className="rounded p-1 text-ink-500 hover:text-ink-200"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  {collection.kind !== 'default' && (
                    <button
                      type="button"
                      onClick={() => onDeleteCollection(collection.id)}
                      title="delete collection"
                      className="rounded p-1 text-ink-500 hover:text-signal-err"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <CollapsibleContent className="flex flex-col gap-1 py-1 pl-4">
                {collectionNotes.map((note) => (
                  <SidebarListItem
                    key={note.id}
                    title={note.title || 'Untitled'}
                    isActive={note.id === selectedNoteId}
                    onSelect={() => onSelectNote(note.id)}
                    actions={
                      <Button
                        variant="ghost"
                        size="xs"
                        className="shrink-0 rounded p-1 text-ink-600 hover:bg-rose-950/40 hover:text-rose-400"
                        onClick={() => onDeleteNote(note.id)}
                        title="Delete agent"
                      >
                        <X className="h-3 w-3" strokeWidth={1.2} />
                      </Button>
                    }
                  />
                ))}
                {collectionNotes.length === 0 && (
                  <div className="px-2 py-1 font-mono text-ui-2xs text-ink-600">no notes</div>
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </aside>
  );
}
