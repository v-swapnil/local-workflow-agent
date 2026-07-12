# Notes / Notebooks — Implementation Plan

> Companion to `PRD_NOTES.md`. Follows existing app conventions:
> tRPC router → service → Drizzle/SQLite, pages in `src/renderer/src/pages`,
> shadcn/ui + Tailwind theming.

## Overview

Add a global **Notes** feature: markdown documents organized into **collections** with
**tags**, edited in a Lexical editor that toggles between WYSIWYG and raw markdown.
No workspace scoping. New `collections` + `notes` tables, a `notes` service, a `notes`
tRPC router, and a `/notes` renderer page with a Lexical editor.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| DB | Two tables `collections`, `notes` in the main app DB | Global, matches existing bootstrap-SQL pattern |
| IDs | `nanoid(10)` | Matches every other service |
| Tags storage | JSON array in a `text` column on `notes` | No tag-filtering in v1; normalize later if needed |
| Source of truth | `notes.content` markdown string | Both editor modes serialize to/from it |
| Editor deps | Add `@lexical/markdown`, `@lexical/list`, `@lexical/rich-text`, `@lexical/code`, `@lexical/link`, `@lexical/utils` | `lexical` + `@lexical/react` already installed |
| Autosave | Debounced mutation (~600ms) from the renderer | Simple; no server-side debounce |
| Default collections | Seeded in bootstrap: `User`, `System` (`kind='default'`) | Non-deletable buckets |
| Cascade delete | Deleting a collection deletes its notes (service-level) | Predictable; enforced in service |

## Dependencies to add

```bash
pnpm add @lexical/markdown @lexical/list @lexical/rich-text @lexical/code @lexical/link @lexical/utils
```

(`lexical@^0.47.0` and `@lexical/react@^0.47.0` already present; keep versions aligned.)

---

## SQLite Schema

Add to `BOOTSTRAP_SQL` in [src/main/db/index.ts](src/main/db/index.ts) (idempotent):

```sql
CREATE TABLE IF NOT EXISTS note_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'user',   -- 'default' | 'user'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',      -- JSON array of strings
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_collection ON notes(collection_id);
```

Seed defaults after `exec(BOOTSTRAP_SQL)` (idempotent — only insert if missing):

```sql
INSERT INTO note_collections (id, name, kind, created_at, updated_at)
SELECT 'col_user', 'User', 'default', :now, :now
WHERE NOT EXISTS (SELECT 1 FROM note_collections WHERE id = 'col_user');
INSERT INTO note_collections (id, name, kind, created_at, updated_at)
SELECT 'col_system', 'System', 'default', :now, :now
WHERE NOT EXISTS (SELECT 1 FROM note_collections WHERE id = 'col_system');
```

> Note table name is `note_collections` (avoids clashing with any generic `collections`).

### Drizzle schema

Add to [src/main/db/schema.ts](src/main/db/schema.ts):

```ts
export const noteCollections = sqliteTable('note_collections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('user'), // 'default' | 'user'
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    collectionId: text('collection_id').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    tags: text('tags').notNull().default('[]'), // JSON string[]
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({ cIdx: index('idx_notes_collection').on(t.collectionId) }),
);
```

---

## Shared types

Add to `src/shared/types.ts` (or a new `src/shared/notes.ts`):

```ts
export type NoteCollectionKind = 'default' | 'user';

export interface NoteCollection {
  id: string;
  name: string;
  kind: NoteCollectionKind;
  createdAt: number;
  updatedAt: number;
}

export interface Note {
  id: string;
  collectionId: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}
```

---

## Service layer — `src/main/services/notes.ts`

Encapsulates all DB access. Serializes/deserializes `tags` JSON at the boundary.

```ts
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { noteCollections, notes } from '../db/schema.js';
import type { Note, NoteCollection } from '@shared/types';

// --- collections ---
export function listCollections(): NoteCollection[]
export function createCollection(name: string): NoteCollection   // kind='user'
export function deleteCollection(id: string): void
  // throw if kind==='default'; delete child notes first, then the collection

// --- notes ---
export function listNotes(): Note[]                              // all, for grouped tree
export function getNote(id: string): Note | undefined
export function createNote(collectionId: string): Note          // 'Untitled', empty body
export function updateNote(id: string, patch: {
  title?: string; content?: string; tags?: string[];
}): Note
export function deleteNote(id: string): void
```

Rules enforced in the service:
- `deleteCollection` throws if the collection `kind === 'default'`.
- `deleteCollection` removes all notes with that `collection_id`, then the collection.
- `createNote` requires an existing `collectionId`; default title `"Untitled"`, `tags = []`.
- Every mutating op bumps `updatedAt = Date.now()`.
- `tags` stored as `JSON.stringify(string[])`; parsed back on read.

---

## tRPC router — `src/main/ipc/notes.ts`

```ts
import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import * as svc from '../services/notes.js';

export const notesRouter = router({
  listCollections: publicProcedure.query(() => svc.listCollections()),
  createCollection: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(({ input }) => svc.createCollection(input.name)),
  deleteCollection: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => { svc.deleteCollection(input.id); return { ok: true as const }; }),

  list: publicProcedure.query(() => svc.listNotes()),
  get: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ input }) => svc.getNote(input.id)),
  create: publicProcedure
    .input(z.object({ collectionId: z.string().min(1) }))
    .mutation(({ input }) => svc.createNote(input.collectionId)),
  update: publicProcedure
    .input(z.object({
      id: z.string().min(1),
      title: z.string().optional(),
      content: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(({ input }) => svc.updateNote(input.id, input)),
  delete: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => { svc.deleteNote(input.id); return { ok: true as const }; }),
});
```

Register in [src/main/ipc/router.ts](src/main/ipc/router.ts):

```ts
import { notesRouter } from './notes.js';
// ...
export const appRouter = router({
  // ...existing...
  notes: notesRouter,
});
```

---

## Renderer

### Routing & nav

- [src/renderer/src/App.tsx](src/renderer/src/App.tsx): import `Notes`, add
  `<Route path="/notes" element={<Notes />} />`, and add `/notes` to `NAV_ROUTES`
  (insert before `/settings`).
- [src/renderer/src/components/Sidebar.tsx](src/renderer/src/components/Sidebar.tsx):
  add `{ to: '/notes', label: 'notes', icon: 'notes', hint: '' }` to `BASE_NAV`
  (before settings) and a `notes: <NotebookPen className={ICON_CLASS} strokeWidth={1.3} />`
  entry to `ICONS` (import from `lucide-react`).

> Keyboard-shortcut hints (`⌘1`–`⌘9`) are positional against `NAV_ROUTES`. Inserting
> `/notes` shifts later hints; update the `hint` strings in `BASE_NAV` to stay in sync
> (or give notes no hint and leave existing ones).

### File layout

```
src/renderer/src/pages/notes/
  index.tsx              # Notes page: PageShell + master-detail grid
  NotesSidebar.tsx       # grouped tree: collections (collapsible) + notes + add/delete
  NoteEditor.tsx         # right pane: title, tag chips, mode toggle, Lexical editor
  useNoteAutosave.ts     # debounced update mutation hook
  editor/
    LexicalNoteEditor.tsx  # LexicalComposer wrapper, both modes
    MarkdownMode.tsx       # PlainTextPlugin showing raw markdown
    WysiwygMode.tsx        # RichTextPlugin + markdown shortcuts + list/link/code plugins
    transformers.ts        # export the TRANSFORMERS set used for round-trip
    theme.ts               # Lexical EditorThemeClasses -> Tailwind/theme classes
```

### Page (`index.tsx`)

- `PageShell path="notes" title="Notes" subtitle="Markdown notes & prompts"`.
- Layout: `grid grid-cols-[280px_1fr] gap-6 h-[calc(100vh-220px)]` (match Skills).
- Queries: `trpc.notes.listCollections`, `trpc.notes.list`.
- Local selection state: `selectedNoteId` (Zustand not required; `useState` is fine).
- On mutations, invalidate `trpc.notes.list` / `listCollections` via `utils`.

### `NotesSidebar.tsx`

- Build a map `collectionId -> notes[]` from `notes.list` (sorted by `updatedAt` desc).
- Render each collection as a collapsible header (`Collapsible` from ui) with:
  - a **"+ note"** button → `notes.create({ collectionId })` → select returned note.
  - nested `SidebarListItem` rows per note (`isActive`, `onSelect`, hover `delete`).
- Header toolbar: **"+ New collection"** → prompt/dialog for name → `notes.createCollection`.
- Delete note → `AlertDialog` → `notes.delete`.
- Delete user collection → `AlertDialog` (warns notes deleted) → `notes.deleteCollection`.
  Hide delete for `kind === 'default'`.

### `NoteEditor.tsx`

- Loads the selected note (`trpc.notes.get` or from the list cache).
- Header row: editable title `Input`, tag chips (add via input, remove via ×),
  `ToggleGroup` mode switch ("Editor" | "Markdown"), and a "saved/saving" indicator.
- Body: `<LexicalNoteEditor mode={mode} value={content} onChange={...} />`.
- `useNoteAutosave`: debounce (~600ms) title/content/tags → `trpc.notes.update`.

### Lexical editor (`editor/`)

- **Single `LexicalComposer`** with nodes: `HeadingNode`, `QuoteNode`, `ListNode`,
  `ListItemNode`, `CodeNode`, `CodeHighlightNode`, `LinkNode` (register all so markdown
  transforms work in both modes).
- **Source of truth = markdown string** held by `NoteEditor`.
- **WYSIWYG mode**: `RichTextPlugin` + `HistoryPlugin` + `ListPlugin` + `LinkPlugin` +
  `MarkdownShortcutPlugin` (with the shared `TRANSFORMERS`). On mount / when `value`
  changes externally, load via `$convertFromMarkdownString(value, TRANSFORMERS)`.
  On edit, serialize via `$convertToMarkdownString(TRANSFORMERS)` → `onChange`.
- **Markdown mode**: `PlainTextPlugin` whose editor content **is** the raw markdown text.
  On edit, the plain text → `onChange` directly.
- **Toggle behavior**: switching modes re-initializes the target mode from the current
  markdown string (round-trip). Because both modes read/write the same markdown string,
  no divergence occurs.
- `transformers.ts`: `export const TRANSFORMERS = [...ELEMENT_TRANSFORMERS,
  ...TEXT_FORMAT_TRANSFORMERS, ...TEXT_MATCH_TRANSFORMERS]` (i.e. the default set from
  `@lexical/markdown`).
- `theme.ts`: map Lexical node classes to Tailwind classes using existing `ink-*`/`amber`
  tokens so both light and dark themes render correctly.

---

## Theming (light + dark)

- Reuse existing CSS-variable tokens (`ink-*`, `amber`, `signal-*`) — the app already
  switches via `document.documentElement.dataset.theme`.
- Style Lexical output through `theme.ts` class map (headings, lists, code, quote, links)
  and a scoped stylesheet using theme tokens. Verify in both `data-theme='dark'` (default)
  and `data-theme='light'`.

---

## Phased Task Breakdown

### Phase 1 — Data & backend
1. Add `note_collections` + `notes` to `BOOTSTRAP_SQL` and seed `User`/`System`.
2. Add Drizzle tables to `schema.ts`.
3. Add shared `Note` / `NoteCollection` types.
4. Implement `src/main/services/notes.ts` (collections + notes CRUD, tag JSON, cascade delete, default-collection guard).
5. Implement `src/main/ipc/notes.ts` router; register in `router.ts`.
6. Typecheck (`pnpm typecheck`).

### Phase 2 — Page shell & navigation
7. Add `/notes` route + `NAV_ROUTES` entry in `App.tsx`.
8. Add nav item + icon in `Sidebar.tsx`.
9. Create `pages/notes/index.tsx` with master-detail layout and queries (empty states).

### Phase 3 — Sidebar tree
10. `NotesSidebar.tsx`: grouped collapsible collections, per-collection "+ note",
    "+ New collection", delete note/collection with `AlertDialog`, default-collection guard.
11. Wire selection state + query invalidation.

### Phase 4 — Editor
12. Add Lexical deps.
13. Build `editor/` (composer, nodes, WYSIWYG + markdown modes, transformers, theme).
14. `NoteEditor.tsx`: title, tag chips, mode toggle, saved indicator.
15. `useNoteAutosave` debounced update.

### Phase 5 — Polish & verify
16. Light/dark verification for all editor elements.
17. Round-trip test: type content in WYSIWYG, switch to markdown, back — no loss.
18. Markdown shortcuts verification.
19. `pnpm lint && pnpm typecheck`; manual smoke of full CRUD.

---

## Risks & Notes

- **Markdown round-trip normalization**: Lexical's default transformers may normalize
  whitespace/formatting on WYSIWYG↔markdown switches. Acceptable for v1's supported subset;
  document as a known behavior.
- **Nav shortcut drift**: inserting `/notes` shifts `⌘n` hints — update or omit the hint.
- **Tags without filtering**: tags are stored/edited/displayed in v1 but not filterable
  yet; keep the JSON column so a normalized table + filtering can be added later.
- **Autosave races**: debounce per note id; cancel pending saves on note switch to avoid
  writing stale content to the newly selected note.
