import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog';

interface NewCollectionModalProps {
  onCreate: (name: string) => void;
  onClose: () => void;
}

export function NewCollectionModal({ onCreate, onClose }: NewCollectionModalProps) {
  const [name, setName] = useState('');

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="w-[420px] max-w-[90vw] border-transparent bg-ink-900 text-ink-50">
        <DialogHeader>
          <DialogTitle className="font-mono text-ui-sm uppercase tracking-widest2 text-ink-200">
            new collection
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <Label className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
            name
          </Label>
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
            placeholder="e.g. Prompts"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            cancel
          </Button>
          <Button variant="default" size="sm" onClick={submit} disabled={!name.trim()}>
            create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
