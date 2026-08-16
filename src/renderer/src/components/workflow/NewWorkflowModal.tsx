import { useState } from 'react';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { FormDialog, FormField } from '../ui/form-dialog';

interface NewWorkflowModalProps {
  onCreate: (input: { name: string; description?: string }) => void;
  onClose: () => void;
  isPending?: boolean;
}

export function NewWorkflowModal({ onCreate, onClose, isPending }: NewWorkflowModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate({ name: trimmed, description: description.trim() || undefined });
  }

  return (
    <FormDialog
      title="new workflow"
      description="Workflows are sequences of tasks that can be executed by agents. Create a new workflow to get started."
      onClose={onClose}
      onSubmit={submit}
      canSubmit={!!name.trim()}
      isPending={isPending}
    >
      <FormField label="name">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="my-workflow"
        />
      </FormField>

      <FormField label="description" optional>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="what does this workflow do?"
          className="resize-y leading-relaxed"
        />
      </FormField>
    </FormDialog>
  );
}
