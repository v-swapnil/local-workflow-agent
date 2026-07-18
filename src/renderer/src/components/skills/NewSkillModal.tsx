import { useState } from 'react';
import { trpc } from '../../trpc';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';

type NewSkillModalProps = {
  onClose: () => void;
};

function LabeledInput({
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
    <div className="space-y-1">
      <Label className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
        {label}
      </Label>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={mono ? 'font-mono' : undefined}
      />
    </div>
  );
}

export function NewSkillModal({ onClose }: NewSkillModalProps) {
  const utils = trpc.useUtils();

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
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="w-[520px] max-w-[90vw] border-transparent bg-ink-900 p-0 text-ink-50">
        <DialogHeader className="border-b border-ink-800/60 px-5 py-3">
          <DialogTitle className="font-mono text-ui-sm uppercase tracking-widest2 text-ink-200">
            new skill
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name || !description) return;
            create.mutate({
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
          <LabeledInput label="name" value={name} onChange={setName} placeholder="My Skill" />
          <LabeledInput
            label="description"
            value={description}
            onChange={setDescription}
            placeholder="What this skill does."
          />
          <LabeledInput
            label="when_to_use"
            value={whenToUse}
            onChange={setWhenToUse}
            placeholder="When the user asks to…"
          />
          <LabeledInput
            label="tags (comma-separated)"
            value={tags}
            onChange={setTags}
            placeholder="testing, refactor"
            mono
          />
          {create.error && (
            <div className="font-mono text-ui-xs text-signal-err">{create.error.message}</div>
          )}
        </form>
        <DialogFooter className="flex items-center justify-end gap-2 px-5 py-4">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            cancel
          </Button>
          <Button
            type="submit"
            variant="default"
            size="sm"
            disabled={!name || !description || create.isPending}
          >
            {create.isPending ? 'creating…' : 'create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
