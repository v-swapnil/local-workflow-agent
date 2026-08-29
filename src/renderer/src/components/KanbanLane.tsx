import type { KanbanCard as KanbanCardData, KanbanLane as KanbanLaneType } from '@shared/types';
import { KanbanCardView } from './KanbanCard';
import { cn } from '../lib/utils';

const LANE_META: Record<
  KanbanLaneType,
  { label: string; color: string; headerBg: string; dotColor: string }
> = {
  todo: {
    label: 'Todo',
    color: 'text-ink-400',
    headerBg: 'bg-ink-800/40',
    dotColor: 'bg-ink-500',
  },
  in_progress: {
    label: 'In Progress',
    color: 'text-amber',
    headerBg: 'bg-amber/5',
    dotColor: 'bg-amber',
  },
  done: {
    label: 'Done',
    color: 'text-signal-ok',
    headerBg: 'bg-signal-ok/5',
    dotColor: 'bg-signal-ok',
  },
  need_help: {
    label: 'Need Help',
    color: 'text-signal-err',
    headerBg: 'bg-signal-err/5',
    dotColor: 'bg-signal-err',
  },
};

interface KanbanLaneProps {
  lane: KanbanLaneType;
  cards: KanbanCardData[];
  onCardClick?: (sessionId: string) => void;
}

export function KanbanLane({ lane, cards, onCardClick }: KanbanLaneProps) {
  const meta = LANE_META[lane];

  return (
    <div
      className={cn(
        'flex min-w-[260px] flex-1 flex-col rounded-lg border bg-ink-900/20',
        lane === 'need_help' && cards.length > 0 ? 'border-signal-err/20' : 'border-ink-800/60',
      )}
    >
      {/* Lane header */}
      <div
        className={cn(
          'flex items-center gap-2 rounded-t-lg border-b border-ink-800 px-3 py-2.5',
          meta.headerBg,
        )}
      >
        <span className="relative flex h-2 w-2">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              meta.dotColor,
              lane === 'need_help' && cards.length > 0 && 'animate-pulse',
            )}
          />
        </span>
        <span className={cn('font-mono text-ui-xs uppercase tracking-widest2', meta.color)}>
          {meta.label}
        </span>
        <span className="rounded-full bg-ink-800 px-1.5 font-mono text-ui-xs text-ink-300">
          {cards.length}
        </span>
      </div>

      {/* Cards area */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-2">
          {cards.map((card) => (
            <KanbanCardView
              key={card.sessionId}
              card={card}
              onClick={() => onCardClick?.(card.sessionId)}
            />
          ))}
        </div>

        {cards.length === 0 && (
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-ink-800 font-mono text-ui-xs text-ink-500">
            No sessions
          </div>
        )}
      </div>
    </div>
  );
}
