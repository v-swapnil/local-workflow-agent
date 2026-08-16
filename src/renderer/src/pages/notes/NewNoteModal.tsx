import { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { FormDialog, FormField } from '../../components/ui/form-dialog';

interface NewNoteModalProps {
  onCreate: (input: { title: string; tags: string[] }) => void;
  onClose: () => void;
  isPending?: boolean;
}

export function NewNoteModal({ onCreate, onClose, isPending }: NewNoteModalProps) {
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (!tag) return;
    setTags((current) => (current.includes(tag) ? current : [...current, tag]));
    setTagInput('');
  }

  function removeTag(target: string) {
    setTags((current) => current.filter((tag) => tag !== target));
  }

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onCreate({ title: trimmed, tags });
  }

  return (
    <FormDialog
      title="new note"
      description="Give your note a name and optional tags to keep things organized."
      onClose={onClose}
      onSubmit={submit}
      canSubmit={!!title.trim()}
      isPending={isPending}
    >
      <FormField label="name">
        <Input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="e.g. release checklist"
          maxLength={48}
        />
      </FormField>

      <FormField label="tags" optional>
        <Input
          value={tagInput}
          onChange={(event) => setTagInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              addTag(tagInput);
            } else if (event.key === 'Backspace' && !tagInput && tags.length > 0) {
              removeTag(tags[tags.length - 1]!);
            }
          }}
          placeholder="type a tag and press enter"
        />
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded border border-ink-700/50 px-1.5 py-0.5 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-300"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="text-ink-500 hover:text-signal-err"
                  title="Remove tag"
                >
                  <X className="h-2.5 w-2.5" strokeWidth={1.5} />
                </button>
              </span>
            ))}
          </div>
        )}
      </FormField>
    </FormDialog>
  );
}
