import { useState } from 'react';
import { Input } from '../../components/ui/input';
import { LexicalNoteEditor, type NoteEditorMode } from './editor/LexicalNoteEditor';
import { useNoteAutosave } from './useNoteAutosave';
import type { Note } from '@shared/types';
import { Switch } from '@renderer/components/ui/switch';
import { Label } from '@renderer/components/ui/label';

/** Mounted with `key={note.id}` by the caller so switching notes fully remounts
 * this component — local state always starts from the correct note and any
 * pending autosave timer for the previous note is cancelled on unmount. */
export function NoteEditor({ note }: { note: Note }) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [tagInput, setTagInput] = useState('');
  const [mode, setMode] = useState<NoteEditorMode>('wysiwyg');

  const { isSaving } = useNoteAutosave(note.id, { title, content, tags });

  const toggleMode = () => {
    setMode((prevMode) => (prevMode === 'wysiwyg' ? 'markdown' : 'wysiwyg'));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-ink-800/60 pb-3">
        <div className="w-full">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled"
            className="h-auto border-none bg-transparent px-0 py-0 text-lg font-medium text-ink-50 shadow-none focus-visible:ring-0"
            maxLength={48}
          />

          <div className="mt-1 flex items-center gap-2 font-mono text-ui-2xs text-ink-500">
            <span>{isSaving ? 'saving…' : 'saved'}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Label className="flex cursor-pointer items-center gap-2 rounded-md border border-ink-700/50 px-3 py-1.5 transition-colors hover:border-ink-600">
            <Switch
              checked={mode === 'markdown'}
              onCheckedChange={toggleMode}
              aria-label="enabled"
            />
            <span className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-200">
              markdown
            </span>
          </Label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-4">
        <LexicalNoteEditor
          noteId={note.id}
          mode={mode}
          initialValue={content}
          onChange={setContent}
        />
      </div>
    </div>
  );
}
