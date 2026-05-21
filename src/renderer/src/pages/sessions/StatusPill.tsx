import { cn } from '../../lib/utils';

export function StatusPill({ status, compact }: { status: string; compact?: boolean }) {
  const palette: Record<string, string> = {
    queued: 'border-ink-700/40 bg-ink-800/20 text-ink-400',
    running: 'border-amber/20 bg-amber/8 text-amber',
    succeeded: 'border-emerald-500/20 bg-emerald-500/8 text-emerald-400',
    failed: 'border-rose-500/20 bg-rose-500/8 text-rose-400',
    cancelled: 'border-ink-700/30 bg-ink-800/15 text-ink-500',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-mono !text-ui-2xs uppercase tracking-widest2',
        compact ? 'px-1.5 py-0' : 'gap-1.5 px-2 py-0.5',
        palette[status] ?? 'border-ink-700/30 bg-ink-800/15 text-ink-400',
      )}
    >
      {status === 'running' && (
        <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" />
      )}
      {status}
    </span>
  );
}
