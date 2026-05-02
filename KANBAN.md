# Kanban Board — Implementation Plan

> Adds a Kanban-style view to manage sessions across four swim-lanes.
> Builds on top of the existing sessions infrastructure defined in [IMPLEMENTATION.md](IMPLEMENTATION.md).

---

## 1. Feature Summary

Replace (or augment) the current list-based Sessions page with a **Kanban board** where each session is a draggable card placed in one of four lanes:

| Lane            | Meaning                                                                           | Colour accent     |
| --------------- | --------------------------------------------------------------------------------- | ----------------- |
| **Todo**        | Session created but no task has started running yet                               | `slate` / neutral |
| **In Progress** | At least one task is actively `running` or `queued`                               | `amber`           |
| **Done**        | All tasks in the session have `succeeded`                                         | `emerald`         |
| **Need Help**   | A task is `awaiting_approval`, `failed`, or `cancelled` — user attention required | `rose`            |

Users can also **manually drag** a card between lanes (e.g. move a "Done" session back to "Todo" to re-run it), which persists a `kanban_lane` override on the session row.

---

## 2. Data Model Changes

### 2.1 New column on `sessions`

```sql
ALTER TABLE sessions ADD COLUMN kanban_lane TEXT DEFAULT NULL;
```

In Drizzle schema (`src/main/db/schema.ts`):

```ts
export const sessions = sqliteTable(
  'sessions',
  {
    // ... existing columns ...
    kanbanLane: text('kanban_lane'), // 'todo' | 'in_progress' | 'done' | 'need_help' | null
  },
  (t) => ({ wsIdx: index('idx_sessions_ws').on(t.workspaceId) }),
);
```

**`null`** means "auto-compute from task statuses" (the default). A non-null value means the user explicitly placed the card in that lane (manual override). The override is cleared whenever a task status change would naturally move the card (configurable).

### 2.2 Derived lane logic

When `kanbanLane` is `null`, the lane is computed from the session's tasks:

```ts
export type KanbanLane = 'todo' | 'in_progress' | 'done' | 'need_help';

export function deriveKanbanLane(taskStatuses: TaskStatus[]): KanbanLane {
  if (taskStatuses.length === 0) return 'todo';

  const hasAwaiting = taskStatuses.includes('awaiting_approval');
  const hasFailed = taskStatuses.includes('failed');
  const hasCancelled = taskStatuses.includes('cancelled');
  const hasRunning = taskStatuses.includes('running');
  const hasQueued = taskStatuses.includes('queued');
  const allSucceeded = taskStatuses.every((s) => s === 'succeeded');

  // Need Help takes priority — user must intervene
  if (hasAwaiting || hasFailed || hasCancelled) return 'need_help';
  // Active work
  if (hasRunning || hasQueued) return 'in_progress';
  // Everything green
  if (allSucceeded) return 'done';
  // Fallback (e.g. session with only old tasks)
  return 'todo';
}
```

### 2.3 New shared type

Add to `src/shared/types.ts`:

```ts
export type KanbanLane = 'todo' | 'in_progress' | 'done' | 'need_help';

export interface KanbanCard {
  sessionId: string;
  title: string;
  workspaceId: string;
  lane: KanbanLane;
  manualLane: KanbanLane | null; // user override, null = auto
  taskSummary: {
    total: number;
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    awaitingApproval: number;
    cancelled: number;
  };
  lastActivity: number; // epoch ms
  createdAt: number;
}
```

---

## 3. Backend Changes

### 3.1 New tRPC procedures (add to `sessionRouter`)

| Procedure  | Type       | Input                                                        | Returns                                                         |
| ---------- | ---------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| `kanban`   | `query`    | `{ workspaceId?: string }`                                   | `KanbanCard[]` — all sessions with computed lanes               |
| `setLane`  | `mutation` | `{ sessionId: string, lane: KanbanLane \| null }`            | `{ ok: true }` — sets `kanban_lane` override                    |
| `moveLane` | `mutation` | `{ sessionId: string, lane: KanbanLane, position?: number }` | `{ ok: true }` — same as `setLane` but also persists sort order |

#### `kanban` query implementation sketch

```ts
kanban: publicProcedure
  .input(z.object({ workspaceId: z.string().optional() }).optional())
  .query(async ({ input }) => {
    const allSessions = listSessions(input?.workspaceId);
    return allSessions.map((s) => {
      const tasks = listTasks(s.id);
      const statuses = tasks.map((t) => t.status as TaskStatus);
      const autoLane = deriveKanbanLane(statuses);
      return {
        sessionId: s.id,
        title: s.title,
        workspaceId: s.workspaceId,
        lane: s.kanbanLane ?? autoLane,
        manualLane: s.kanbanLane ?? null,
        taskSummary: {
          total: tasks.length,
          queued:            statuses.filter((s) => s === 'queued').length,
          running:           statuses.filter((s) => s === 'running').length,
          succeeded:         statuses.filter((s) => s === 'succeeded').length,
          failed:            statuses.filter((s) => s === 'failed').length,
          awaitingApproval:  statuses.filter((s) => s === 'awaiting_approval').length,
          cancelled:         statuses.filter((s) => s === 'cancelled').length,
        },
        lastActivity: Math.max(s.updatedAt, ...tasks.map((t) => t.finishedAt ?? t.startedAt ?? t.createdAt)),
        createdAt: s.createdAt,
      } satisfies KanbanCard;
    });
  }),
```

### 3.2 Store helpers (`src/main/services/store.ts`)

```ts
export function setSessionKanbanLane(sessionId: string, lane: KanbanLane | null): void {
  db.update(sessions)
    .set({ kanbanLane: lane, updatedAt: Date.now() })
    .where(eq(sessions.id, sessionId))
    .run();
}
```

### 3.3 Auto-clear override on task status change (optional, configurable)

In the task runner (`src/main/orchestrator/runner.ts`), after updating a task status, clear the manual override so the card auto-moves:

```ts
// After task status changes:
setSessionKanbanLane(task.sessionId, null); // reset to auto-derived
```

This can be gated behind a setting `kanban.autoClearOverride` (default `true`).

---

## 4. Frontend Changes

### 4.1 New files

| File                                         | Purpose                  |
| -------------------------------------------- | ------------------------ |
| `src/renderer/src/pages/KanbanBoard.tsx`     | Top-level page component |
| `src/renderer/src/components/KanbanLane.tsx` | Single lane column       |
| `src/renderer/src/components/KanbanCard.tsx` | Draggable session card   |

### 4.2 Dependencies

```
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

`@dnd-kit` is a lightweight, accessible drag-and-drop library for React. No heavy deps.

### 4.3 Page: `KanbanBoard.tsx`

```
┌─────────────────────────────────────────────────────────────────┐
│  [workspace selector]           Kanban Board        [+ session] │
├──────────────┬───────────────┬───────────────┬──────────────────┤
│   TODO (3)   │ IN PROGRESS(1)│   DONE (5)    │  NEED HELP (2)  │
│              │               │               │                  │
│  ┌────────┐  │  ┌────────┐   │  ┌────────┐   │  ┌────────┐     │
│  │ card   │  │  │ card   │   │  │ card   │   │  │ card   │     │
│  └────────┘  │  └────────┘   │  └────────┘   │  │ ⚠ approval│  │
│  ┌────────┐  │               │  ┌────────┐   │  └────────┘     │
│  │ card   │  │               │  │ card   │   │  ┌────────┐     │
│  └────────┘  │               │  └────────┘   │  │ card   │     │
│              │               │               │  │ ✗ failed│     │
│              │               │               │  └────────┘     │
└──────────────┴───────────────┴───────────────┴──────────────────┘
```

**Layout**: Horizontal 4-column grid, each column scrollable vertically. Full height of the content area.

**Key behaviours**:

- Cards are draggable between lanes via `@dnd-kit`.
- Dropping a card in a new lane calls `session.setLane` mutation.
- Each lane header shows the lane name + count badge.
- The "Need Help" lane has a distinct visual treatment (pulsing dot / border glow) when it has items.
- Cards auto-poll via `refetchInterval: 3000` on the `session.kanban` query to reflect real-time task status changes.

### 4.4 Component: `KanbanCard.tsx`

Each card shows:

```
┌─────────────────────────────────┐
│  Session title              [⋮] │   ← context menu: open, rename, delete, reset lane
│  3 tasks · 2 ✓ · 1 running     │   ← task summary chips
│  last active: 2 min ago        │   ← relative timestamp
│  ▓▓▓▓▓▓▓░░░ 66%               │   ← mini progress bar (succeeded / total)
└─────────────────────────────────┘
```

**Card states by lane**:

- **Todo**: neutral border, muted styling.
- **In Progress**: amber left-border accent, optional animated pulse on the running-count chip.
- **Done**: emerald left-border accent, checkmark icon.
- **Need Help**: rose left-border accent, warning icon. If `awaitingApproval > 0`, show an "Approve" quick-action button that opens the approval dialog.

**Click**: navigates to the Session detail view (existing `Sessions` page with `sessionId` pre-selected).

### 4.5 Component: `KanbanLane.tsx`

- Renders lane header (icon + title + count badge).
- Contains a `<SortableContext>` from `@dnd-kit/sortable` for card ordering within a lane.
- Accepts drops from other lanes.
- Empty-state placeholder: "No sessions" with a subtle dashed border.

### 4.6 Routing / Navigation

Add a new route in `App.tsx`:

```ts
{ path: '/kanban', element: <KanbanBoard /> }
```

Add "Board" entry to `Sidebar.tsx` navigation, placed above or next to "Sessions":

```
  Sessions    ← existing list view
  Board       ← new Kanban view
```

Both views operate on the same data — the list view and kanban view are complementary.

### 4.7 UI Store additions (`src/renderer/src/store/ui.ts`)

```ts
kanbanView: 'board' | 'list';
setKanbanView: (v: 'board' | 'list') => void;
```

Optional: a toggle in the Sessions page header to switch between list and board view without changing routes.

---

## 5. Drag-and-Drop Implementation Detail

### 5.1 DnD context setup (in `KanbanBoard.tsx`)

```tsx
import { DndContext, DragOverlay, closestCorners } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

function KanbanBoard() {
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
  const setLane = trpc.session.setLane.useMutation({ onSuccess: () => utils.session.kanban.invalidate() });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const targetLane = over.data.current?.lane as KanbanLane;
    if (targetLane && active.id !== over.id) {
      setLane.mutate({ sessionId: active.id as string, lane: targetLane });
    }
    setActiveCard(null);
  }

  return (
    <DndContext collisionDetection={closestCorners} onDragStart={...} onDragEnd={handleDragEnd}>
      {LANES.map(lane => <KanbanLane key={lane} lane={lane} cards={cardsByLane[lane]} />)}
      <DragOverlay>{activeCard && <KanbanCard card={activeCard} isDragging />}</DragOverlay>
    </DndContext>
  );
}
```

### 5.2 Sortable card

```tsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableCard({ card }: { card: KanbanCard }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.sessionId,
    data: { lane: card.lane },
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCard card={card} isDragging={isDragging} />
    </div>
  );
}
```

---

## 6. Styling Guidelines

Follow the existing app aesthetic (dark theme, `font-mono` for labels, `font-serif` for titles, amber/ink colour palette).

| Element          | Style                                                                       |
| ---------------- | --------------------------------------------------------------------------- |
| Board background | `bg-ink-950` (same as page bg)                                              |
| Lane column      | `bg-ink-900/40 border border-ink-800 rounded-lg`, `min-w-[260px]`           |
| Lane header      | `font-mono text-[10px] uppercase tracking-widest2`, lane-colour text        |
| Card             | `bg-ink-900 border border-ink-800 rounded-md p-3`, hover → `border-ink-700` |
| Card dragging    | `opacity-60 ring-2 ring-amber-500/40 rotate-2`                              |
| Drop indicator   | Thin amber line between cards                                               |
| Need Help lane   | `border-rose-800/40` header, pulsing dot when non-empty                     |
| Progress bar     | `h-1 rounded-full`, filled portion uses lane colour                         |
| Count badge      | `bg-ink-800 text-ink-300 text-[10px] rounded-full px-1.5`                   |

---

## 7. Settings

Add to the Settings page under a "Kanban" section:

| Key                        | Type                | Default   | Description                                          |
| -------------------------- | ------------------- | --------- | ---------------------------------------------------- |
| `kanban.autoClearOverride` | `boolean`           | `true`    | Reset manual lane placement when task status changes |
| `kanban.defaultView`       | `'board' \| 'list'` | `'board'` | Default Sessions page view                           |

Stored in the existing `settings` table as `kanban.autoClearOverride` → `"true"`.

---

## 8. Migration

A single Drizzle migration to add the `kanban_lane` column:

```ts
// src/main/db/migrations/XXXX_add_kanban_lane.ts
import { sql } from 'drizzle-orm';

export async function up(db) {
  db.run(sql`ALTER TABLE sessions ADD COLUMN kanban_lane TEXT DEFAULT NULL`);
}
```

Non-destructive — existing sessions get `null` (auto-derived), so the board works immediately with no data backfill.

---

## 9. tRPC Subscription for Live Updates

Extend the existing `task.events` subscription to also emit a `kanban.refresh` hint whenever a task status changes. The renderer's Kanban query can listen for this to invalidate immediately instead of relying solely on polling:

```ts
// In sessionRouter:
onKanbanChange: publicProcedure
  .input(z.object({ workspaceId: z.string().optional() }).optional())
  .subscription(({ input }) =>
    observable<{ sessionId: string; lane: KanbanLane }>((emit) => {
      const handler = (evt: TaskEvent) => {
        if (evt.type === 'task.started' || evt.type === 'task.finished') {
          const session = getSession(getTask(evt.taskId).sessionId);
          const tasks = listTasks(session.id);
          const lane = session.kanbanLane ?? deriveKanbanLane(tasks.map(t => t.status));
          emit.next({ sessionId: session.id, lane });
        }
      };
      taskBus.on('*', handler);
      return () => taskBus.off('*', handler);
    }),
  ),
```

The renderer subscribes on mount and calls `utils.session.kanban.invalidate()` on each event.

---

## 10. Implementation Steps

| #   | Step                                                               | Files touched                                |
| --- | ------------------------------------------------------------------ | -------------------------------------------- |
| 1   | Add `KanbanLane` type + `deriveKanbanLane` helper                  | `src/shared/types.ts`                        |
| 2   | Add `kanban_lane` column to schema + generate migration            | `src/main/db/schema.ts`, migrations          |
| 3   | Add `setSessionKanbanLane` store helper                            | `src/main/services/store.ts`                 |
| 4   | Add `kanban`, `setLane` procedures to session router               | `src/main/ipc/session.ts`                    |
| 5   | Add `onKanbanChange` subscription                                  | `src/main/ipc/session.ts`                    |
| 6   | Install `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | `package.json`                               |
| 7   | Create `KanbanCard.tsx` component                                  | `src/renderer/src/components/KanbanCard.tsx` |
| 8   | Create `KanbanLane.tsx` component                                  | `src/renderer/src/components/KanbanLane.tsx` |
| 9   | Create `KanbanBoard.tsx` page                                      | `src/renderer/src/pages/KanbanBoard.tsx`     |
| 10  | Add `/kanban` route + Sidebar entry                                | `src/renderer/src/App.tsx`, `Sidebar.tsx`    |
| 11  | Add kanban settings to Settings page                               | `src/renderer/src/pages/Settings.tsx`        |
| 12  | Auto-clear override in task runner                                 | `src/main/orchestrator/runner.ts`            |
| 13  | Tests: `deriveKanbanLane` unit tests, drag-and-drop E2E            | `tests/`                                     |

---

## 11. Acceptance Criteria

1. **Board renders** — Opening `/kanban` shows four labelled columns. Sessions appear as cards in the correct auto-derived lane.
2. **Auto-lane assignment** — Creating a new session places it in "Todo". Starting a task moves it to "In Progress". Task success moves it to "Done". A failure or approval request moves it to "Need Help".
3. **Manual drag** — Dragging a card from "Done" to "Todo" persists the override. Refreshing the page keeps it in "Todo".
4. **Auto-clear** — When `kanban.autoClearOverride` is on, a task status change resets the card to its auto-derived lane.
5. **Need Help actions** — Cards in "Need Help" with pending approvals show an "Approve" button that opens the approval dialog.
6. **Click-through** — Clicking a card navigates to the Session detail view.
7. **Live updates** — Card positions update within 3 seconds of task status changes (via subscription or polling).
8. **Empty state** — A workspace with no sessions shows a centered prompt to create one.
9. **No data loss** — The migration is additive; existing sessions appear on the board immediately with auto-derived lanes.

---

_This feature integrates into the existing Phase 6 (Sessions & Task UI) and can be built after or in parallel with it._
