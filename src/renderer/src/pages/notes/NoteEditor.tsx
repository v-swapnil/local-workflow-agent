import { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
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

  const addTag = () => {
    const value = tagInput.trim();
    if (!value || tags.includes(value)) {
      setTagInput('');
      return;
    }
    setTags([...tags, value]);
    setTagInput('');
  };

  const toggleMode = () => {
    setMode((prevMode) => (prevMode === 'wysiwyg' ? 'markdown' : 'wysiwyg'));
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const noteTags = (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-800/60 py-2">
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="outline"
          className="gap-1 border-ink-700/60 font-mono text-ui-2xs text-ink-300"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="text-ink-500 hover:text-ink-200"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addTag();
          }
        }}
        placeholder="+ tag"
        className="w-20 bg-transparent font-mono text-ui-2xs text-ink-400 outline-none placeholder:text-ink-600"
      />
    </div>
  );

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
          <Switch
            checked={mode === 'markdown'}
            onCheckedChange={toggleMode}
            className="mt-0.5 shrink-0"
          />
          <Label className="flex items-center gap-1.5">
            <div className="font-mono text-ui-sm font-medium text-ink-50">Markdown</div>
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
