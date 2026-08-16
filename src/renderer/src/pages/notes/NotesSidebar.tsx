import { Plus, FileText, X } from 'lucide-react';
import { SidebarListItem } from '../../components/ui/sidebar-list-item';
import type { Note } from '@shared/types';
import { Button } from '@renderer/components/ui/button';

interface NotesSidebarProps {
  notes: Note[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: string) => void;
}

export function NotesSidebar({
  notes,
  selectedNoteId,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
}: NotesSidebarProps) {
  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto rounded-lg bg-ink-900/20 p-3 group/sidebar">
      {notes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-800/40">
            <FileText className="h-4 w-4 text-ink-500" strokeWidth={1.3} />
          </div>
          <span className="font-mono text-ui-xs text-ink-500">no notes yet</span>
        </div>
      ) : (
        <ul className="min-w-0 space-y-px">
          {notes.map((note) => (
            <li key={note.id}>
              <SidebarListItem
                title={note.title || 'Untitled'}
                description={note.tags.join(', ')}
                isActive={note.id === selectedNoteId}
                onSelect={() => onSelectNote(note.id)}
                actions={
                  <Button
                    variant="ghost"
                    size="xs"
                    className="shrink-0 rounded p-1 text-ink-600 hover:bg-rose-950/40 hover:text-rose-400"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteNote(note.id);
                    }}
                    title="Delete note"
                  >
                    <X className="h-3 w-3" strokeWidth={1.2} />
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="outline"
        size="xs"
        className="flex invisible !mt-2 group-hover/sidebar:visible items-center w-full border-dashed gap-1.5 py-4 font-mono hover:border-amber/30 hover:bg-amber/8 hover:text-amber"
        onClick={onCreateNote}
      >
        <Plus className="h-3 w-3" strokeWidth={1.5} />
        new note
      </Button>
    </aside>
  );
}
