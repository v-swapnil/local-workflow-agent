import { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { TreeNode, TreeLeaf } from '../../components/ui/tree-node';
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

  const toggle = (id: string) => setCollapsedIds((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto rounded-lg bg-ink-900/20 p-3 group/sidebar">
      <div className="flex flex-col gap-1">
        {collections.map((collection) => {
          const collectionNotes = notesByCollection.get(collection.id) ?? [];
          const isOpen = !collapsedIds[collection.id];
          return (
            <div key={collection.id}>
              <TreeNode
                isActive={collectionNotes.some((note) => note.id === selectedNoteId)}
                isExpanded={isOpen}
                onExpandedChange={() => toggle(collection.id)}
                onSelect={() => toggle(collection.id)}
                content={
                  <>
                    <span className="truncate text-ui-sm font-medium tracking-tight text-ink-200">
                      {collection.name}
                    </span>
                    <div className="mt-0.5 font-mono text-ui-2xs text-ink-500">
                      {collectionNotes.length} note{collectionNotes.length !== 1 ? 's' : ''}
                    </div>
                  </>
                }
                actions={
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="xs"
                      className="rounded p-1 text-ink-500 hover:bg-ink-800 hover:text-ink-200"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateNote(collection.id);
                      }}
                      title="new note"
                    >
                      <Plus className="h-3 w-3" strokeWidth={1.5} />
                    </Button>
                  </div>
                }
              >
                {collectionNotes.length > 0 ? (
                  collectionNotes.map((note, i) => (
                    <TreeLeaf
                      key={note.id}
                      isActive={note.id === selectedNoteId}
                      isLast={i === collectionNotes.length - 1}
                      onSelect={() => onSelectNote(note.id)}
                      content={
                        <span className="min-w-0 flex-1 truncate font-mono text-ui-xs">
                          {note.title || 'Untitled'}
                        </span>
                      }
                      actions={
                        <Button
                          variant="ghost"
                          size="xs"
                          className="shrink-0 rounded p-1 text-ink-600 hover:bg-rose-950/40 hover:text-rose-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteNote(note.id);
                          }}
                          title="Delete note"
                        >
                          <X className="h-3 w-3" strokeWidth={1.2} />
                        </Button>
                      }
                    />
                  ))
                ) : (
                  <div className="ml-4 py-2 font-mono text-ui-2xs text-ink-600">no notes</div>
                )}
              </TreeNode>
            </div>
          );
        })}
      </div>

      <Button
        variant="outline"
        size="xs"
        className="flex invisible !mt-2 group-hover/sidebar:visible items-center w-full border-dashed gap-1.5 py-4 font-mono hover:border-amber/30 hover:bg-amber/8 hover:text-amber"
        onClick={onCreateCollection}
      >
        <Plus className="h-3 w-3" strokeWidth={1.5} />
        new collection
      </Button>
    </aside>
  );
}
