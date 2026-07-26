import type { ReactNode } from 'react';
import { Button } from './button';
import { Label } from './label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './dialog';

interface FormDialogProps {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  isPending?: boolean;
  submitLabel?: string;
  pendingLabel?: string;
  children: ReactNode;
}

/** Shared shell for "create record" modals: titled dialog + cancel/submit footer. */
export function FormDialog({
  title,
  onClose,
  onSubmit,
  canSubmit,
  isPending = false,
  submitLabel = 'create',
  pendingLabel = 'creating…',
  children,
}: FormDialogProps) {
  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="w-[460px] max-w-[90vw] border-transparent bg-ink-900 text-ink-50">
        <DialogHeader>
          <DialogTitle className="font-mono text-ui-sm uppercase tracking-widest2 text-ink-200">
            {title}
          </DialogTitle>
        </DialogHeader>

        {children}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            cancel
          </Button>
          <Button variant="default" size="sm" onClick={onSubmit} disabled={!canSubmit || isPending}>
            {isPending ? pendingLabel : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Uppercase mono field label with an optional "optional" hint. */
export function FieldLabel({ children, optional }: { children: ReactNode; optional?: boolean }) {
  return (
    <Label className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
      {children}
      {optional && <span className="ml-1.5 normal-case tracking-normal text-ink-600">optional</span>}
    </Label>
  );
}
