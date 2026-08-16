import type { ReactNode } from 'react';
import { Button } from './button';
import { Field, FieldLabel } from './field';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from './dialog';
import { Separator } from './separator';

interface FormDialogProps {
  title: string;
  description?: string;
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
  description,
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
      <DialogContent className="w-[460px] max-w-[90vw] border-transparent bg-ink-900 text-ink-50 !p-4">
        <DialogHeader>
          <DialogTitle className="font-mono text-ui-sm uppercase tracking-widest2 text-ink-200">
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
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

/** Labeled form row: Field wrapper + uppercase mono label with an optional "optional" hint. */
export function FormField({
  label,
  optional,
  children,
}: {
  label: ReactNode;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <Field className="gap-1.5">
      <FieldLabel className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
        {label}
        {optional && <span className="normal-case tracking-normal text-ink-600">optional</span>}
      </FieldLabel>
      {children}
    </Field>
  );
}
