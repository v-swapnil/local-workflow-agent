import { useState } from 'react';
import { trpc } from '../../trpc';
import { cn } from '../../lib/utils';

type NewSkillModalProps = {
  onClose: () => void;
};

function Input({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-1 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
        {label}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full rounded-md border border-ink-700/50 bg-ink-950/80 px-3 py-1.5 font-mono text-ui-xs text-ink-100 placeholder:text-ink-600 transition-colors focus:border-amber/30 focus:outline-none',
          mono && 'font-mono',
        )}
      />
    </label>
  );
}

export function NewSkillModal({ onClose }: NewSkillModalProps) {
  const utils = trpc.useUtils();
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [whenToUse, setWhenToUse] = useState('');
  const [tags, setTags] = useState('');

  const create = trpc.skill.create.useMutation({
    onSuccess: () => {
      utils.skill.list.invalidate();
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-[520px] max-w-[90vw] rounded-xl border border-amber/20 bg-ink-900 shadow-2xl animate-scale-in">
        <div className="border-b border-ink-800/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber/10 px-2 py-0.5 font-mono text-ui-2xs uppercase tracking-widest2 text-amber">
              new skill
            </span>
          </div>
        </div>
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!id || !name || !description) return;
            create.mutate({
              id: id.trim(),
              name: name.trim(),
              description: description.trim(),
              whenToUse: whenToUse.trim() || undefined,
              tags: tags
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
            });
          }}
        >
          <Input label="id (folder name)" value={id} onChange={setId} placeholder="my-skill" mono />
          <Input label="name" value={name} onChange={setName} placeholder="My Skill" />
          <Input
            label="description"
            value={description}
            onChange={setDescription}
            placeholder="What this skill does."
          />
          <Input
            label="when_to_use"
            value={whenToUse}
            onChange={setWhenToUse}
            placeholder="When the user asks to…"
          />
          <Input
            label="tags (comma-separated)"
            value={tags}
            onChange={setTags}
            placeholder="testing, refactor"
            mono
          />
          {create.error && (
            <div className="font-mono text-ui-xs text-signal-err">{create.error.message}</div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              cancel
            </button>
            <button
              type="submit"
              disabled={!id || !name || !description || create.isPending}
              className="btn-primary"
            >
              {create.isPending ? 'creating…' : 'create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
