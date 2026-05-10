# Git Worktree Support — Implementation Plan

## Summary

Add optional git worktree isolation per session. When enabled, each new session gets its own worktree (separate working directory + branch), so tasks within a session operate on an isolated copy of the codebase without affecting the main workspace.

---

## Design Decisions

| Decision | Choice |
|---|---|
| Worktree scope | One worktree per session; all tasks share it |
| Disk location | `<userData>/worktrees/<workspaceId>/<sessionId>/` |
| Branch naming | `ase/session/<sessionId>` |
| Base branch | Current HEAD at session creation time |
| Auto-branch interaction | Worktree replaces branching; auto-commit on task success preserved |
| Non-git workspace | Fall back silently — use workspace path directly, no worktree |
| Setting scope | Global toggle |
| Creation timing | On session creation |
| Deletion | Auto-delete on session delete + manual management UI |
| Session UI | Branch name, worktree path (clickable), status in session header |
| Management UI | Dedicated "Worktrees" sidebar page |
| Per-task override | Deferred — all tasks use session worktree |
| DB storage | Separate `worktrees` table |
| Session creation UX | No change — worktree created automatically |

---

## Phase 1: Backend — Schema, Setting & Worktree Service

### 1.1 DB Schema Migration

**File:** `src/main/db/schema.ts`

Add new table:

```ts
export const worktrees = sqliteTable('worktrees', {
  id: text('id').primaryKey(),                            // nanoid(10)
  workspaceId: text('workspace_id').notNull(),            // FK to workspaces
  sessionId: text('session_id'),                          // FK to sessions (nullable — survives session delete)
  branch: text('branch').notNull(),                       // e.g. ase/session/abc123
  path: text('path').notNull(),                           // absolute path on disk
  baseBranch: text('base_branch').notNull(),              // branch it was created from
  baseCommit: text('base_commit').notNull(),              // commit SHA at creation time
  status: text('status').notNull().default('active'),     // 'active' | 'removed'
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  wsIdx: index('idx_worktrees_ws').on(t.workspaceId),
  sessIdx: index('idx_worktrees_session').on(t.sessionId),
}));
```

### 1.2 New Setting Key

**File:** `src/main/services/settings.ts`

Add `USE_WORKTREES` to `SETTING_KEYS`:

```ts
USE_WORKTREES: 'use_worktrees',  // '1' = enabled, undefined/'0' = disabled
```

### 1.3 Worktree Service

**New file:** `src/main/services/worktrees.ts`

Functions:

| Function | Description |
|---|---|
| `worktreesRoot()` | Returns `<userData>/worktrees/` |
| `worktreeDirForSession(workspaceId, sessionId)` | Returns `<userData>/worktrees/<workspaceId>/<sessionId>/` |
| `createWorktree(workspaceId, sessionId)` | 1. Check workspace is a git repo (`getWorktreeRoot`). If not, return `null`. 2. Compute path via `worktreeDirForSession`. 3. Run `git worktree add <path> -b ase/session/<sessionId>`. 4. Record current branch + HEAD commit. 5. Insert row into `worktrees` table. 6. Return the worktree record. |
| `removeWorktree(worktreeId)` | 1. Get record from DB. 2. Run `git worktree remove <path> --force`. 3. Update status to `'removed'` in DB. |
| `removeWorktreeBySession(sessionId)` | Look up worktree by sessionId, call `removeWorktree`. |
| `getWorktreeForSession(sessionId)` | Query worktrees table by sessionId where status = 'active'. |
| `listWorktrees(workspaceId)` | Query all worktrees for a workspace, with session title joined. |
| `getWorktreeStatus(worktreeId)` | Check if path still exists on disk, return branch/status info. |

**Dependencies:** `simple-git` (already in use), `src/main/services/store.ts` for DB operations.

### 1.4 Paths Utility Update

**File:** `src/main/util/paths.ts`

Add:

```ts
export function worktreesRoot(): string {
  return join(userDataDir(), 'worktrees');
}
```

---

## Phase 2: Backend — Integrate Worktrees into Session & Runner

### 2.1 Store CRUD Updates

**File:** `src/main/services/store.ts`

- **`createSession`**: After inserting the session, if `USE_WORKTREES` is enabled, call `createWorktree(workspaceId, sessionId)`. If worktree creation fails (not a git repo), continue silently.
- **`deleteSession`**: Before deleting, call `removeWorktreeBySession(sessionId)` to clean up the worktree.

Add new CRUD methods:
- `insertWorktree(record)` — insert into worktrees table.
- `getWorktreeBySession(sessionId)` — query by sessionId + active status.
- `listWorktreesByWorkspace(workspaceId)` — for management page.
- `updateWorktreeStatus(id, status)` — mark as removed.
- `deleteWorktreeRecord(id)` — hard delete from DB.

### 2.2 Runner — Resolve Working Directory

**File:** `src/main/orchestrator/runner.ts`

Update `loadSessionWorkspace` (or add a new `resolveWorkingDirectory` function):

```
Current flow:
  session → workspace → workspace.path

New flow:
  session → workspace → workspace.path
         → worktree (if exists and active) → worktree.path
  
  If worktree exists and is active, use worktree.path as workspacePath.
  Otherwise, fall back to workspace.path.
```

The `RunCtx` already has `workspacePath` — this is the only place that needs to change. All downstream tools, graph nodes, and the Copilot runner already use `workspacePath` from RunCtx/ToolContext.

**Auto-branch interaction:** When worktree is active, skip the `git checkout -b ase/<taskId>` step (the session already has its own branch). Keep the auto-commit-on-success logic.

### 2.3 Copilot Runner Update

**File:** `src/main/orchestrator/copilot-runner.ts`

Currently passes `workingDirectory: workspace.workspacePath`. After the runner resolves the correct path (workspace or worktree), the copilot runner receives it via the same flow — no separate change needed, as long as `loadSessionWorkspace` returns the correct path.

### 2.4 Tool Registry — No Changes Needed

The tool registry resolves `workspacePath` from the workspace record. However, since `runner.ts` constructs the `ToolContext` with `workspacePath` from `RunCtx`, and we update `RunCtx` in 2.2, tools will automatically use the worktree path. **But** — `invokeTool` in `registry.ts` currently does its own `getWorkspace(opts.workspaceId)` and uses `ws.path`. This needs updating:

**File:** `src/main/services/tools/registry.ts`

`invokeTool` should accept an optional `workspacePath` override in its options, falling back to `ws.path`:

```ts
const ctx: ToolContext = {
  workspaceId: opts.workspaceId,
  workspacePath: opts.workspacePath ?? ws.path,  // worktree override
  signal: opts.signal,
  onLog,
};
```

The graph executor already passes `workspacePath` — just need to thread it through.

### 2.5 Git Tools — WorkspaceId Resolution

Git service functions (`workspaceStatus`, `workspaceDiff`, etc.) resolve the git directory from `workspaceId → ws.path`. When running in a worktree, they need to use the worktree path instead.

**Option:** Add an optional `cwd` override to git service functions, or have the tool implementations pass `ctx.workspacePath` directly to `simple-git` instead of going through the workspace lookup.

The cleanest approach: git tool implementations in `src/main/services/tools/git.ts` should use `ctx.workspacePath` (from ToolContext) directly with `simpleGit(ctx.workspacePath)` instead of calling service functions that re-resolve from workspaceId.

---

## Phase 3: IPC & API Layer

### 3.1 Worktree Router

**New file:** `src/main/ipc/worktree.ts`

tRPC procedures:

| Procedure | Type | Description |
|---|---|
| `list` | query | List all worktrees for active workspace |
| `get` | query | Get single worktree by ID |
| `getForSession` | query | Get worktree for a session ID |
| `remove` | mutation | Remove a worktree (git worktree remove + update DB) |
| `delete` | mutation | Remove worktree + hard-delete DB record |

### 3.2 Session Router Update

**File:** `src/main/ipc/session.ts`

- `session.create` return type should include the worktree record (if created).
- `session.get` should join/include worktree data.

### 3.3 Settings Router Update

**File:** `src/main/ipc/settings.ts`

Add:
- `useWorktrees` — query, returns boolean.
- `setUseWorktrees` — mutation, accepts boolean.

### 3.4 Router Registration

**File:** `src/main/ipc/router.ts`

Add `worktree: worktreeRouter` to the merged router.

---

## Phase 4: Frontend

### 4.1 Settings Page — Worktree Toggle

**File:** `src/renderer/src/pages/Settings.tsx`

Add a new "Worktrees" section (near the Git section) with a toggle:
- Label: "Use worktrees for session isolation"
- Description: "Creates a separate git worktree for each session, keeping your workspace clean."
- Toggle bound to `trpc.settings.useWorktrees` / `trpc.settings.setUseWorktrees`.

### 4.2 Session Header — Worktree Details

**File:** `src/renderer/src/pages/Sessions.tsx`

In the `SessionDetail` header area, when a worktree exists for the session:
- Show branch name with a git-branch icon.
- Show worktree path (truncated, with tooltip for full path). Clicking it opens the directory in the system file manager.
- Show status badge: green "Active" or gray "Removed".

When no worktree exists (setting disabled or non-git workspace): show nothing extra.

### 4.3 Worktrees Management Page

**New file:** `src/renderer/src/pages/Worktrees.tsx`

Table/list view showing all worktrees for the active workspace:

| Column | Description |
|---|---|
| Branch | Branch name |
| Session | Link to the session (or "Orphaned" if session was deleted) |
| Path | Disk path (truncated) |
| Status | Active / Removed |
| Base | Branch + commit it was created from |
| Created | Timestamp |
| Actions | Delete button (with confirmation dialog) |

Bulk action: "Delete all removed worktrees" button.

### 4.4 Sidebar Entry

**File:** `src/renderer/src/components/Sidebar.tsx`

Add "Worktrees" entry with a git-fork icon, positioned after "Changes" (since it's git-related). Only visible when `useWorktrees` setting is enabled.

### 4.5 Shared Types Update

**File:** `src/shared/types.ts`

Add:

```ts
export interface WorktreeRecord {
  id: string;
  workspaceId: string;
  sessionId: string | null;
  branch: string;
  path: string;
  baseBranch: string;
  baseCommit: string;
  status: 'active' | 'removed';
  createdAt: number;
}
```

---

## Phase 5: Edge Cases & Error Handling

### 5.1 Non-Git Workspace
- `createWorktree` detects non-git workspace via `getWorktreeRoot()`, returns `null`.
- Session created normally without worktree. No error shown to user.

### 5.2 Worktree Creation Failure
- Disk full, permission errors, branch name collision, etc.
- Log the error. Create session without worktree. Optionally emit a warning event to the task bus.

### 5.3 Session Deletion with Active Worktree
- `removeWorktreeBySession` runs `git worktree remove --force`.
- If removal fails (e.g., locked files), log error, mark status as `'removed'` in DB anyway, let user manually clean up via management page.

### 5.4 Worktree Path Disappeared
- Before using worktree path in runner, verify directory exists.
- If missing, fall back to workspace path and log a warning.

### 5.5 Existing Sessions (Migration)
- Existing sessions have no worktree record — they continue to use workspace path.
- No backfill needed. Worktrees only created for new sessions after the setting is enabled.

### 5.6 Concurrent Sessions
- Multiple sessions can have worktrees simultaneously — each is an independent directory.
- No locking needed since they're separate directories on separate branches.

---

## Implementation Order

```
Step 1:  Schema + paths utility (worktrees table, worktreesRoot)
Step 2:  Settings key (USE_WORKTREES)
Step 3:  Worktree service (create, remove, list, get)
Step 4:  Store CRUD (worktree DB operations)
Step 5:  Session creation/deletion hooks (auto-create/remove worktree)
Step 6:  Runner update (resolve worktree path → RunCtx.workspacePath)
Step 7:  Tool registry update (accept workspacePath override)
Step 8:  Git tools update (use ctx.workspacePath directly)
Step 9:  IPC: worktree router + settings endpoints + session router updates
Step 10: Frontend: settings toggle
Step 11: Frontend: session header worktree details
Step 12: Frontend: worktrees management page + sidebar entry
Step 13: Edge case handling + testing
```

---

## Files Changed (Summary)

| File | Change Type |
|---|---|
| `src/main/db/schema.ts` | Modified — add `worktrees` table |
| `src/main/util/paths.ts` | Modified — add `worktreesRoot()` |
| `src/main/services/settings.ts` | Modified — add `USE_WORKTREES` key |
| `src/main/services/worktrees.ts` | **New** — worktree service |
| `src/main/services/store.ts` | Modified — worktree CRUD + session hooks |
| `src/main/orchestrator/runner.ts` | Modified — resolve worktree path |
| `src/main/services/tools/registry.ts` | Modified — accept workspacePath override |
| `src/main/services/tools/git.ts` | Modified — use ctx.workspacePath |
| `src/main/ipc/worktree.ts` | **New** — worktree tRPC router |
| `src/main/ipc/settings.ts` | Modified — add worktree setting endpoints |
| `src/main/ipc/session.ts` | Modified — include worktree data |
| `src/main/ipc/router.ts` | Modified — register worktree router |
| `src/shared/types.ts` | Modified — add WorktreeRecord type |
| `src/renderer/src/pages/Settings.tsx` | Modified — add worktree toggle |
| `src/renderer/src/pages/Sessions.tsx` | Modified — show worktree details in header |
| `src/renderer/src/pages/Worktrees.tsx` | **New** — worktrees management page |
| `src/renderer/src/components/Sidebar.tsx` | Modified — add worktrees nav entry |
