# Changes Page — Implementation Plan

## Current State

### Backend (`src/main/services/git.ts`)
- `workspaceStatus()` → returns `GitStatus` with: `staged`, `not_added`, `created`, `modified`, `renamed` (array of `{from, to}`), `deleted`, `conflicted`, `clean`
- `workspaceDiff()` → returns a **single unified diff string** for the entire workspace (not per-file)
- No per-file diff endpoint exists
- No way to get a file's original content at HEAD (needed for DiffEditor)

### Frontend (`src/renderer/src/pages/Changes.tsx`)
- Skeleton `DiffPanel` with two placeholder comments for Staged/Untracked sections
- `DiffPanelEditor` uses `DiffEditor` but passes `modified: ''` — backwards (original should be HEAD content, modified should be working copy)
- Sidebar is empty — no file list rendered
- No status icons, no rename handling, no file click wiring

### Available Dependencies
- `@monaco-editor/react` — already used, has `DiffEditor` component
- `simple-git` — already used for git operations
- `diff` npm package — already a dependency (used in `util/patch.ts`)

---

## Implementation Tasks

### 1. Backend: Add `files` to status + per-file diff endpoints

**File:** `src/main/services/git.ts`

#### 1a. Expose `files` in `GitStatus`

The current `GitStatus` interface is missing `files`. Add it so the frontend can use `FileStatusResult` for precise staged/working kind detection:

```ts
export interface GitFileStatus {
  path: string;
  index: string;       // staged status: ' ', 'M', 'A', 'D', 'R', 'C', '?'
  working_dir: string; // working tree status: same codes
  from?: string;       // original path for renamed files
}

// Add to GitStatus interface:
files: GitFileStatus[];
```

In `workspaceStatus()`, map `s.files` into the response:
```ts
files: s.files.map(f => ({ path: f.path, index: f.index, working_dir: f.working_dir, from: f.from })),
```

#### 1b. Add new functions

```ts
// Returns the content of a file at HEAD (the "original" for diff)
export async function showFileAtHead(workspaceId: string, filePath: string): Promise<string | null>

// Returns unified diff for a single file
export async function fileDiff(workspaceId: string, filePath: string, staged?: boolean): Promise<string>
```

**`showFileAtHead`** implementation:
- Uses `git.show('HEAD:<filePath>')` via simple-git
- Returns `null` for new/untracked files (no HEAD version exists)
- Catches errors gracefully (file may not exist in HEAD)

**`fileDiff`** implementation:
- For tracked modified files: `git diff -- <filePath>` (or `git diff --cached -- <filePath>` for staged)
- For untracked/new files: `git diff --no-index -- /dev/null <filePath>`
- Returns the unified diff string for just that file

**File:** `src/main/ipc/git.ts`

Add two new tRPC procedures:

```ts
showFileAtHead: publicProcedure
  .input(workspaceIn.extend({ path: z.string().min(1) }))
  .query(({ input }) => showFileAtHead(input.workspaceId, input.path)),

fileDiff: publicProcedure
  .input(workspaceIn.extend({ path: z.string().min(1), staged: z.boolean().optional() }))
  .query(({ input }) => fileDiff(input.workspaceId, input.path, !!input.staged)),
```

---

### 2. Frontend: Build sidebar file navigation

**File:** `src/renderer/src/pages/Changes.tsx`

#### 2a. Derive file lists from `git.status`

Parse `GitStatus` into a structured list with change types:

```ts
type ChangeKind = 'modified' | 'created' | 'deleted' | 'renamed' | 'conflicted' | 'untracked';

interface ChangedFile {
  path: string;          // display path (new name for renames)
  originalPath?: string; // only for renamed files (the "from" path)
  kind: ChangeKind;
  section: 'staged' | 'working'; // which sidebar section
}
```

Build two lists from `StatusResult.files`:
- **Staged:** files where `file.index !== ' ' && file.index !== '?'` — the `index` char is the kind (`M`, `A`, `D`, `R`, `C`)
- **Working (Unstaged/Untracked):** files where `file.working_dir !== ' '` — includes `?` for untracked, `M` for modified, `D` for deleted, etc.
- A single file can appear in **both** lists (e.g. staged + further working-dir modifications)

> **Staged kind detection:** No need to cross-reference arrays. `StatusResult.files` is an array of `FileStatusResult` objects with `{ path, index, working_dir, from? }`. The `index` field gives the staged status code (`M`=modified, `A`=added, `D`=deleted, `R`=renamed, `C`=conflicted) and `working_dir` gives the working tree status. Use `status.files` to derive both staged and working change lists with precise kinds.

#### 2b. Status icons

| Kind | Icon | Color | Label |
|------|------|-------|-------|
| modified | `M` | `text-amber` | Modified |
| created | `A` | `text-signal-ok` (green) | Added |
| deleted | `D` | `text-signal-err` (red) | Deleted |
| renamed | `R` | `text-purple-400` | Renamed |
| conflicted | `C` | `text-signal-warn` (yellow) | Conflicted |
| untracked | `?` | `text-ink-400` (gray) | Untracked |

Use single-letter badges in a monospace font, consistent with git conventions.

#### 2c. Renamed file display

For renamed files:
- Show the **new** filename as the list item label
- The status icon `R` gets a **tooltip** showing `renamed: oldName → newName`
- Use the `title` attribute on the icon span for the native tooltip (simple, no library needed)

#### 2d. File navigation component

Create a `ChangedFileList` component:

```tsx
function ChangedFileList({
  files: ChangedFile[],
  activePath: string | null,
  onSelect: (path: string) => void,
})
```

Each item is a clickable row with:
- Status icon badge (left)
- Filename (truncated, showing just the basename + parent dir for context)
- Active state highlight when selected

Wire into the sidebar:

```tsx
<aside>
  <SectionHeader>Staged ({stagedFiles.length})</SectionHeader>
  <ChangedFileList files={stagedFiles} activePath={activePath} onSelect={setActivePath} />

  <SectionHeader>Working Changes ({workingFiles.length})</SectionHeader>
  <ChangedFileList files={workingFiles} activePath={activePath} onSelect={setActivePath} />
</aside>
```

**Always show the sidebar** (even when `clean` — show an empty state message instead of hiding it).

---

### 3. Frontend: Diff viewer

**File:** `src/renderer/src/pages/Changes.tsx`

#### Approach: Monaco DiffEditor (inline mode)

Monaco's `DiffEditor` supports an **inline diff** mode that shows only the changes with full syntax highlighting. This is the best option because:
- Syntax highlighting for the file's language (not just raw diff syntax)
- Inline mode (`renderSideBySide: false`) shows a compact view of just the changes
- Can toggle between side-by-side and inline
- Already imported and available

#### Fix `DiffPanelEditor`:

```tsx
function DiffPanelEditor({ workspaceId, path, kind, originalFilePath }: { 
  workspaceId: string; 
  path: string;
  kind: ChangeKind;
  originalFilePath?: string; // for renamed files — the old path
}) {
  const theme = useUI((s) => s.theme);

  // For renamed files, fetch original from the old path
  const originalPath = originalFilePath ?? path;

  // Original content from HEAD (null for new files)
  const original = trpc.git.showFileAtHead.useQuery(
    { workspaceId, path: originalPath },
    { enabled: kind !== 'created' && kind !== 'untracked' }
  );

  // Current working copy (read from new path, even for renames)
  const current = trpc.file.read.useQuery(
    { workspaceId, path },
    { enabled: kind !== 'deleted' }
  );

  // For new/untracked files, original is empty
  const originalText = kind === 'created' || kind === 'untracked' 
    ? '' 
    : (original.data ?? '');

  // For deleted files, modified is empty
  const modifiedText = kind === 'deleted' 
    ? '' 
    : (current.data?.content ?? '');

  return (
    <DiffEditor
      original={originalText}
      modified={modifiedText}
      language={langFor(path)}
      theme={theme === 'dark' ? 'vs-dark' : 'vs'}
      options={{
        readOnly: true,
        renderSideBySide: false,  // inline diff — shows only changes
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 13,
      }}
    />
  );
}
```

#### Inline-only mode explanation

Setting `renderSideBySide: false` on DiffEditor gives an **inline diff** view:
- Shows the file with full syntax highlighting
- Deleted lines shown in red background, added lines in green background
- Unchanged context lines shown normally
- This is the "only show changes with syntax highlighting" behavior requested

A toggle button in the toolbar can switch between inline (`renderSideBySide: false`) and side-by-side (`renderSideBySide: true`).

---

### 4. Wiring & Polish

#### 4a. Connect file click to diff viewer

When a file is clicked in the sidebar:
1. `setActivePath(file.path)` + store the `ChangeKind`
2. `DiffPanelEditor` loads original (HEAD) and modified (working) content
3. Renders the inline diff

#### 4b. Auto-refresh

Add `refetchInterval: 5000` (or similar) to the `git.status` query so the sidebar updates as files change. Don't auto-refresh the diff content — only refetch on explicit file selection.

#### 4c. Empty states

- **No repo:** "Not a git repository"
- **Clean tree:** "Working tree clean — no changes"
- **No file selected:** "Select a file to view changes"

#### 4d. Header bar

Keep the existing workspace name header. Add a summary line:
```
branch: main  |  3M · 1A · 2?
```

---

## File Change Summary

| File | Action |
|------|--------|
| `src/main/services/git.ts` | Add `showFileAtHead()` and `fileDiff()` functions |
| `src/main/ipc/git.ts` | Add `showFileAtHead` and `fileDiff` tRPC procedures |
| `src/renderer/src/pages/Changes.tsx` | Rewrite: sidebar with file lists, fix DiffEditor, add icons/tooltips |

No new files or dependencies needed. Everything builds on existing infrastructure.

---

## Resolved Questions

1. **Staged file kind detection:** ✅ `StatusResult.files[]` has `FileStatusResult` objects with `{ path, index, working_dir, from? }`. The `index` field directly gives the staged status code (`M`, `A`, `D`, `R`). No cross-referencing needed — use `status.files` instead of the flat arrays.

2. **Large file handling:** Skipped — not needed for v1.

3. **Renamed files in DiffEditor:** ✅ `status.renamed` already returns `{ from, to }`. The `FileStatusResult.from` field also carries the original path. `DiffPanelEditor` accepts an `originalFilePath` prop — for renames, pass `from` so `showFileAtHead` fetches from the old path while the working copy is read from the new path.
