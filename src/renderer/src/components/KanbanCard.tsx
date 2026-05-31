import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { KanbanCard as KanbanCardData, KanbanLane } from '@shared/types';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

const LANE_STYLES: Record<KanbanLane, { border: string; icon: string }> = {
  todo: { border: 'border-l-ink-600', icon: '○' },
  in_progress: { border: 'border-l-amber', icon: '◉' },
  done: { border: 'border-l-signal-ok', icon: '✓' },
  need_help: { border: 'border-l-signal-err', icon: '!' },
};

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface KanbanCardProps {
  card: KanbanCardData;
  isDragging?: boolean;
  isOverlay?: boolean;
  onClick?: () => void;
  onResetLane?: () => void;
}

export function KanbanCardView({
  card,
  isDragging,
  isOverlay,
  onClick,
  onResetLane,
}: KanbanCardProps) {
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
        isDragging && 'rotate-[2deg] opacity-60 ring-2 ring-amber/40',
        isOverlay && 'rotate-[2deg] shadow-float ring-2 ring-amber/40',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate font-mono text-ui-sm font-medium leading-snug text-ink-50">
          {card.title}
        </h3>
        {card.manualLane && onResetLane && (
          <Button
            variant="ghost"
            size="xs"
            onClick={(e) => {
              e.stopPropagation();
              onResetLane();
            }}
            className="invisible shrink-0 font-mono uppercase tracking-widest2 text-ink-500 hover:bg-transparent hover:text-amber group-hover:visible"
            title="Reset to auto lane"
          >
            reset
          </Button>
        )}
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

export function SortableCard({
  card,
  onClick,
  onResetLane,
}: {
  card: KanbanCardData;
  onClick?: () => void;
  onResetLane?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.sessionId,
    data: { lane: card.lane, card },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCardView
        card={card}
        isDragging={isDragging}
        onClick={onClick}
        onResetLane={onResetLane}
      />
    </div>
  );
}
