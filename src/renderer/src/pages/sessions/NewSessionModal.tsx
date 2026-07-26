import { useState } from 'react';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { FormDialog, FieldLabel } from '../../components/ui/form-dialog';

interface NewSessionModalProps {
  onCreate: (input: { title: string; context?: string }) => void;
  onClose: () => void;
  isPending?: boolean;
}

export function NewSessionModal({ onCreate, onClose, isPending }: NewSessionModalProps) {
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onCreate({ title: trimmed, context: context.trim() || undefined });
  }

  return (
    <FormDialog
      title="new session"
      onClose={onClose}
      onSubmit={submit}
      canSubmit={!!title.trim()}
      isPending={isPending}
    >
      <div className="space-y-1">
        <FieldLabel>session name</FieldLabel>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="e.g. refactor auth flow"
        />
      </div>

      <div className="space-y-1">
        <FieldLabel optional>additional context</FieldLabel>
        <Textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={4}
          placeholder="notes or constraints saved as a session memory…"
          className="resize-y leading-relaxed"
        />
      </div>
    </FormDialog>
  );
}
