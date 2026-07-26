import { useState } from 'react';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { FormDialog, FieldLabel } from '../ui/form-dialog';

interface NewAgentModalProps {
  onCreate: (input: { name: string; role: string; systemPrompt?: string }) => void;
  onClose: () => void;
  isPending?: boolean;
}

export function NewAgentModal({ onCreate, onClose, isPending }: NewAgentModalProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');

  const canSave = !!name.trim() && !!role.trim();

  function submit() {
    if (!canSave) return;
    onCreate({
      name: name.trim(),
      role: role.trim(),
      systemPrompt: systemPrompt.trim() || undefined,
    });
  }

  return (
    <FormDialog
      title="new agent"
      onClose={onClose}
      onSubmit={submit}
      canSubmit={canSave}
      isPending={isPending}
    >
      <div className="space-y-1">
        <FieldLabel>name</FieldLabel>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-agent"
        />
      </div>

      <div className="space-y-1">
        <FieldLabel>role</FieldLabel>
        <Input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="backend-engineer"
        />
      </div>

      <div className="space-y-1">
        <FieldLabel optional>system prompt</FieldLabel>
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={5}
          placeholder="You are a skilled backend engineer…"
          className="resize-y leading-relaxed font-mono text-ui-sm"
        />
      </div>
    </FormDialog>
  );
}
