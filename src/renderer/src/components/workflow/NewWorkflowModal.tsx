import { useState } from 'react';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { FormDialog, FieldLabel } from '../ui/form-dialog';

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
      onClose={onClose}
      onSubmit={submit}
      canSubmit={!!name.trim()}
      isPending={isPending}
    >
      <div className="space-y-1">
        <FieldLabel>name</FieldLabel>
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
      </div>

      <div className="space-y-1">
        <FieldLabel optional>description</FieldLabel>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="what does this workflow do?"
          className="resize-y leading-relaxed"
        />
      </div>
    </FormDialog>
  );
}
