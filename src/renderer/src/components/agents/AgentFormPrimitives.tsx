import { Field, FieldLabel } from '../ui/field';

export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Field className="gap-1.5">
      <FieldLabel className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
        {label}
      </FieldLabel>
      {children}
    </Field>
  );
}
