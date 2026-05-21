# ASE — Feature Implementation Plan v2

## Features Covered

1. **Model & Agent Selection at Task Creation**
2. **Custom Agents with LangChain (Presets + Direct Mode)**
3. **Workflow Builder (Visual, React Flow)**
4. **Git Commit + Push + PR Creation via `gh` CLI**

> Implementation order: Agents CRUD → Task Selection → Git/PR → Workflow Builder

---

## 1. Custom Agents — CRUD & Runtime

### 1.1 Goal

Build out the Agents page with full create/read/update/delete for agent presets. Each agent defines a persona (name, model, system prompt, temperature, tool subset) with a `graphMode` that controls how it executes:

- `full` — injected into the standard 4-node graph (planner→executor→tester→critic)
- `direct` — standalone ReAct loop (think→tool→observe→repeat until done)

### 1.2 Schema Changes

**Alter `agents` table** (new migration):

```sql
ALTER TABLE agents ADD COLUMN graph_mode TEXT NOT NULL DEFAULT 'full';
ALTER TABLE agents ADD COLUMN max_iterations INTEGER NOT NULL DEFAULT 10;
ALTER TABLE agents ADD COLUMN description TEXT;
ALTER TABLE agents ADD COLUMN provider TEXT NOT NULL DEFAULT 'ollama';
```

Updated Drizzle schema (`src/main/db/schema.ts`):

```ts
export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  role: text('role').notNull(),
  model: text('model').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  toolsJson: text('tools_json'),
  temperature: real('temperature').notNull().default(0.2),
  // ─── new fields ───
  graphMode: text('graph_mode').notNull().default('full'),     // 'full' | 'direct'
  maxIterations: integer('max_iterations').notNull().default(10),
  description: text('description'),
  provider: text('provider').notNull().default('ollama'),      // ProviderId
});
```

### 1.3 Backend — IPC Router

**File:** `src/main/ipc/agent.ts` (new file, add to router)

```ts
export const agentRouter = router({
  list: publicProcedure.query(() => listAgents()),
  get: publicProcedure.input(z.object({ id: z.string() })).query(({ input }) => getAgent(input.id)),
  upsert: publicProcedure.input(agentSchema).mutation(({ input }) => upsertAgent(input)),
  delete: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => deleteAgent(input.id)),
  test: publicProcedure
    .input(z.object({ id: z.string(), prompt: z.string() }))
    .mutation(({ input }) => testAgent(input.id, input.prompt)),
});
```

Input schema for `upsert`:

```ts
const agentSchema = z.object({
  id: z.string().optional(),          // omit for create
  name: z.string().min(1).max(100),
  role: z.string().min(1),
  model: z.string().min(1),
  systemPrompt: z.string().min(1),
  toolsJson: z.string().nullable(),   // JSON array of ToolName[]
  temperature: z.number().min(0).max(2),
  graphMode: z.enum(['full', 'direct']),
  maxIterations: z.number().int().min(1).max(50).optional(),
  description: z.string().optional(),
  provider: z.enum(['ollama', 'copilot']).optional(),
});
```

### 1.4 Backend — Direct Mode Runner

**File:** `src/main/orchestrator/direct-runner.ts` (new)

Standalone ReAct loop for agents with `graphMode === 'direct'`:

```ts
export async function runDirectAgent(
  taskId: string,
  agent: AgentRecord,
  ctx: RunCtx,
): Promise<TaskResult> {
  // 1. Build messages: [system: agent.systemPrompt, user: task.prompt]
  // 2. Loop (max agent.maxIterations):
  //    a. Call LLM with tool definitions (filtered by agent.toolsJson)
  //    b. If model returns tool calls → execute each, append observation
  //    c. If model returns {done: true} or no tool calls → break
  // 3. Emit events throughout (step.started, tool calls, llm.delta, etc.)
  // 4. Return TaskResult
}
```

Integration in `runner.ts`:

```ts
// In doRunInner(), after resolving agent:
if (agent && agent.graphMode === 'direct') {
  result = await runDirectAgent(taskId, agent, ctx);
} else {
  // existing graph execution
}
```

### 1.5 Frontend — Agents Page

**File:** `src/renderer/src/pages/Agents.tsx` (replace placeholder)

Layout:
- Left panel: list of agents with name, role badge, model tag
- Right panel: form for creating/editing selected agent
- Fields: name, description, role, model (dropdown from `llm.listModels`), provider, system prompt (textarea/Monaco), temperature (slider), tools (multi-select checkboxes), graph mode (toggle: full/direct), max iterations (number input)
- Actions: Save, Delete, Test (runs a quick prompt and shows response)

### 1.6 Acceptance Criteria

- [ ] Agents page renders list of saved agents
- [ ] Can create agent with all fields, persisted in DB
- [ ] Can edit/delete agents
- [ ] Agent with `graphMode: 'direct'` runs as standalone ReAct loop
- [ ] Agent with `graphMode: 'full'` injects its system prompt into the planner/executor
- [ ] "Test agent" button sends a prompt and streams the response

---

## 2. Model & Agent Selection at Task Creation

### 2.1 Goal

Add a collapsible "Advanced options" section below the task prompt textarea that lets users pick a specific model, agent, or workflow for that task.

### 2.2 Schema Changes

**Alter `tasks` table** (new migration):

```sql
ALTER TABLE tasks ADD COLUMN model_override TEXT;
ALTER TABLE tasks ADD COLUMN agent_id TEXT;
ALTER TABLE tasks ADD COLUMN workflow_id TEXT;
```

Updated Drizzle schema addition in `tasks`:

```ts
modelOverride: text('model_override'),   // override active model for this task
agentId: text('agent_id'),               // FK to agents.id (nullable)
workflowId: text('workflow_id'),         // FK to workflows.id (nullable, Phase 4)
```

### 2.3 Backend Changes

**`src/main/ipc/session.ts` — `task.create` input:**

```ts
create: publicProcedure
  .input(z.object({
    sessionId: z.string().min(1),
    prompt: z.string().min(1),
    maxIterations: z.number().int().min(1).max(20).optional(),
    autostart: z.boolean().optional(),
    // ─── new ───
    modelOverride: z.string().optional(),
    agentId: z.string().optional(),
    workflowId: z.string().optional(),
  }))
  .mutation(({ input }) => {
    const task = createTask(input.sessionId, input.prompt, input.maxIterations, {
      modelOverride: input.modelOverride,
      agentId: input.agentId,
      workflowId: input.workflowId,
    });
    // ...
  }),
```

**`src/main/orchestrator/runner.ts` — model resolution:**

```ts
// Priority: task.modelOverride > agent.model > global ACTIVE_MODEL setting
const agent = task.agentId ? getAgent(task.agentId) : null;
const model = task.modelOverride ?? agent?.model ?? (await getSetting(SETTING_KEYS.ACTIVE_MODEL)) ?? '';
```

**Dispatch logic in `doRunInner`:**

```ts
if (task.workflowId) {
  result = await runWorkflow(taskId, task.workflowId, ctx);  // Phase 4
} else if (agent && agent.graphMode === 'direct') {
  result = await runDirectAgent(taskId, agent, ctx);
} else {
  // Standard graph, optionally with agent's system prompt injected
  const graph = buildGraph(agent);  // pass agent to customize prompts
  // ...
}
```

### 2.4 Frontend Changes

**File:** `src/renderer/src/pages/sessions/SessionDetail.tsx`

Add collapsible "Advanced options" below the textarea:

```tsx
<details className="mt-2">
  <summary className="cursor-pointer font-mono text-ui-xs uppercase text-ink-500">
    advanced options
  </summary>
  <div className="mt-2 grid grid-cols-3 gap-3">
    <ModelPicker value={modelOverride} onChange={setModelOverride} />
    <AgentPicker value={agentId} onChange={setAgentId} />
    <WorkflowPicker value={workflowId} onChange={setWorkflowId} />
  </div>
</details>
```

- `ModelPicker` — dropdown populated from `trpc.llm.listModels`
- `AgentPicker` — dropdown populated from `trpc.agent.list`
- `WorkflowPicker` — dropdown populated from `trpc.workflow.list` (Phase 4, disabled until then)
- Only one of agent/workflow can be active (selecting one clears the other)

### 2.5 Acceptance Criteria

- [ ] Task creation form has collapsible advanced options
- [ ] Model dropdown shows all available models from active provider
- [ ] Agent dropdown shows all saved agents
- [ ] Selected model/agent persisted on task row
- [ ] Task runs with overridden model when specified
- [ ] Task runs with selected agent's configuration
- [ ] Mutually exclusive: selecting an agent clears workflow, and vice versa

---

## 3. Git Commit + Push + PR Creation

### 3.1 Goal

Extend the Changes page with full VS Code-style staging, commit, push, and GitHub PR creation via the `gh` CLI.

### 3.2 Backend — New Git IPC Routes

**File:** `src/main/ipc/git.ts` — add to `gitRouter`:

```ts
// Stage specific files
stage: publicProcedure
  .input(workspaceIn.extend({ paths: z.array(z.string().min(1)) }))
  .mutation(async ({ input }) => {
    const cwd = await resolveGitPath(input.workspaceId, input.worktreeId);
    await gitFor(cwd).add(input.paths);
    return { ok: true };
  }),

// Unstage specific files
unstage: publicProcedure
  .input(workspaceIn.extend({ paths: z.array(z.string().min(1)) }))
  .mutation(async ({ input }) => {
    const cwd = await resolveGitPath(input.workspaceId, input.worktreeId);
    await gitFor(cwd).reset(['--', ...input.paths]);
    return { ok: true };
  }),

// Stage all
stageAll: publicProcedure
  .input(workspaceIn)
  .mutation(async ({ input }) => {
    const cwd = await resolveGitPath(input.workspaceId, input.worktreeId);
    await gitFor(cwd).add('.');
    return { ok: true };
  }),

// Commit (staged files only)
commit: publicProcedure
  .input(workspaceIn.extend({ message: z.string().min(1).max(500) }))
  .mutation(async ({ input }) => {
    const cwd = await resolveGitPath(input.workspaceId, input.worktreeId);
    const result = await gitFor(cwd).commit(input.message);
    return { ok: true, hash: result.commit };
  }),

// Push
push: publicProcedure
  .input(workspaceIn.extend({ setUpstream: z.boolean().optional() }))
  .mutation(async ({ input }) => {
    const cwd = await resolveGitPath(input.workspaceId, input.worktreeId);
    const git = gitFor(cwd);
    const branch = (await git.branchLocal()).current;
    // Check if upstream is set
    try {
      await git.push();
    } catch {
      // No upstream — push with --set-upstream origin <branch>
      await git.push(['--set-upstream', 'origin', branch]);
    }
    return { ok: true };
  }),

// gh CLI: check auth status
ghAuthStatus: publicProcedure
  .input(workspaceIn)
  .query(async ({ input }) => {
    const cwd = await resolveGitPath(input.workspaceId, input.worktreeId);
    // Returns { authenticated: boolean, user?: string, error?: string }
    return checkGhAuth(cwd);
  }),

// gh CLI: create PR
createPr: publicProcedure
  .input(workspaceIn.extend({
    title: z.string().min(1).max(200),
    body: z.string().optional(),
    baseBranch: z.string().optional(),
    draft: z.boolean().optional(),
  }))
  .mutation(async ({ input }) => {
    const cwd = await resolveGitPath(input.workspaceId, input.worktreeId);
    return createPullRequest(cwd, input);
  }),

// gh CLI: view PR for current branch
prStatus: publicProcedure
  .input(workspaceIn)
  .query(async ({ input }) => {
    const cwd = await resolveGitPath(input.workspaceId, input.worktreeId);
    return getPrStatus(cwd);
  }),
```

### 3.3 Backend — Git Service Additions

**File:** `src/main/services/git.ts` — add:

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

export async function checkGhAuth(cwd: string): Promise<{
  authenticated: boolean;
  installed: boolean;
  user?: string;
  error?: string;
}> {
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'status'], { cwd });
    const match = stdout.match(/Logged in to .+ as (.+)/);
    return { authenticated: true, installed: true, user: match?.[1]?.trim() };
  } catch (err: any) {
    if (err.code === 'ENOENT') return { authenticated: false, installed: false, error: 'gh CLI not installed' };
    return { authenticated: false, installed: true, error: err.stderr || err.message };
  }
}

export async function createPullRequest(
  cwd: string,
  opts: { title: string; body?: string; baseBranch?: string; draft?: boolean },
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const args = ['pr', 'create', '--title', opts.title];
  if (opts.body) args.push('--body', opts.body);
  if (opts.baseBranch) args.push('--base', opts.baseBranch);
  if (opts.draft) args.push('--draft');
  try {
    const { stdout } = await execFileAsync('gh', args, { cwd });
    return { ok: true, url: stdout.trim() };
  } catch (err: any) {
    return { ok: false, error: err.stderr || err.message };
  }
}

export async function getPrStatus(cwd: string): Promise<{
  hasPr: boolean;
  url?: string;
  state?: string;
  title?: string;
} | null> {
  try {
    const { stdout } = await execFileAsync('gh', ['pr', 'view', '--json', 'url,state,title'], { cwd });
    const data = JSON.parse(stdout);
    return { hasPr: true, url: data.url, state: data.state, title: data.title };
  } catch {
    return { hasPr: false };
  }
}
```

### 3.4 Frontend — Changes Page Enhancements

**File:** `src/renderer/src/pages/Changes.tsx`

Add to the existing layout:

#### A) Stage/Unstage Buttons

Each file row gets a `+` (stage) or `-` (unstage) button:

```tsx
// In ChangedFileList, add to each <li>:
<button onClick={() => stage.mutate({ workspaceId, paths: [file.path] })}>+</button>
// or
<button onClick={() => unstage.mutate({ workspaceId, paths: [file.path] })}>−</button>
```

Plus "Stage All" / "Unstage All" buttons in section headers.

#### B) Commit Panel

Below the staged files section (or as a sticky footer):

```tsx
<div className="commit-panel border-t border-ink-800 p-3">
  <input
    placeholder="Commit message…"
    value={commitMsg}
    onChange={(e) => setCommitMsg(e.target.value)}
  />
  <div className="flex gap-2 mt-2">
    <button onClick={() => commit.mutate({ workspaceId, message: commitMsg })}>
      Commit
    </button>
    <button onClick={() => push.mutate({ workspaceId })}>
      Push
    </button>
  </div>
</div>
```

#### C) PR Section

Inline section that appears when:
- On a non-default branch
- Commits exist ahead of remote (or upstream not set)
- `gh` CLI is authenticated

```tsx
<div className="pr-section border-t border-ink-800 p-3">
  {!ghAuth.data?.installed && <Banner>gh CLI not installed. Install: brew install gh</Banner>}
  {!ghAuth.data?.authenticated && <Banner>Not authenticated. Run: gh auth login</Banner>}
  {prStatus.data?.hasPr ? (
    <PrBadge url={prStatus.data.url} state={prStatus.data.state} />
  ) : (
    <PrCreateForm
      onSubmit={({ title, body, baseBranch, draft }) =>
        createPr.mutate({ workspaceId, title, body, baseBranch, draft })
      }
    />
  )}
</div>
```

PR Create Form fields:
- Title (pre-filled from branch name or last commit message)
- Body (textarea, optional)
- Base branch (auto-detected default branch, with override dropdown)
- Draft toggle

### 3.5 Acceptance Criteria

- [ ] Stage/unstage individual files from the Changes page
- [ ] Stage All / Unstage All buttons work
- [ ] Commit button commits staged files with message
- [ ] Push button pushes to upstream (or sets upstream for new branches)
- [ ] `gh` CLI auth status detected and shown
- [ ] If not installed/authenticated, show actionable instructions
- [ ] Create PR form with title, body, base branch, draft toggle
- [ ] After PR creation, show link to the PR
- [ ] If PR already exists for branch, show its status (open/merged/closed)

---

## 4. Workflow Builder (Visual Canvas)

### 4.1 Goal

A drag-and-drop workflow editor using React Flow (`@xyflow/react`) that lets users visually compose agent workflows. The workflow is stored as JSON and dynamically compiled into a LangGraph `StateGraph` at runtime.

### 4.2 Dependencies

```bash
pnpm add @xyflow/react
```

### 4.3 Schema — `workflows` Table

**New migration:**

```sql
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  graph_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

Drizzle schema (`src/main/db/schema.ts`):

```ts
export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  graphJson: text('graph_json').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
```

### 4.4 `graph_json` Structure

```ts
interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface WorkflowNode {
  id: string;
  type: 'start' | 'end' | 'agent' | 'condition' | 'approval';
  position: { x: number; y: number };
  data: AgentNodeData | ConditionNodeData | ApprovalNodeData | {};
}

interface AgentNodeData {
  agentId: string;       // FK to agents table
  label?: string;        // display label override
}

interface ConditionNodeData {
  field: string;         // dot-notation path into state (e.g., "testReport.ok")
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'exists';
  value: unknown;        // comparison value
  label?: string;
}

interface ApprovalNodeData {
  question: string;      // what to ask the user
  choices?: string[];    // optional preset choices
}

interface WorkflowEdge {
  id: string;
  source: string;        // node id
  target: string;        // node id
  sourceHandle?: string; // for condition nodes: 'true' | 'false'
  label?: string;
  maxIterations?: number; // loop protection (default: 6)
}
```

### 4.5 Backend — Workflow IPC Router

**File:** `src/main/ipc/workflow.ts` (new)

```ts
export const workflowRouter = router({
  list: publicProcedure.query(() => listWorkflows()),
  get: publicProcedure.input(z.object({ id: z.string() })).query(({ input }) => getWorkflow(input.id)),
  upsert: publicProcedure.input(workflowSchema).mutation(({ input }) => upsertWorkflow(input)),
  delete: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => deleteWorkflow(input.id)),
  validate: publicProcedure
    .input(z.object({ graphJson: z.string() }))
    .query(({ input }) => validateWorkflow(JSON.parse(input.graphJson))),
});
```

### 4.6 Backend — Dynamic Graph Builder

**File:** `src/main/orchestrator/workflow-runner.ts` (new)

Core function: `buildDynamicGraph(workflow: WorkflowDefinition, ctx: RunCtx)`

```ts
import { StateGraph, START, END } from '@langchain/langgraph';

export async function runWorkflow(
  taskId: string,
  workflowId: string,
  ctx: RunCtx,
): Promise<TaskResult> {
  const workflow = getWorkflow(workflowId);
  const definition: WorkflowDefinition = JSON.parse(workflow.graphJson);

  // Validate workflow has start + end nodes
  // Build LangGraph StateGraph dynamically:

  const graph = new StateGraph(WorkflowStateAnnotation);

  // For each 'agent' node → add node that runs the referenced agent
  for (const node of definition.nodes) {
    if (node.type === 'agent') {
      graph.addNode(node.id, async (state) => {
        const agent = getAgent(node.data.agentId);
        return runAgentNode(agent, state, ctx);
      });
    } else if (node.type === 'condition') {
      graph.addNode(node.id, (state) => evaluateCondition(node.data, state));
    } else if (node.type === 'approval') {
      graph.addNode(node.id, async (state) => {
        await requestApproval(taskId, 'workflow_gate', node.data, ctx.signal);
        return state;
      });
    }
  }

  // Add edges (with conditional routing for condition nodes)
  for (const edge of definition.edges) {
    const sourceNode = definition.nodes.find(n => n.id === edge.source);
    if (sourceNode?.type === 'condition') {
      // Conditional edge — add to routing map
      graph.addConditionalEdges(edge.source, ...);
    } else if (sourceNode?.type === 'start') {
      graph.addEdge(START, edge.target);
    } else if (edge.target === endNodeId) {
      graph.addEdge(edge.source, END);
    } else {
      graph.addEdge(edge.source, edge.target);
    }
  }

  // Track loop iterations per edge
  // Compile and invoke
  const compiled = graph.compile();
  const result = await compiled.invoke(initialState, { configurable: { runCtx: ctx } });
  return buildTaskResult(result);
}
```

### 4.7 Frontend — Workflow Builder Page

**New page:** `src/renderer/src/pages/Workflows.tsx`

Add to sidebar navigation + router.

#### Layout:

```
┌────────────────────────────────────────────────────────┐
│  Workflows list (left panel)  │  Canvas (center)       │
│                               │                        │
│  [+ New Workflow]             │  ┌─────┐   ┌──────┐   │
│  • Default Loop              │  │Start│──▶│Planner│  │
│  • My Custom Flow            │  └─────┘   └──┬───┘   │
│  • Code Review Workflow      │               │        │
│                               │          ┌───▼───┐    │
│                               │          │Executor│   │
│                               │          └───┬───┘    │
│  ─────────────────────────── │               │        │
│  Node palette (bottom-left)  │          ┌───▼────┐   │
│  [Agent] [Condition]         │          │Condition│  │
│  [Approval] [End]            │          └┬──────┬┘   │
│                               │           │      │    │
│                               │          End   Loop   │
└────────────────────────────────────────────────────────┘
│  Properties panel (right): selected node config        │
└────────────────────────────────────────────────────────┘
```

#### Components:

- **WorkflowList** — CRUD list of saved workflows
- **WorkflowCanvas** — React Flow canvas with custom node types
- **NodePalette** — draggable node types (agent, condition, approval, end)
- **PropertiesPanel** — form for configuring the selected node/edge
  - Agent node → pick agent from dropdown
  - Condition node → field, operator, value inputs
  - Approval node → question text
  - Edge → label, maxIterations (for loop edges)

#### Custom Node Components:

```tsx
// Agent node — shows agent name + model badge
function AgentNode({ data }: NodeProps<AgentNodeData>) { ... }

// Condition node — diamond shape, shows field comparison
function ConditionNode({ data }: NodeProps<ConditionNodeData>) { ... }

// Approval node — shows pause icon + question preview
function ApprovalNode({ data }: NodeProps<ApprovalNodeData>) { ... }

// Start/End nodes — simple circles
function StartNode() { ... }
function EndNode() { ... }
```

### 4.8 Workflow State Annotation

```ts
export const WorkflowStateAnnotation = Annotation.Root({
  prompt: Annotation<string>(),
  currentNodeId: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  history: Annotation<Observation[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  agentOutputs: Annotation<Record<string, unknown>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),
  testReport: Annotation<TestReport | null>({ reducer: (_, n) => n, default: () => null }),
  iteration: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  loopCounts: Annotation<Record<string, number>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),
});
```

### 4.9 Loop Protection

```ts
function makeLoopGuard(edge: WorkflowEdge) {
  const max = edge.maxIterations ?? 6;
  return (state: WorkflowState): string => {
    const count = state.loopCounts[edge.id] ?? 0;
    if (count >= max) return END; // force end
    return edge.target; // allow loop
  };
}
```

### 4.10 Acceptance Criteria

- [ ] Workflows page shows list of saved workflows
- [ ] Can create new workflow, opens blank canvas with Start node
- [ ] Can drag Agent, Condition, Approval, End nodes from palette onto canvas
- [ ] Can draw edges between nodes
- [ ] Properties panel edits selected node/edge configuration
- [ ] Agent nodes reference saved agents from the agents table
- [ ] Condition nodes configure field/operator/value
- [ ] Save persists workflow JSON to DB
- [ ] Workflow appears in task creation's WorkflowPicker
- [ ] Running a task with a workflow executes the dynamic graph correctly
- [ ] Loop protection kicks in at maxIterations per loop edge
- [ ] Workflow validation catches errors (no start, unreachable nodes, missing agent refs)

---

## 5. File-Level Change Summary

### New Files

| File | Purpose |
|------|---------|
| `src/main/ipc/agent.ts` | Agent CRUD router |
| `src/main/ipc/workflow.ts` | Workflow CRUD router |
| `src/main/orchestrator/direct-runner.ts` | Standalone ReAct agent runner |
| `src/main/orchestrator/workflow-runner.ts` | Dynamic graph builder + runner |
| `src/main/orchestrator/workflow-state.ts` | WorkflowStateAnnotation |
| `src/renderer/src/pages/Workflows.tsx` | Workflow builder page |
| `src/renderer/src/components/workflow/WorkflowCanvas.tsx` | React Flow canvas |
| `src/renderer/src/components/workflow/NodePalette.tsx` | Draggable node types |
| `src/renderer/src/components/workflow/PropertiesPanel.tsx` | Node/edge config form |
| `src/renderer/src/components/workflow/nodes/AgentNode.tsx` | Custom agent node |
| `src/renderer/src/components/workflow/nodes/ConditionNode.tsx` | Custom condition node |
| `src/renderer/src/components/workflow/nodes/ApprovalNode.tsx` | Custom approval node |
| `src/renderer/src/components/workflow/nodes/StartEndNode.tsx` | Start/End nodes |
| `src/renderer/src/components/sessions/AdvancedOptions.tsx` | Model/Agent/Workflow picker |
| `src/renderer/src/components/changes/CommitPanel.tsx` | Commit message + buttons |
| `src/renderer/src/components/changes/PrSection.tsx` | PR creation/status UI |
| `src/renderer/src/components/changes/StageButton.tsx` | Stage/unstage file button |
| `src/main/db/migrations/XXXX_agents_v2.sql` | Agent table additions |
| `src/main/db/migrations/XXXX_tasks_v2.sql` | Task table additions |
| `src/main/db/migrations/XXXX_workflows.sql` | Workflows table creation |

### Modified Files

| File | Changes |
|------|---------|
| `src/main/db/schema.ts` | Add new columns to agents, tasks; add workflows table |
| `src/main/ipc/router.ts` | Register agentRouter, workflowRouter |
| `src/main/ipc/session.ts` | Extend task.create input with modelOverride/agentId/workflowId |
| `src/main/ipc/git.ts` | Add stage, unstage, stageAll, commit, push, ghAuthStatus, createPr, prStatus |
| `src/main/services/git.ts` | Add checkGhAuth, createPullRequest, getPrStatus, gitFor export |
| `src/main/orchestrator/runner.ts` | Route to direct-runner or workflow-runner based on task config |
| `src/main/orchestrator/graph.ts` | Accept optional agent param to customize system prompts |
| `src/renderer/src/pages/Agents.tsx` | Full CRUD UI (replace placeholder) |
| `src/renderer/src/pages/Changes.tsx` | Add CommitPanel, PrSection, stage/unstage buttons |
| `src/renderer/src/pages/sessions/SessionDetail.tsx` | Add AdvancedOptions collapsible section |
| `src/renderer/src/components/Sidebar.tsx` | Add Workflows nav item |
| `src/shared/constants.ts` | (no changes needed) |
| `package.json` | Add `@xyflow/react` dependency |

---

## 6. Implementation Phases

### Phase A — Custom Agents CRUD (Est. complexity: Medium)

1. Write DB migration for agents table extensions
2. Implement agent service functions (list, get, upsert, delete)
3. Create `src/main/ipc/agent.ts` router
4. Register in main router
5. Build Agents page UI (list + form)
6. Implement direct-runner for `graphMode: 'direct'`
7. Wire agent injection into existing graph for `graphMode: 'full'`
8. Test: create agent, run task with it in both modes

**Done when:** Can create agents, select them, and tasks run correctly in both full and direct modes.

### Phase B — Task Selection UI (Est. complexity: Low)

1. Write DB migration for tasks table extensions
2. Update `task.create` input schema and `createTask` function
3. Build `AdvancedOptions` component (model + agent pickers)
4. Update `SessionDetail.tsx` to include advanced options
5. Update runner to resolve model/agent from task record
6. Test: create task with override, verify it uses correct config

**Done when:** Task form shows model/agent pickers; running a task with overrides works.

### Phase C — Git Commit + Push + PR (Est. complexity: Medium)

1. Add git service functions (stage, unstage, push, gh auth, create PR, PR status)
2. Add new routes to `gitRouter`
3. Build `CommitPanel` component
4. Build `PrSection` component
5. Add stage/unstage buttons to file list items
6. Integrate components into Changes page
7. Test: full flow (stage → commit → push → create PR)

**Done when:** Can stage files, commit, push, and create a PR from the Changes page.

### Phase D — Workflow Builder (Est. complexity: High)

1. Add `@xyflow/react` dependency
2. Write DB migration for workflows table
3. Implement workflow service + IPC router
4. Build `WorkflowCanvas` with custom node types
5. Build `NodePalette` (drag to add nodes)
6. Build `PropertiesPanel` (configure selected node/edge)
7. Implement save/load workflow JSON
8. Build `workflow-runner.ts` (dynamic graph construction)
9. Wire WorkflowPicker into task creation AdvancedOptions
10. Implement loop protection
11. Implement workflow validation
12. Test: create workflow visually, run task with it, verify execution

**Done when:** Can visually build a workflow, save it, select it for a task, and the task executes the custom graph correctly.

---

## 7. Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| React Flow bundle size | Renderer load time | Lazy-load Workflows page |
| Dynamic graph construction errors | Tasks fail at runtime | Validate workflow JSON before save; dry-run validation endpoint |
| `gh` CLI not installed | PR feature unusable | Graceful detection + install instructions |
| Condition node field paths invalid | Runtime crash | Schema validation + fallback to 'end' on error |
| Loop protection insufficient | Infinite loops | Global task timeout (10min) as ultimate safety net |
| Agent prompt injection via user-defined system prompts | Security | Tools still respect approval gates; sandbox limits still apply |

---

## 8. Open Questions (Deferred)

- Should workflows support parallel/fan-out nodes? (v2)
- Should we support importing/exporting workflows as shareable JSON files? (v2)
- Should the workflow builder have an undo/redo stack? (v2)
- Should agents support multi-turn memory across tasks? (v2)
- Should PR creation support adding reviewers/labels? (v2)

---

_End of plan. Begin with **Phase A — Custom Agents CRUD**._
