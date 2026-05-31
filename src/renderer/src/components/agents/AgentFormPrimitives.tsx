import { Badge } from '../ui/badge';
import { Label } from '../ui/label';

export function RoleBadge({ role }: { role: string }) {
  return (
    <Badge
      variant="outline"
      className="border-amber/20 bg-amber/8 font-mono text-ui-2xs uppercase tracking-widest2 text-amber"
    >
      {role || '—'}
    </Badge>
  );
}

export function ModelTag({ model, provider }: { model: string; provider: string }) {
  return (
    <span className="flex items-center gap-1 font-mono text-ui-2xs text-ink-500">
      <span className="text-ink-600">{provider}</span>
      <span className="text-ink-700">/</span>
      <span>{model || '…'}</span>
    </span>
  );
}

export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label className="flex flex-col gap-1.5 font-normal">
      <span className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">{label}</span>
      {children}
    </Label>
  );
}

export const inputClass =
  'rounded-md border border-ink-700/80 bg-ink-900/50 px-3 py-2 font-mono text-ui-sm text-ink-100 placeholder:text-ink-600 transition-all hover:border-ink-600 focus:border-amber/40 focus:outline-none focus:bg-ink-900/80';

export const selectClass =
  'rounded-md border border-ink-700/80 bg-ink-900/50 px-3 py-2 font-mono text-ui-sm text-ink-100 transition-all hover:border-ink-600 focus:border-amber/40 focus:outline-none cursor-pointer';
