import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { platform } from 'node:os';
import { getProvider } from '../services/llm/index.js';
import { invokeTool, listToolsForLLM } from '../services/tools/registry.js';
import { hasTestsConfigured } from '../services/tools/shell.js';
import { fileTree } from '../services/workspaces.js';
import { skillCatalog, resolveSkillBodies } from '../services/skills.js';
import { workspaceStatus } from '../services/git.js';
import { extractJson } from '../util/json.js';
import { readdir } from 'node:fs/promises';
import type { ChatMessage, ToolCallResult } from '../services/llm/provider.js';
import {
  PLANNER_SYSTEM,
  plannerUser,
  EXECUTOR_SYSTEM,
  executorUser,
  CRITIC_SYSTEM,
  criticUser,
} from './prompts.js';
import type { EnvironmentContext } from './prompts.js';
import type {
  Plan,
  Observation,
  TestReport,
  Verdict,
} from '@shared/agent';
import type { ToolName } from '../services/tools/types.js';
import { addStep, updateStep, updateTask } from '../services/store.js';
import { taskBus } from '../services/events.js';
import { logger } from '../services/logger.js';

const log = logger.child({ mod: 'orchestrator' });

/* ───────── Run context (passed via RunnableConfig.configurable) ───────── */

export interface RunCtx {
  taskId: string;
  workspaceId: string;
  workspacePath: string;
  model: string;
  signal: AbortSignal;
  /** Monotonic step index counter, mutated as we add steps. */
  stepIdx: { n: number };
  /** Hint surfaced by the critic when looping back. */
  hint?: string;
}

function ctxOf(config?: RunnableConfig): RunCtx {
  const c = config?.configurable?.runCtx as RunCtx | undefined;
  if (!c) throw new Error('orchestrator: missing runCtx in config');
  return c;
}

/* ───────── State ───────── */

const StateAnnotation = Annotation.Root({
  prompt: Annotation<string>(),
  plan: Annotation<Plan | null>({ reducer: (_, n) => n, default: () => null }),
  history: Annotation<Observation[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  iteration: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  maxIterations: Annotation<number>({ reducer: (_, n) => n, default: () => 6 }),
  testsConfigured: Annotation<boolean>({ reducer: (_, n) => n, default: () => false }),
  testReport: Annotation<TestReport | null>({
    reducer: (_, n) => n,
    default: () => null,
  }),
  verdict: Annotation<Verdict | null>({ reducer: (_, n) => n, default: () => null }),
});

export type AgentState = typeof StateAnnotation.State;

/* ───────── Helpers ───────── */

async function llmJson<T>(
  ctx: RunCtx,
  agent: string,
  system: string,
  user: string,
  temperature = 0.2,
): Promise<T> {
  const provider = getProvider('ollama');
  const buf: string[] = [];
  const t0 = Date.now();
  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
  const result = await provider.chat({
    model: ctx.model,
    temperature,
    signal: ctx.signal,
    messages,
    onDelta: (d) => {
      buf.push(d);
      taskBus.emit(ctx.taskId, {
        type: 'llm.delta',
        taskId: ctx.taskId,
        ts: Date.now(),
        agent,
        content: d,
      });
    },
  });
  const text = result.content || buf.join('');

  // Persist full request + response for conversation history inspection
  taskBus.emit(ctx.taskId, {
    type: 'llm.call',
    taskId: ctx.taskId,
    ts: Date.now(),
    agent,
    model: ctx.model,
    messages,
    response: text.slice(0, 100_000),
    durationMs: Date.now() - t0,
  });

  return extractJson<T>(text);
}

interface ToolCallResponse {
  toolCalls: ToolCallResult[];
  done: false;
}
interface DoneResponse {
  toolCalls?: undefined;
  done: true;
}

/**
 * LLM call with native Ollama tool calling.
 * Returns either the first tool call from the model or a "done" signal
 * (model replied with text containing `{"done": true}` or no tool calls).
 */
async function llmWithTools(
  ctx: RunCtx,
  agent: string,
  system: string,
  user: string,
  temperature = 0.2,
): Promise<ToolCallResponse | DoneResponse> {
  const provider = getProvider('ollama');
  const tools = listToolsForLLM();
  const buf: string[] = [];
  const t0 = Date.now();
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  const result = await provider.chat({
    model: ctx.model,
    temperature,
    signal: ctx.signal,
    messages,
    tools,
    onDelta: (d) => {
      buf.push(d);
      taskBus.emit(ctx.taskId, {
        type: 'llm.delta',
        taskId: ctx.taskId,
        ts: Date.now(),
        agent,
        content: d,
      });
    },
  });
  const text = result.content || buf.join('');

  taskBus.emit(ctx.taskId, {
    type: 'llm.call',
    taskId: ctx.taskId,
    ts: Date.now(),
    agent,
    model: ctx.model,
    messages,
    response: text.slice(0, 100_000),
    durationMs: Date.now() - t0,
  });

  // If the model returned native tool calls, use them.
  if (result.toolCalls?.length) {
    return { toolCalls: result.toolCalls, done: false };
  }

  // Fallback: model replied with text — check for {"done": true} signal or
  // try to parse a legacy JSON action (backwards-compat for models without tool support).
  try {
    const parsed = extractJson<{ done?: boolean; action?: { tool: string; args: Record<string, unknown> } }>(text);
    if (parsed.done) return { done: true };
    if (parsed.action) {
      return {
        toolCalls: [{ name: parsed.action.tool, arguments: parsed.action.args }],
        done: false,
      };
    }
  } catch { /* not valid JSON, treat as done */ }

  return { done: true };
}

async function gatherEnvContext(ctx: RunCtx): Promise<EnvironmentContext> {
  let git: EnvironmentContext['git'] = {
    isRepo: false,
    branch: null,
    clean: true,
    staged: [],
    modified: [],
    untracked: [],
  };
  try {
    const status = await workspaceStatus(ctx.workspaceId);
    git = {
      isRepo: status.isRepo,
      branch: status.branch,
      clean: status.clean,
      staged: status.staged,
      modified: status.modified,
      untracked: status.not_added,
    };
  } catch {
    // git info is best-effort; swallow errors
  }
  return {
    os: platform(),
    shell: process.env.SHELL ?? null,
    nodeVersion: process.version,
    workspacePath: ctx.workspacePath,
    model: ctx.model,
    git,
  };
}

async function workspaceSummary(workspaceId: string, workspacePath: string): Promise<string> {
  try {
    const tree = await fileTree(workspaceId, '', 2);
    return JSON.stringify(tree).slice(0, 2000);
  } catch {
    try {
      const entries = await readdir(workspacePath, { withFileTypes: true });
      return entries
        .filter((e) => !e.name.startsWith('.'))
        .map((e) => `${e.name}${e.isDirectory() ? '/' : ''}`)
        .join('\n')
        .slice(0, 1500);
    } catch {
      return `(empty workspace at ${workspacePath})`;
    }
  }
}

function emitStepStarted(
  ctx: RunCtx,
  agent: string,
  tool?: ToolName,
  input?: unknown,
): { stepId: string } {
  const idx = ctx.stepIdx.n++;
  const row = addStep({
    taskId: ctx.taskId,
    idx,
    agent,
    tool: tool ?? null,
    inputJson: input != null ? JSON.stringify(input).slice(0, 100_000) : null,
    outputJson: null,
    status: 'running',
    startedAt: Date.now(),
    finishedAt: null,
  });
  taskBus.emit(ctx.taskId, {
    type: 'step.started',
    taskId: ctx.taskId,
    ts: Date.now(),
    stepId: row.id,
    agent,
    tool,
    input,
  });
  return { stepId: row.id };
}

function emitStepFinished(
  ctx: RunCtx,
  stepId: string,
  ok: boolean,
  output: unknown,
  error?: string,
): void {
  updateStep(stepId, {
    outputJson: output != null ? JSON.stringify(output).slice(0, 100_000) : null,
    status: ok ? 'succeeded' : 'failed',
    finishedAt: Date.now(),
  });
  taskBus.emit(ctx.taskId, {
    type: 'step.finished',
    taskId: ctx.taskId,
    ts: Date.now(),
    stepId,
    ok,
    output,
    error,
  });
}

/* ───────── Nodes ───────── */

async function plannerNode(
  state: AgentState,
  config?: RunnableConfig,
): Promise<Partial<AgentState>> {
  const ctx = ctxOf(config);
  const { stepId } = emitStepStarted(ctx, 'planner', undefined, { prompt: state.prompt });
  try {
    const summary = await workspaceSummary(ctx.workspaceId, ctx.workspacePath);
    const catalog = await skillCatalog();
    const env = await gatherEnvContext(ctx);
    const plan = await llmJson<Plan>(
      ctx,
      'planner',
      PLANNER_SYSTEM,
      plannerUser(state.prompt, summary, catalog, env),
    );
    if (!plan?.steps?.length) throw new Error('planner returned empty plan');
    plan.steps = plan.steps.map((s, i) => ({
      ...s,
      id: s.id || `s${i + 1}`,
    }));
    // Filter selectedSkills to only those that actually exist + are enabled.
    const validNames = new Set(catalog.map((c) => c.name));
    const raw = (plan as Plan & { selected_skills?: string[] }).selected_skills
      ?? plan.selectedSkills
      ?? [];
    plan.selectedSkills = raw.filter((n) => validNames.has(n));
    updateTask(ctx.taskId, { planJson: JSON.stringify(plan).slice(0, 100_000) });
    emitStepFinished(ctx, stepId, true, plan);
    taskBus.emit(ctx.taskId, { type: 'plan', taskId: ctx.taskId, ts: Date.now(), plan });
    return { plan };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emitStepFinished(ctx, stepId, false, null, msg);
    throw err;
  }
}

const EXECUTOR_BUDGET_PER_STEP = 6;

async function executorNode(
  state: AgentState,
  config?: RunnableConfig,
): Promise<Partial<AgentState>> {
  const ctx = ctxOf(config);
  const plan = state.plan;
  if (!plan) throw new Error('executor: no plan in state');

  const newObs: Observation[] = [];
  const hint = ctx.hint;
  ctx.hint = undefined;

  const skills = await resolveSkillBodies(plan.selectedSkills ?? []);
  const env = await gatherEnvContext(ctx);
  const testsConfigured = await hasTestsConfigured(ctx.workspacePath);

  for (const planStep of plan.steps) {
    let stepBudget = EXECUTOR_BUDGET_PER_STEP;
    let stepHint = hint;
    while (stepBudget-- > 0) {
      if (ctx.signal.aborted) throw new Error('aborted');

      const histForLLM = state.history.concat(newObs).filter((o) => o.stepId === planStep.id || true);
      const response = await llmWithTools(
        ctx,
        'executor',
        EXECUTOR_SYSTEM,
        executorUser(state.prompt, plan, planStep.id, histForLLM, skills, env, stepHint),
      );
      stepHint = undefined;

      if (response.done || !response.toolCalls?.length) break;

      const tc = response.toolCalls[0]!;
      const tool = tc.name as ToolName;
      const args = tc.arguments;
      const { stepId } = emitStepStarted(ctx, 'executor', tool, { planStepId: planStep.id, args });

      const result = await invokeTool(tool, args, {
        workspaceId: ctx.workspaceId,
        taskId: ctx.taskId,
        signal: ctx.signal,
        onLog: ({ stream, text }) => {
          taskBus.emit(ctx.taskId, {
            type: 'log',
            taskId: ctx.taskId,
            ts: Date.now(),
            stream,
            text,
            stepId,
          });
        },
      });

      const outStr = safeStr(result.ok ? result.output : null);
      emitStepFinished(ctx, stepId, result.ok, result.output ?? null, result.error);

      const obs: Observation = {
        stepId: planStep.id,
        tool,
        args: (args ?? {}) as Record<string, unknown>,
        ok: result.ok,
        output: outStr,
        error: result.error,
        durationMs: result.durationMs,
      };
      newObs.push(obs);

      // If the tool failed, surface to the LLM next round; let it self-correct.
      if (!result.ok && stepBudget === 0) {
        log.warn({ tool, error: result.error }, 'executor exhausted step budget on failure');
      }
    }
  }

  return { history: newObs, testsConfigured };
}

async function testerNode(
  state: AgentState,
  config?: RunnableConfig,
): Promise<Partial<AgentState>> {
  const ctx = ctxOf(config);
  const { stepId } = emitStepStarted(ctx, 'tester', 'run_tests', {});
  const logBuf: string[] = [];
  const result = await invokeTool(
    'run_tests',
    {},
    {
      workspaceId: ctx.workspaceId,
      taskId: ctx.taskId,
      signal: ctx.signal,
      onLog: ({ stream, text }) => {
        logBuf.push(text);
        taskBus.emit(ctx.taskId, {
          type: 'log',
          taskId: ctx.taskId,
          ts: Date.now(),
          stream,
          text,
          stepId,
        });
      },
    },
  );

  let report: TestReport;
  if (!result.ok) {
    report = {
      ran: false,
      ok: false,
      log: logBuf.join('').slice(-4000),
      error: result.error,
    };
  } else {
    const out = result.output as {
      exitCode: number;
      stdout: string;
      stderr: string;
      durationMs: number;
      detected?: string;
    };
    report = {
      ran: true,
      ok: out.exitCode === 0,
      detected: out.detected,
      exitCode: out.exitCode,
      durationMs: out.durationMs,
      log: (out.stdout + out.stderr).slice(-4000),
    };
  }

  emitStepFinished(ctx, stepId, report.ok, report);
  return { testReport: report };
}

async function criticNode(
  state: AgentState,
  config?: RunnableConfig,
): Promise<Partial<AgentState>> {
  const ctx = ctxOf(config);
  const { stepId } = emitStepStarted(ctx, 'critic', undefined, {
    iteration: state.iteration,
  });
  try {
    const testReport = state.testReport ?? {
      ran: false,
      ok: true,
      log: 'tests skipped: no test setup detected',
    };
    const verdict = await llmJson<Verdict>(
      ctx,
      'critic',
      CRITIC_SYSTEM,
      criticUser(state.prompt, state.plan!, state.history, testReport),
    );
    emitStepFinished(ctx, stepId, true, verdict);
    taskBus.emit(ctx.taskId, {
      type: 'critic',
      taskId: ctx.taskId,
      ts: Date.now(),
      verdict,
    });
    if (!verdict.done && verdict.nextHint) ctx.hint = verdict.nextHint;
    return { verdict, iteration: state.iteration + 1 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emitStepFinished(ctx, stepId, false, null, msg);
    // Don't throw — treat parse failure as "not done, retry" if we have budget.
    const fallback: Verdict = { done: false, reason: `critic parse failed: ${msg}` };
    return { verdict: fallback, iteration: state.iteration + 1 };
  }
}

function routeAfterCritic(state: AgentState): 'executor' | typeof END {
  if (state.verdict?.done) return END;
  if (state.iteration >= state.maxIterations) return END;
  return 'executor';
}

function routeAfterExecutor(state: AgentState): 'tester' | 'critic' {
  return state.testsConfigured ? 'tester' : 'critic';
}

/* ───────── Graph factory ───────── */

export function buildGraph() {
  return new StateGraph(StateAnnotation)
    .addNode('planner', plannerNode)
    .addNode('executor', executorNode)
    .addNode('tester', testerNode)
    .addNode('critic', criticNode)
    .addEdge(START, 'planner')
    .addEdge('planner', 'executor')
    .addConditionalEdges('executor', routeAfterExecutor, {
      tester: 'tester',
      critic: 'critic',
    })
    .addEdge('tester', 'critic')
    .addConditionalEdges('critic', routeAfterCritic, {
      executor: 'executor',
      [END]: END,
    })
    .compile();
}

/* ───────── Misc ───────── */

function safeStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.slice(0, 4000);
  try {
    return JSON.stringify(v).slice(0, 4000);
  } catch {
    return String(v).slice(0, 4000);
  }
}
