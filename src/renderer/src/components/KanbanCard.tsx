import type { KanbanCard as KanbanCardData, KanbanLane } from '@shared/types';
import { cn, relativeTime } from '../lib/utils';

const LANE_STYLES: Record<KanbanLane, { border: string; icon: string }> = {
  todo: { border: 'border-l-ink-600', icon: '○' },
  in_progress: { border: 'border-l-amber', icon: '◉' },
  done: { border: 'border-l-signal-ok', icon: '✓' },
  need_help: { border: 'border-l-signal-err', icon: '!' },
};

interface KanbanCardProps {
  card: KanbanCardData;
  onClick?: () => void;
}

export function KanbanCardView({ card, onClick }: KanbanCardProps) {
  const style = LANE_STYLES[card.lane];
  const { total, succeeded, running, failed, awaitingApproval } = card.taskSummary;
  const pct = total > 0 ? Math.round((succeeded / total) * 100) : 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative cursor-pointer rounded-lg border border-l-[3px] bg-ink-900/60 p-3.5 transition-all',
        style.border,
        'border-ink-800/60 hover:border-ink-700 hover:shadow-sm hover:shadow-ink-950/20',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate font-mono text-ui-sm font-medium leading-snug text-ink-50">
          {card.title}
        </h3>
      </div>

      {/* Task summary chips */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-ui-xs">
        {total === 0 ? (
          <span className="text-ink-500">no tasks</span>
        ) : (
          <>
            <span className="text-ink-400">
              {total} task{total !== 1 ? 's' : ''}
            </span>
            {succeeded > 0 && <span className="text-signal-ok">{succeeded} ✓</span>}
            {running > 0 && (
              <span className="inline-flex items-center gap-0.5 text-amber">
                <span className="animate-pulse">●</span> {running}
              </span>
            )}
            {failed > 0 && <span className="text-signal-err">{failed} ✗</span>}
            {awaitingApproval > 0 && (
              <span className="text-signal-warn">{awaitingApproval} ⏳</span>
            )}
          </>
        )}
      </div>

      {/* Timestamp */}
      <div className="mt-2 font-mono text-ui-2xs tracking-wide text-ink-500">
        {relativeTime(card.lastActivity)}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-ink-800">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              card.lane === 'done'
                ? 'bg-signal-ok'
                : card.lane === 'need_help'
                  ? 'bg-signal-err'
                  : 'bg-amber',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
