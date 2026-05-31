import { useState, useMemo } from 'react';
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
import { Button } from '../components/ui/button';

const LANES: KanbanLaneType[] = ['todo', 'in_progress', 'done', 'need_help'];

export function KanbanBoard() {
  const { workspaceId } = useActiveWorkspace();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const kanbanQ = trpc.session.kanban.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !!workspaceId, refetchInterval: 3000 },
  );

  const setLane = trpc.session.setLane.useMutation({
    onSuccess: () => utils.session.kanban.invalidate(),
  });

  const create = trpc.session.create.useMutation({
    onSuccess: () => utils.session.kanban.invalidate(),
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

  if (!workspaceId) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-ui-sm text-ink-500">
        select a workspace to view the board
      </div>
    );
  }

  const totalCards = kanbanQ.data?.length ?? 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-ink-800 px-6 py-4">
        <div>
          <h1 className="text-xl font-medium leading-tight tracking-tight text-ink-50">
            Kanban Board
          </h1>
          <p className="mt-1 text-ui-sm leading-relaxed text-ink-400">
            {totalCards} session{totalCards !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="font-mono uppercase tracking-widest2 hover:border-amber/60 hover:text-amber"
          disabled={!workspaceId || create.isPending}
          onClick={() =>
            create.mutate({
              workspaceId: workspaceId!,
              title: `session ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            })
          }
        >
          + new session
        </Button>
      </div>

      {/* Board */}
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

      {/* Empty state */}
      {totalCards === 0 && !kanbanQ.isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="font-mono text-ui-sm text-ink-500">
            no sessions yet — create one to get started
          </div>
        </div>
      )}
    </div>
  );
}
