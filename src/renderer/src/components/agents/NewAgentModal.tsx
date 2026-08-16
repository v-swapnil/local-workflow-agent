import { useState } from 'react';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { FormDialog, FormField } from '../ui/form-dialog';

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
      description="Agents are autonomous AI entities that can plan and execute tasks. Create a new agent to get started."
      onClose={onClose}
      onSubmit={submit}
      canSubmit={canSave}
      isPending={isPending}
    >
      <FormField label="name">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-agent"
        />
      </FormField>

      <FormField label="role">
        <Input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="backend-engineer"
        />
      </FormField>

      <FormField label="system prompt" optional>
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={5}
          placeholder="You are a skilled backend engineer…"
          className="resize-y leading-relaxed font-mono text-ui-sm"
        />
      </FormField>
    </FormDialog>
  );
}
