import { useEffect, useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { useNavigate } from 'react-router-dom';
import type { KanbanCard, KanbanLane as KanbanLaneType } from '@shared/types';
import { trpc } from '../trpc';
import { useActiveWorkspace } from '../hooks/useActiveWorkspace';
import { KanbanLane } from '../components/KanbanLane';
import { KanbanCardView } from '../components/KanbanCard';
import { relativeTime } from '@renderer/lib/utils';

const LANES: KanbanLaneType[] = ['todo', 'in_progress', 'done', 'need_help'];
const LANE_LABELS: Record<KanbanLaneType, string> = {
  todo: 'todo',
  in_progress: 'in progress',
  done: 'done',
  need_help: 'need help',
};

type KanbanView = 'board' | 'list';

export function KanbanBoard() {
  const { workspaceId } = useActiveWorkspace();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const defaultView = trpc.settings.kanbanDefaultView.useQuery();
  const [view, setView] = useState<KanbanView>('board');

  useEffect(() => {
    if (defaultView.data) setView(defaultView.data);
  }, [defaultView.data]);

  const kanbanQ = trpc.kanban.board.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId, refetchInterval: 3000 },
  );

  const setLane = trpc.kanban.setLane.useMutation({
    onSuccess: () => utils.kanban.board.invalidate(),
  });

  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);

  const cardsByLane = useMemo(() => {
    const map: Record<KanbanLaneType, KanbanCard[]> = {
      todo: [],
      in_progress: [],
      done: [],
      need_help: [],
    };
    for (const card of kanbanQ.data ?? []) {
      map[card.lane].push(card);
    }
    // Sort each lane by lastActivity descending
    for (const lane of LANES) {
      map[lane].sort((a, b) => b.lastActivity - a.lastActivity);
    }
    return map;
  }, [kanbanQ.data]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragStart(event: DragStartEvent) {
    const card = (event.active.data.current as { card: KanbanCard } | undefined)?.card ?? null;
    setActiveCard(card);
  }

  function handleDragOver(_event: DragOverEvent) {
    // Could add live preview here — keeping it simple for now
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    // Determine target lane from the droppable
    const targetLane = (over.data.current as { lane?: KanbanLaneType } | undefined)?.lane;
    if (!targetLane) return;

    const sourceCard = (active.data.current as { card: KanbanCard } | undefined)?.card;
    if (!sourceCard) return;

    // Only mutate if lane actually changed
    if (sourceCard.lane !== targetLane) {
      setLane.mutate({ sessionId: active.id as string, lane: targetLane });
    }
  }

  function handleCardClick(sessionId: string) {
    navigate(`/sessions?id=${sessionId}`);
  }

  function handleResetLane(sessionId: string) {
    setLane.mutate({ sessionId, lane: null });
  }

  const totalCards = kanbanQ.data?.length ?? 0;
  const sortedCards = useMemo(
    () => [...(kanbanQ.data ?? [])].sort((a, b) => b.lastActivity - a.lastActivity),
    [kanbanQ.data],
  );

  if (!workspaceId) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-ui-sm text-ink-500">
        select a workspace to view the board
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Board */}
      {view === 'list' ? (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="overflow-hidden rounded-lg border border-ink-800/50 bg-ink-900/20">
            <div className="grid grid-cols-[minmax(220px,1fr)_120px_110px_110px] gap-4 border-b border-ink-800/50 px-4 py-2.5 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
              <div>session</div>
              <div>lane</div>
              <div>tasks</div>
              <div>activity</div>
            </div>
            {sortedCards.map((card) => (
              <button
                key={card.sessionId}
                type="button"
                className="grid w-full grid-cols-[minmax(220px,1fr)_120px_110px_110px] gap-4 border-b border-ink-800/30 px-4 py-3 text-left last:border-b-0 hover:bg-ink-800/20"
                onClick={() => handleCardClick(card.sessionId)}
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-ui-sm font-medium text-ink-50">
                    {card.title}
                  </div>
                  <div className="mt-1 truncate font-mono text-ui-2xs text-ink-500">
                    {card.sessionId}
                  </div>
                </div>
                <div className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-300">
                  {LANE_LABELS[card.lane]}
                </div>
                <div className="font-mono text-ui-xs text-ink-300">
                  {card.taskSummary.total}
                  {card.taskSummary.running > 0 ? `, ${card.taskSummary.running} running` : ''}
                  {card.taskSummary.failed > 0 ? `, ${card.taskSummary.failed} failed` : ''}
                </div>
                <div className="font-mono text-ui-xs text-ink-500">
                  {relativeTime(card.lastActivity)}
                </div>
              </button>
            ))}
            {totalCards === 0 && !kanbanQ.isLoading && (
              <div className="px-4 py-10 text-center font-mono text-ui-sm text-ink-500">
                no sessions yet
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-x-auto p-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex h-full gap-3">
              {LANES.map((lane) => (
                <KanbanLane
                  key={lane}
                  lane={lane}
                  cards={cardsByLane[lane]}
                  onCardClick={handleCardClick}
                  onResetLane={handleResetLane}
                />
              ))}
            </div>

            <DragOverlay dropAnimation={null}>
              {activeCard && <KanbanCardView card={activeCard} isOverlay />}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* Empty state */}
      {view === 'board' && totalCards === 0 && !kanbanQ.isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="font-mono text-ui-sm text-ink-500">
            no sessions yet — create one to get started
          </div>
        </div>
      )}
    </div>
  );
}
