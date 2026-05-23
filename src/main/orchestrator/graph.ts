import { StateGraph, START, END } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { platform } from 'node:os';
import { getProvider } from '../services/llm/index.js';
import { PROVIDERS } from '@shared/constants';
import {
  invokeTool,
  listToolsForLLM,
  listReadOnlyToolsForLLM,
} from '../services/tools/registry.js';
import { workspaceStatus, getWorktreeRoot } from '../services/git.js';
import { extractJson } from '../util/json.js';
import type { ChatMessage, ChatToolDef, ToolCallResult } from '../services/llm/provider.js';
import { PLANNER_SYSTEM, plannerUser, EXECUTOR_SYSTEM, executorUser } from './prompts.js';
import type { EnvironmentContext } from './prompts.js';
import type { Observation } from '@shared/agent';
import type { ToolName } from '../services/tools/types.js';
import { addStep, updateStep, updateTask } from '../services/store.js';
import { taskBus } from '../services/events.js';
import { logger } from '../services/logger.js';
import { AgentState, StateAnnotation } from './state.js';
import type { AgentRecord } from '../services/agents.js';

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
  /** Persisted session memory included in all task prompts. */
  sessionMemory?: string | null;
}

function ctxOf(config?: RunnableConfig): RunCtx {
  const c = config?.configurable?.runCtx as RunCtx | undefined;
  if (!c) throw new Error('orchestrator: missing runCtx in config');
  return c;
}

/* ───────── Helpers ───────── */

interface ToolCallResponse {
  toolCalls: ToolCallResult[];
  done: false;
}
interface DoneResponse {
  toolCalls?: undefined;
  done: true;
  /** Text content from the final LLM response (used by planner to extract the plan). */
  text: string;
}

/**
 * LLM call with native Ollama tool calling.
 * Returns either the first tool call from the model or a "done" signal
 * (model replied with text containing `{"done": true}` or no tool calls).
 * Optionally accepts a custom tools list (defaults to all tools).
 */
async function llmWithTools(
  ctx: RunCtx,
  agent: string,
  system: string,
  user: string,
  temperature = 0.2,
  toolsDef?: ChatToolDef[],
): Promise<ToolCallResponse | DoneResponse> {
  const provider = getProvider(PROVIDERS.OLLAMA);
  const tools = toolsDef ?? listToolsForLLM();
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
    onThinkingDelta: (d) => {
      taskBus.emit(ctx.taskId, {
        type: 'llm.thinking_delta',
        taskId: ctx.taskId,
        ts: Date.now(),
        agent,
        content: d,
      });
    },
  });
  const text = result.content || buf.join('');

  // If the model returned native tool calls, use them.
  if (result.toolCalls?.length) {
    return { toolCalls: result.toolCalls, done: false };
  }

  // Fallback: model replied with text — check for {"done": true} signal or
  // try to parse a legacy JSON action (backwards-compat for models without tool support).
  try {
    const parsed = extractJson<{
      done?: boolean;
      action?: { tool: string; args: Record<string, unknown> };
    }>(text);
    if (parsed.done) return { done: true, text };
    if (parsed.action) {
      return {
        toolCalls: [{ name: parsed.action.tool, arguments: parsed.action.args }],
        done: false,
      };
    }
  } catch {
    /* not valid JSON, treat as done */
  }

  return { done: true, text };
}

async function gatherEnvContext(ctx: RunCtx): Promise<EnvironmentContext> {
  let isGitRepo = false;
  let worktree = ctx.workspacePath;
  let branch: string | null = null;
  let changedFiles: string[] = [];
  try {
    const status = await workspaceStatus(ctx.workspaceId);
    isGitRepo = status.isRepo;
    if (isGitRepo) {
      const root = await getWorktreeRoot(ctx.workspacePath);
      if (root) worktree = root;
      branch = status.branch;
      changedFiles = [
        ...status.staged.map((f) => `staged: ${f}`),
        ...status.modified.map((f) => `modified: ${f}`),
        ...status.not_added.map((f) => `untracked: ${f}`),
      ];
    }
  } catch {
    // git info is best-effort; swallow errors
  }
  return {
    directory: ctx.workspacePath,
    worktree,
    isGitRepo,
    platform: platform(),
    shell: process.env.SHELL ?? null,
    model: ctx.model,
    git: { branch, changedFiles },
  };
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
    inputJson: input != null ? JSON.stringify(input) : null,
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
    outputJson: output != null ? JSON.stringify(output) : null,
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

/** Max read-only tool calls the planner can make while exploring. */
const PLANNER_EXPLORE_BUDGET = 15;

async function plannerNode(
  state: AgentState,
  config?: RunnableConfig,
): Promise<Partial<AgentState>> {
  const ctx = ctxOf(config);
  const { stepId } = emitStepStarted(ctx, 'planner', undefined, { prompt: state.prompt });
  try {
    const env = await gatherEnvContext(ctx);
    const plan = await plannerLoop(ctx, PLANNER_SYSTEM, state.prompt, env);
    updateTask(ctx.taskId, { plan });
    emitStepFinished(ctx, stepId, true, { plan });
    taskBus.emit(ctx.taskId, { type: 'plan', taskId: ctx.taskId, ts: Date.now(), plan });
    return { plan };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emitStepFinished(ctx, stepId, false, null, msg);
    throw err;
  }
}

/**
 * Planner exploration loop: calls read-only tools to inspect the codebase,
 * then returns the final markdown plan when the LLM responds with text.
 */
async function plannerLoop(
  ctx: RunCtx,
  systemPrompt: string,
  userPrompt: string,
  env: EnvironmentContext,
  temperature?: number,
): Promise<string> {
  const readOnlyTools = listReadOnlyToolsForLLM();
  const user = plannerUser(userPrompt, env, ctx.sessionMemory);
  let budget = PLANNER_EXPLORE_BUDGET;

  while (budget-- > 0) {
    if (ctx.signal.aborted) throw new Error('aborted');

    const response = await llmWithTools(
      ctx,
      'planner',
      systemPrompt,
      user,
      temperature,
      readOnlyTools,
    );

    // LLM responded with text (no tool call) — that's the plan.
    if (response.done) {
      const plan = response.text;
      if (!plan?.trim()) throw new Error('planner returned empty plan');
      return plan;
    }

    // Execute the read-only tool call
    const tc = response.toolCalls[0]!;
    const tool = tc.name as ToolName;
    const args = tc.arguments;
    const { stepId } = emitStepStarted(ctx, 'planner', tool, { args });

    const result = await invokeTool(tool, args, {
      workspaceId: ctx.workspaceId,
      workspacePath: ctx.workspacePath,
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

    emitStepFinished(ctx, stepId, result.ok, result.output ?? null, result.error);
  }

  throw new Error('planner exhausted exploration budget without producing a plan');
}

/** Max tool calls the executor can make in a single pass. */
const EXECUTOR_BUDGET = 30;

async function executorNode(
  state: AgentState,
  config?: RunnableConfig,
): Promise<Partial<AgentState>> {
  const ctx = ctxOf(config);
  const plan = state.plan;
  if (!plan) throw new Error('executor: no plan in state');

  const newObs: Observation[] = [];

  const env = await gatherEnvContext(ctx);

  let budget = EXECUTOR_BUDGET;
  while (budget-- > 0) {
    if (ctx.signal.aborted) throw new Error('aborted');

    const histForLLM = state.history.concat(newObs);
    const response = await llmWithTools(
      ctx,
      'executor',
      EXECUTOR_SYSTEM,
      executorUser(state.prompt, plan, histForLLM, env, ctx.sessionMemory),
    );

    if (response.done || !response.toolCalls?.length) break;

    const tc = response.toolCalls[0]!;
    const tool = tc.name as ToolName;
    const args = tc.arguments;
    const { stepId } = emitStepStarted(ctx, 'executor', tool, { args });

    const result = await invokeTool(tool, args, {
      workspaceId: ctx.workspaceId,
      workspacePath: ctx.workspacePath,
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

    emitStepFinished(ctx, stepId, result.ok, result.output ?? null, result.error);

    const obs: Observation = {
      tool,
      args: (args ?? {}) as Record<string, unknown>,
      ok: result.ok,
      output: typeof result.output === 'string' ? result.output : JSON.stringify(result.output ?? ''),
      error: result.error,
      durationMs: result.durationMs,
    };
    newObs.push(obs);

    if (!result.ok && budget === 0) {
      log.warn({ tool, error: result.error }, 'executor exhausted budget on failure');
    }
  }

  return { history: newObs };
}

/* ───────── Graph factory ───────── */

export function buildGraph(agent?: AgentRecord | null) {
  // When a 'full' agent is provided, prepend its system prompt to planner + executor
  const plannerSys = agent?.systemPrompt
    ? `${agent.systemPrompt}\n\n---\n\n${PLANNER_SYSTEM}`
    : PLANNER_SYSTEM;
  const executorSys = agent?.systemPrompt
    ? `${agent.systemPrompt}\n\n---\n\n${EXECUTOR_SYSTEM}`
    : EXECUTOR_SYSTEM;
  const temp = agent?.temperature;

  // Closure-captured overrides used in node functions
  const plannerNodeWithAgent = async (
    state: AgentState,
    config?: RunnableConfig,
  ): Promise<Partial<AgentState>> => {
    const ctx = ctxOf(config);
    const { stepId } = emitStepStarted(ctx, 'planner', undefined, { prompt: state.prompt });
    try {
      const env = await gatherEnvContext(ctx);
      const plan = await plannerLoop(ctx, plannerSys, state.prompt, env, temp);
      updateTask(ctx.taskId, { plan });
      emitStepFinished(ctx, stepId, true, { plan });
      taskBus.emit(ctx.taskId, { type: 'plan', taskId: ctx.taskId, ts: Date.now(), plan });
      return { plan };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emitStepFinished(ctx, stepId, false, null, msg);
      throw err;
    }
  };

  const executorNodeWithAgent = async (
    state: AgentState,
    config?: RunnableConfig,
  ): Promise<Partial<AgentState>> => {
    const ctx = ctxOf(config);
    const plan = state.plan;
    if (!plan) throw new Error('executor: no plan in state');

    const newObs: Observation[] = [];

    const env = await gatherEnvContext(ctx);

    let budget = EXECUTOR_BUDGET;
    while (budget-- > 0) {
      if (ctx.signal.aborted) throw new Error('aborted');

      const histForLLM = state.history.concat(newObs);
      const response = await llmWithTools(
        ctx,
        'executor',
        executorSys,
        executorUser(state.prompt, plan, histForLLM, env, ctx.sessionMemory),
        temp,
      );

      if (response.done || !response.toolCalls?.length) break;

      const tc = response.toolCalls[0]!;
      const tool = tc.name as ToolName;
      const args = tc.arguments;
      const { stepId } = emitStepStarted(ctx, 'executor', tool, { args });

      const result = await invokeTool(tool, args, {
        workspaceId: ctx.workspaceId,
        workspacePath: ctx.workspacePath,
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

      emitStepFinished(ctx, stepId, result.ok, result.output ?? null, result.error);

      const obs: Observation = {
        tool,
        args: (args ?? {}) as Record<string, unknown>,
        ok: result.ok,
        output: typeof result.output === 'string' ? result.output : JSON.stringify(result.output ?? ''),
        error: result.error,
        durationMs: result.durationMs,
      };
      newObs.push(obs);
    }

    return { history: newObs };
  };

  return new StateGraph(StateAnnotation)
    .addNode('planner', agent ? plannerNodeWithAgent : plannerNode)
    .addNode('executor', agent ? executorNodeWithAgent : executorNode)
    .addEdge(START, 'planner')
    .addEdge('planner', 'executor')
    .addEdge('executor', END)
    .compile();
}


