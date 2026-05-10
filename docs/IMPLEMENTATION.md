# ASE — Autonomous Software Engineer

## Detailed Implementation Plan

> Source of truth for building the Electron-based ASE desktop app described in [prd.md](prd.md).
> Every phase below is independently shippable. We build, run, and verify one phase at a time.

---

## 0. Product Summary

ASE is a **local-first Electron desktop app** that lets a user describe a software task in natural language and watch a multi-agent system **plan → write code → run it → test it → iterate** inside a sandboxed workspace, with a built-in Monaco editor, skills system, background task queue, scheduled jobs, and session history.

**Local-only LLM** (Ollama). **No cloud calls** by default.

---

## 1. Tech Stack (locked)

| Layer           | Choice                                                                      | Notes                              |
| --------------- | --------------------------------------------------------------------------- | ---------------------------------- |
| Shell           | **Electron 30+**                                                            | Packaged via `electron-builder`    |
| Build           | **electron-vite**                                                           | TS + HMR for renderer + main       |
| Language        | **TypeScript 5** strict                                                     | All code                           |
| Renderer UI     | **React 18 + Tailwind 3 + shadcn/ui**                                       | Routing via `react-router`         |
| Renderer state  | **Zustand** + **TanStack Query**                                            | Query for tRPC data                |
| Editor          | **Monaco** (`@monaco-editor/react`)                                         | File tree via custom component     |
| Main ↔ Renderer | **electron-trpc**                                                           | Fully typed IPC                    |
| DB              | **better-sqlite3** + **Drizzle ORM**                                        | File at `userData/ase.db`          |
| LLM             | **Ollama** HTTP API (`/api/chat`, `/api/generate`)                          | Pluggable `LLMProvider` interface  |
| Agent runtime   | **LangGraph.js** (`@langchain/langgraph`)                                   | StateGraph for the loop            |
| Sandbox         | **Node `child_process`** with cwd jail, env scrub, CPU/mem/wallclock limits | Optional `nsjail`/`bwrap` if found |
| Git             | **simple-git**                                                              | Local branch + commit only (MVP)   |
| Scheduler       | **node-cron**                                                               | Persisted in SQLite                |
| Queue           | Custom in-process FIFO with concurrency limit                               | No Redis                           |
| Logging         | **pino** + per-task NDJSON files                                            | Streamed to renderer               |
| Packaging       | **electron-builder**                                                        | dmg/zip for macOS                  |
| Testing         | **Vitest** for units, **Playwright** for renderer e2e                       |                                    |
| Lint/format     | **ESLint** + **Prettier**                                                   |                                    |
| Node target     | **Node 20+**                                                                | Electron 30 ships Node 20          |

App name: **ASE**. Bundle id: **`com.ase.app`**. Default model: **`qwen2.5-coder:7b`** (overridable in Settings).

---

## 2. High-Level Architecture

```
┌────────────────────────── Electron App ───────────────────────────┐
│                                                                    │
│  Renderer (React)                Main (Node)                       │
│  ┌────────────────────┐  tRPC   ┌──────────────────────────────┐   │
│  │ Sidebar nav        │◄──────► │ tRPC router                   │   │
│  │ Sessions / Chat    │         │  ├─ sessions, tasks, skills   │   │
│  │ Task console       │ stream  │  ├─ agents, schedules         │   │
│  │ Monaco editor      │ events  │  └─ workspaces, files         │   │
│  │ Skills manager     │         │                                │   │
│  │ Agents settings    │         │ Orchestrator                   │   │
│  │ Schedules          │         │  ├─ TaskQueue (concurrency=N)  │   │
│  │ Approvals modal    │         │  ├─ Scheduler (node-cron)      │   │
│  │ Settings           │         │  └─ LangGraph StateGraph       │   │
│  └────────────────────┘         │       Planner→Exec→Tester→Critic│  │
│                                 │                                │   │
│                                 │ Services                       │   │
│                                 │  ├─ LLMProvider (Ollama)       │   │
│                                 │  ├─ SkillsRegistry             │   │
│                                 │  ├─ ToolRegistry               │   │
│                                 │  ├─ Sandbox                    │   │
│                                 │  ├─ Git                        │   │
│                                 │  ├─ DB (Drizzle/SQLite)        │   │
│                                 │  └─ EventBus (per task)        │   │
│                                 └──────────────────────────────┘   │
│                                                                    │
│  Tray icon: queue status, recent tasks, notifications              │
└────────────────────────────────────────────────────────────────────┘
```

---

## 3. Repository Layout

```
ase/
├─ package.json
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ tsconfig.json
├─ tsconfig.node.json
├─ .eslintrc.cjs
├─ .prettierrc
├─ drizzle.config.ts
├─ resources/
│  ├─ icon.png
│  └─ tray.png
├─ skills/                                # bundled default skills (copied to userData on first run)
│  ├─ node-testing/SKILL.md
│  ├─ refactor-ts/SKILL.md
│  └─ bug-fix/SKILL.md
├─ src/
│  ├─ shared/
│  │  ├─ types.ts                         # Task, Step, Session, Skill, Agent, ...
│  │  ├─ events.ts                        # event payload types
│  │  └─ constants.ts
│  ├─ main/
│  │  ├─ index.ts                         # app bootstrap + windows + tray
│  │  ├─ ipc/
│  │  │  ├─ trpc.ts                       # createTRPCRouter
│  │  │  └─ routers/{session,task,skill,agent,schedule,workspace,file,settings,llm}.ts
│  │  ├─ db/
│  │  │  ├─ index.ts                      # drizzle client
│  │  │  ├─ schema.ts
│  │  │  └─ migrations/
│  │  ├─ orchestrator/
│  │  │  ├─ graph.ts                      # LangGraph StateGraph
│  │  │  ├─ state.ts                      # AgentState type + reducers
│  │  │  ├─ queue.ts                      # TaskQueue
│  │  │  ├─ scheduler.ts                  # node-cron wrapper
│  │  │  ├─ runner.ts                     # runTask(taskId)
│  │  │  └─ agents/
│  │  │     ├─ planner.ts
│  │  │     ├─ executor.ts
│  │  │     ├─ tester.ts
│  │  │     └─ critic.ts
│  │  ├─ services/
│  │  │  ├─ llm/
│  │  │  │  ├─ provider.ts                # interface
│  │  │  │  └─ ollama.ts
│  │  │  ├─ skills.ts
│  │  │  ├─ tools/
│  │  │  │  ├─ registry.ts
│  │  │  │  ├─ fs.ts                      # read/write/list/grep/apply_patch
│  │  │  │  ├─ shell.ts                   # sandboxed exec
│  │  │  │  ├─ git.ts
│  │  │  │  └─ test.ts                    # detect+run tests
│  │  │  ├─ sandbox.ts
│  │  │  ├─ workspaces.ts
│  │  │  ├─ events.ts                     # EventBus
│  │  │  └─ logger.ts
│  │  └─ util/{paths,errors,patch}.ts
│  ├─ preload/
│  │  └─ index.ts                         # exposes electronTRPC + safe APIs
│  └─ renderer/
│     ├─ index.html
│     ├─ src/
│     │  ├─ main.tsx
│     │  ├─ app.tsx
│     │  ├─ router.tsx
│     │  ├─ trpc.ts                       # client
│     │  ├─ store/{ui,session,task}.ts
│     │  ├─ pages/
│     │  │  ├─ Sessions.tsx
│     │  │  ├─ Session.tsx                # chat + task console
│     │  │  ├─ Editor.tsx                 # Monaco + file tree
│     │  │  ├─ Skills.tsx
│     │  │  ├─ Agents.tsx
│     │  │  ├─ Schedules.tsx
│     │  │  └─ Settings.tsx
│     │  ├─ components/
│     │  │  ├─ Sidebar.tsx
│     │  │  ├─ TaskTimeline.tsx
│     │  │  ├─ ApprovalDialog.tsx
│     │  │  ├─ FileTree.tsx
│     │  │  ├─ MonacoPane.tsx
│     │  │  ├─ LogStream.tsx
│     │  │  └─ ui/                        # shadcn generated
│     │  └─ styles/globals.css
│     └─ tailwind.config.ts
└─ tests/
   ├─ unit/
   └─ e2e/
```

---

## 4. Data Model (Drizzle / SQLite)

```ts
// src/main/db/schema.ts
workspaces:
  id TEXT PK, name TEXT, path TEXT, managed INTEGER, created_at INTEGER

sessions:
  id TEXT PK, workspace_id TEXT FK, title TEXT,
  status TEXT('active'|'archived'), created_at, updated_at

messages:                                  // chat-style memory per session
  id TEXT PK, session_id FK, role TEXT('user'|'assistant'|'system'),
  content TEXT, ts INTEGER

tasks:
  id TEXT PK, session_id FK, prompt TEXT,
  status TEXT('queued'|'running'|'awaiting_approval'|'succeeded'|'failed'|'cancelled'),
  plan_json TEXT, result_json TEXT,
  iterations INTEGER DEFAULT 0,
  max_iterations INTEGER DEFAULT 6,
  created_at, started_at, finished_at

steps:
  id TEXT PK, task_id FK, idx INTEGER,
  agent TEXT('planner'|'executor'|'tester'|'critic'),
  tool TEXT NULL, input_json TEXT, output_json TEXT,
  status TEXT('pending'|'running'|'ok'|'error'|'skipped'),
  started_at, finished_at

approvals:
  id TEXT PK, task_id FK, step_id FK NULL,
  kind TEXT('shell'|'write'|'git'|'custom'),
  payload_json TEXT, decision TEXT('pending'|'allow'|'deny'),
  created_at, decided_at

skills:
  id TEXT PK, name TEXT UNIQUE, path TEXT, description TEXT,
  enabled INTEGER, builtin INTEGER, updated_at

agents:                                    // user-editable agent presets
  id TEXT PK, name TEXT UNIQUE, role TEXT,
  model TEXT, system_prompt TEXT, tools_json TEXT, temperature REAL

schedules:
  id TEXT PK, name TEXT, cron TEXT,
  workspace_id FK, prompt TEXT, enabled INTEGER,
  last_run_at, next_run_at

settings:                                  // single row k/v
  key TEXT PK, value TEXT
```

Migrations live under `src/main/db/migrations/` and are applied on app start.

---

## 5. Shared Types

```ts
// src/shared/types.ts
export type TaskStatus =
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'succeeded'
  | 'failed'
  | 'cancelled';
export type AgentRole = 'planner' | 'executor' | 'tester' | 'critic';
export type StepStatus = 'pending' | 'running' | 'ok' | 'error' | 'skipped';

export interface Plan {
  goal: string;
  steps: PlanStep[];
  successCriteria: string[];
}
export interface PlanStep {
  id: string;
  description: string;
  tool?: ToolName;
  args?: unknown;
  dependsOn?: string[];
}

export type ToolName =
  | 'read_file'
  | 'write_file'
  | 'apply_patch'
  | 'list_dir'
  | 'grep'
  | 'run_shell'
  | 'run_tests'
  | 'git_status'
  | 'git_branch'
  | 'git_commit'
  | 'git_diff'
  | 'ask_user';

export interface ToolCall {
  name: ToolName;
  args: Record<string, unknown>;
}
export interface ToolResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
}
```

---

## 6. Event Bus & Streaming

`EventBus` (Node `EventEmitter`) emits per-task events:

```
task.started  task.finished  task.failed  task.cancelled
step.started  step.finished  step.error
log.line      llm.delta      approval.requested  approval.resolved
```

Renderer subscribes via a tRPC subscription `task.events(taskId)` (electron-trpc supports observables) and updates the timeline live.

---

## 7. Tools — full spec

| Tool          | Args                         | Behaviour                                                    | Approval                       |
| ------------- | ---------------------------- | ------------------------------------------------------------ | ------------------------------ |
| `read_file`   | `{ path }`                   | UTF-8 read, max 1 MB                                         | no                             |
| `write_file`  | `{ path, content }`          | Overwrite, must be inside workspace                          | yes if `requireApproval.write` |
| `apply_patch` | `{ patch }`                  | unified diff applier                                         | yes if `requireApproval.write` |
| `list_dir`    | `{ path, depth }`            | tree, ignores `.git`, `node_modules`                         | no                             |
| `grep`        | `{ pattern, path?, regex? }` | ripgrep-like via `fast-glob` + scan                          | no                             |
| `run_shell`   | `{ cmd, args, timeoutMs? }`  | sandboxed, captures stdout/stderr                            | yes if `requireApproval.shell` |
| `run_tests`   | `{ cmd? }`                   | auto-detect (`npm test`, `pnpm test`, `pytest`) or use given | yes if `requireApproval.shell` |
| `git_status`  | `{}`                         | simple-git status                                            | no                             |
| `git_branch`  | `{ name }`                   | create+checkout                                              | yes if `requireApproval.git`   |
| `git_commit`  | `{ message, all? }`          | stages + commits                                             | yes if `requireApproval.git`   |
| `git_diff`    | `{}`                         | working diff                                                 | no                             |
| `ask_user`    | `{ question, choices? }`     | creates `approval` row, blocks step until resolved           | always                         |

All tools live in `src/main/services/tools/*.ts`, registered in `ToolRegistry`. Each tool exports:

```ts
export const tool = {
  name: 'write_file' as const,
  schema: z.object({ path: z.string(), content: z.string() }),
  needsApproval: (ctx) => ctx.settings.requireApproval.write,
  run: async (args, ctx) => { ... },
};
```

---

## 8. Sandbox

`src/main/services/sandbox.ts`:

- `runShell({ cmd, args, cwd, timeoutMs })`
- `cwd` **must** resolve inside the workspace path (path-traversal check using `path.relative`).
- Spawned with **scrubbed env**: only `PATH`, `HOME`, `LANG`, `NODE_ENV`, plus a minimal allowlist from settings.
- `timeoutMs` default 60s, max 10m. Killed via `tree-kill`.
- Stdout/stderr captured and streamed via `EventBus` (`log.line`).
- Optional wrapper: if `nsjail` (Linux) or `sandbox-exec` (macOS) is present and Settings.strictSandbox is on, wrap the command.
- `cmd` allowlist by default: `node`, `npm`, `pnpm`, `yarn`, `npx`, `git`, `python`, `pytest`, `tsc`, `vitest`, `jest`. Configurable.

---

## 9. LLM Provider

```ts
// src/main/services/llm/provider.ts
export interface LLMProvider {
  name: string;
  listModels(): Promise<string[]>;
  chat(opts: {
    model: string;
    messages: ChatMessage[];
    tools?: ToolSpec[]; // JSON-schema tool defs
    temperature?: number;
    signal?: AbortSignal;
    onDelta?: (delta: string) => void; // streaming
  }): Promise<ChatResult>; // { content, toolCalls?, usage }
}
```

`OllamaProvider` implements via `POST /api/chat` with `stream: true`. Tool-calling: we use **structured-output prompting** (JSON schema in system prompt) since Ollama tool support varies by model. The executor parses `tool_calls` from the model's JSON reply.

Health check on app start: `GET /api/tags` → if missing, show onboarding banner with install instructions and `ollama pull qwen2.5-coder:7b`.

---

## 10. Skills System

Folder layout (per skill):

```
skills/<skill-id>/
  SKILL.md           # frontmatter + body
  scripts/           # optional helper scripts (called via run_shell)
```

`SKILL.md` frontmatter:

```md
---
name: node-testing
description: Generate and run Vitest tests for Node.js projects.
when_to_use: When the user asks to add tests, increase coverage, or test changes.
tags: [testing, node, vitest]
---

# Body...
```

**Loader** (`src/main/services/skills.ts`):

- Scans `userData/skills/*` and merges with `app://skills/*` (builtins).
- On first run, copies builtins to userData (so user can edit).
- Indexed in DB row.

**Use during planning**: planner is given a compact list of `{name, description, when_to_use}`. It returns `selected_skills: string[]`. Selected skills' full bodies are injected into executor's system prompt.

UI: Skills page lists all skills with toggle, "Open folder" button, and "New skill" wizard.

---

## 11. Agents (LangGraph StateGraph)

```ts
type AgentState = {
  taskId: string;
  workspacePath: string;
  prompt: string;
  plan?: Plan;
  selectedSkills: string[];
  history: ChatMessage[]; // running conversation
  scratchpad: ToolCall[]; // recent tool calls
  iteration: number;
  maxIterations: number;
  testReport?: TestReport;
  verdict?: { done: boolean; reason: string };
  errors: string[];
};
```

Graph nodes:

```
START → planner → executor → (loop ↺) tester → critic → END
                       ▲                          │
                       └──── replan? ─────────────┘
```

- **planner**: produces `Plan` JSON + `selectedSkills`. One LLM call. Persists `tasks.plan_json`.
- **executor**: iterates over plan steps. For each, may emit one or many `ToolCall`s. Tool results appended to history. Writes `steps` rows. Stops when plan finished or budget exceeded.
- **tester**: runs `run_tests` (auto-detected). Captures pass/fail, failing test names.
- **critic**: judges goal vs. test report and current diff. Outputs `{ done, reason, suggestedFixes? }`.
  - If `!done` and `iteration < max`, loop back to **executor** (with critic feedback prepended).
  - Else → END.

Each node is a plain async function returning a partial state update. LangGraph handles transitions.

Cancellation: every node receives an `AbortSignal` from `runner.ts`; UI "Stop" button aborts.

---

## 12. Task Queue & Scheduler

`TaskQueue`:

- FIFO array of taskIds, configurable `concurrency` (default 1).
- `enqueue(taskId)` → status `queued`. Worker loop pulls and calls `runTask(taskId)`.
- `cancel(taskId)` aborts active or removes from queue.

`Scheduler` (`node-cron`):

- On boot, loads all enabled `schedules`, registers cron jobs.
- On fire: creates a new `task` (and session if missing) and enqueues it.
- CRUD in UI updates registrations in real time.

Tray menu shows: queue size, current running task title, "Pause queue", "Open ASE".

Notifications via `new Notification(...)` from main → `task.finished/failed`.

---

## 13. tRPC Routers (renderer-facing API)

```
session: list, get, create, rename, archive, delete, addMessage
task:    create(sessionId, prompt, opts), get, list(sessionId),
         cancel, retry, events(taskId) [subscription]
workspace: list, create, openExisting, delete
file:    tree(workspaceId, path), read, write, rename, delete, search
skill:   list, get, toggle, create, update, delete, reveal
agent:   list, get, upsert, delete
schedule: list, upsert, delete, runNow
approval: pending, decide(id, allow|deny)
settings: get, set
llm:     listModels, health, pullModel(name) [subscription for progress]
```

All inputs validated with `zod`. Subscriptions use `observable()` from `@trpc/server`.

---

## 14. UI Pages

1. **Sessions** — list with search, new session button.
2. **Session** — split view: left = chat (messages + new task input), right = active task timeline (steps, logs, approvals). Top bar: workspace selector, model selector.
3. **Editor** — file tree (left) + Monaco tabs (right). Save = Ctrl/Cmd+S. Read-only toggle when a task is running on that workspace.
4. **Skills** — table of skills, enable toggle, edit (opens skill folder in OS), New skill wizard.
5. **Agents** — list of agent presets; edit role/model/system prompt/temperature/tools.
6. **Schedules** — table with cron expression helper (human-readable + next-run preview).
7. **Settings** — model defaults, sandbox allowlist, approval toggles, theme, data folder, queue concurrency, telemetry off.

Approval modal pops globally when an approval row enters `pending`; user clicks Allow/Deny.

---

## 15. Security Considerations

- All file paths normalized + checked against workspace root before any FS op.
- Renderer has `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Preload exposes only `electronTRPC`.
- CSP in `index.html`: `default-src 'self'; connect-src 'self' http://localhost:11434; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'`.
- Shell command allowlist enforced.
- Approval gates default ON for `write`, `shell`, `git`.
- No outbound network calls except Ollama localhost (configurable).

---

## 16. Logging & Telemetry

- `pino` logger; rotating file at `userData/logs/main.log`.
- Per-task NDJSON at `userData/logs/tasks/<taskId>.ndjson` (one event per line).
- "Open logs folder" in Settings.
- **No telemetry** in MVP.

---

## 17. Testing Strategy

- **Unit** (`vitest`):
  - tools (fs jail, patch apply, grep)
  - sandbox (timeout, env scrub)
  - skills loader, frontmatter parser
  - planner JSON parsing, plan validation
  - queue ordering + concurrency
- **Integration**:
  - end-to-end runTask against a fake LLM (deterministic fixtures) and a temp workspace.
- **E2E** (`playwright-electron`):
  - boot app, create session, run a tiny task, see steps appear, edit a file in Monaco.

---

## 18. Build, Run, Package

Scripts (`package.json`):

```
"dev"        : electron-vite dev
"build"      : electron-vite build
"typecheck"  : tsc --noEmit
"lint"       : eslint .
"test"       : vitest run
"test:e2e"   : playwright test
"db:gen"     : drizzle-kit generate
"db:push"    : drizzle-kit push
"package"    : electron-builder --mac --arm64 --x64
```

Electron-builder targets macOS first (dmg + zip), then later win/linux.

---

## 19. Build Phases (execution order)

Each phase ends with a runnable app. Acceptance criteria are checkable.

### Phase 1 — Scaffold

- Init repo, `electron-vite` template, TS strict.
- Tailwind + shadcn/ui + base layout (Sidebar + empty pages).
- tRPC wired (renderer ↔ main) with a `ping` route.
- SQLite + Drizzle initial migration with all tables empty.
- App boots showing Sidebar, "Hello ASE".
  **Done when:** `pnpm dev` opens window, `ping` returns "pong" via tRPC.

### Phase 2 — Workspaces & Editor

- Workspace CRUD (managed under userData, or "Open existing folder…").
- File tree (`file.tree`) and Monaco viewer/editor with save.
- Workspace selector in top bar persists in `settings`.
  **Done when:** user can create a workspace, open files, edit + save.

### Phase 3 — LLM Provider

- Ollama provider + Settings page model picker.
- Health check + onboarding banner if Ollama is missing.
- "Pull model" with streaming progress in UI.
  **Done when:** Settings shows installed models; can chat-test in a debug page.

### Phase 4 — Tools & Sandbox

- Implement all tools listed in §7 with unit tests.
- Sandbox runner with timeout/env scrub/allowlist.
  **Done when:** unit tests pass; tools callable from a debug tRPC route.

### Phase 5 — Single-Agent Loop (LangGraph)

- Planner → Executor → Tester → Critic graph.
- `runTask(taskId)` runs end-to-end with EventBus emissions.
- Persist plan, steps, results.
  **Done when:** Submit "Create a hello.js that prints Hello and a passing vitest", task succeeds with files created and tests green.

### Phase 6 — Sessions & Task UI

- Sessions page + Session view with chat + live task timeline.
- Approval dialog wired.
- Cancel / Retry buttons.
  **Done when:** A user can run, watch, cancel, and retry tasks visually.

### Phase 7 — Skills System

- Skills loader, builtin skills (`node-testing`, `bug-fix`, `refactor-ts`).
- Planner picks skills; executor uses them.
- Skills UI (toggle, edit, new).
  **Done when:** Toggling a skill changes planner output; new skill discovered after refresh.

### Phase 8 — Background Tasks & Scheduler

- TaskQueue with concurrency setting.
- Tray icon + native notifications.
- Schedules CRUD + node-cron + Schedules page.
  **Done when:** A scheduled task fires at the cron time and notifies via tray.

### Phase 9 — Git Integration

- `git_*` tools enabled; "auto-branch per task" setting.
- Show working diff in Session view (read-only Monaco diff).
  **Done when:** A task creates branch `ase/<taskId>` and commits its changes when enabled.

### Phase 10 — Polish & Package

- Theming (light/dark), keyboard shortcuts, error boundaries.
- Logs folder, export task report (JSON+md).
- electron-builder dmg.
  **Done when:** Installable `.dmg` runs the full flow.

---

## 20. Acceptance Demo Script (end-of-MVP)

1. Launch ASE.
2. Create workspace **"demo"**.
3. New session → prompt: _"Add a function `slugify(str)` in `src/slug.ts` and write vitest tests covering spaces, punctuation, and unicode."_
4. Watch planner produce 4 steps; executor writes files; tester runs `vitest`; critic marks done after 1 iteration.
5. Open `src/slug.ts` in Editor, see code.
6. Schedules → add cron `0 9 * * *` → "Run a lint check" → toggle on.
7. Quit; reopen; schedule still registered.

---

## 21. Open Items / Decisions Deferred

- Multi-LLM support (OpenAI/Anthropic) — interface ready, providers stubbed.
- Vector memory — table reserved, off in MVP.
- Windows/Linux packaging — after macOS.
- GitHub PR creation — after local Git integration.
- Multi-repo orchestration — out of MVP per PRD §3.

---

## 22. Glossary

- **Workspace** — a directory ASE can read/write; the unit of isolation.
- **Session** — a conversation thread; contains messages and tasks.
- **Task** — one autonomous run of the agent graph against a prompt.
- **Step** — one node execution or tool call inside a task.
- **Skill** — a markdown-defined capability the planner can attach.
- **Agent** — a configured persona (role + model + system prompt + tools).
- **Schedule** — a cron-triggered task template.
- **Approval** — a human gate blocking a sensitive tool call.

---

_End of plan. We'll start with **Phase 1 — Scaffold** next._
