import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

export function Pill({ ok, label }: { ok?: boolean; label: string }) {
  const color =
    ok === undefined
      ? 'border-ink-700 text-ink-400'
      : ok
        ? 'border-signal-ok text-signal-ok'
        : 'border-signal-err text-signal-err';
  return (
    <Badge
      variant="outline"
      className={cn('font-mono text-ui-xs uppercase tracking-widest2', color)}
    >
      {label}
    </Badge>
  );
}
