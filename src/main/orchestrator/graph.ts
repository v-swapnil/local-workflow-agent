import { StateGraph, START, END } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { platform } from 'node:os';
import { getProvider } from '../services/llm/index.js';
import { PROVIDERS } from '@shared/constants';
import {
  invokeTool,
  listToolsForLLM,
  listReadOnlyToolsForLLM,
  isReadOnlyTool,
} from '../services/tools/registry.js';
import { workspaceStatus, getWorktreeRoot } from '../services/git.js';
import { extractJson } from '../util/json.js';
import { nanoid } from 'nanoid';
import type { ChatMessage, ChatToolDef, ToolCall } from '../services/llm/provider.js';
import { PLANNER_SYSTEM, plannerUser, EXECUTOR_SYSTEM, executorUser } from './prompts.js';
import type { EnvironmentContext } from './prompts.js';
import type { Observation } from '@shared/agent';
import { Conversation } from './conversation.js';
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
  toolCalls: ToolCall[];
  /** Text content of the assistant message (may be empty string). */
  text: string;
  done: false;
}
interface DoneResponse {
  toolCalls?: undefined;
  done: true;
  /** Text content from the final LLM response (used by planner to extract the plan). */
  text: string;
}

/**
 * Send the current conversation messages to the LLM and return either
 * tool calls (with IDs for correlation) or a "done" signal.
 * Replaces the old `llmWithTools()` which rebuilt messages from scratch each call.
 */
async function llmChat(
  ctx: RunCtx,
  agent: string,
  messages: ChatMessage[],
  temperature = 0.2,
  toolsDef?: ChatToolDef[],
): Promise<ToolCallResponse | DoneResponse> {
  const provider = getProvider(PROVIDERS.OLLAMA);
  const tools = toolsDef ?? listToolsForLLM();
  const buf: string[] = [];
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

  // Native tool calls — return them with their IDs.
  if (result.toolCalls?.length) {
    return { toolCalls: result.toolCalls, text, done: false };
  }

  // Fallback: model replied with text — check for {"done": true} signal or
  // a legacy JSON action (backwards-compat for models without tool support).
  try {
    const parsed = extractJson<{
      done?: boolean;
      action?: { tool: string; args: Record<string, unknown> };
    }>(text);
    if (parsed.done) return { done: true, text };
    if (parsed.action) {
      return {
        toolCalls: [{ id: `call_${nanoid(8)}`, name: parsed.action.tool, arguments: parsed.action.args }],
        text,
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
  if (tool) {
    taskBus.emit(ctx.taskId, {
      type: 'tool_call.started',
      taskId: ctx.taskId,
      ts: Date.now(),
      stepId: row.id,
      agent,
      tool,
      input,
    });
  } else {
    taskBus.emit(ctx.taskId, {
      type: 'step.started',
      taskId: ctx.taskId,
      ts: Date.now(),
      stepId: row.id,
      agent,
    });
  }
  return { stepId: row.id };
}

function emitStepFinished(
  ctx: RunCtx,
  stepId: string,
  ok: boolean,
  output: unknown,
  error?: string,
  tool?: string,
): void {
  updateStep(stepId, {
    outputJson: output != null ? JSON.stringify(output) : null,
    status: ok ? 'succeeded' : 'failed',
    finishedAt: Date.now(),
  });
  if (tool) {
    taskBus.emit(ctx.taskId, {
      type: 'tool_call.finished',
      taskId: ctx.taskId,
      ts: Date.now(),
      stepId,
      ok,
      tool,
      output,
      error,
    });
  } else {
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
}

/* ───────── Nodes ───────── */

/** Max read-only tool calls the planner can make while exploring. */
const PLANNER_EXPLORE_BUDGET = 15;

/**
 * Execute a batch of tool calls. Read-only tools run in parallel;
 * write tools run sequentially to avoid conflicts.
 */
async function executeToolCalls(
  ctx: RunCtx,
  agent: string,
  toolCalls: ToolCall[],
): Promise<{ tool: ToolName; args: Record<string, unknown>; ok: boolean; output: string; error?: string; durationMs: number }[]> {
  const invokeOne = async (tc: ToolCall) => {
    const tool = tc.name as ToolName;
    const args = tc.arguments;
    const { stepId } = emitStepStarted(ctx, agent, tool, { args });

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

    emitStepFinished(ctx, stepId, result.ok, result.output ?? null, result.error, tool);

    return {
      tool,
      args: (args ?? {}) as Record<string, unknown>,
      ok: result.ok,
      output: typeof result.output === 'string' ? result.output : JSON.stringify(result.output ?? ''),
      error: result.error,
      durationMs: result.durationMs,
    };
  };

  // If all tool calls are read-only, execute them in parallel
  if (toolCalls.every((tc) => isReadOnlyTool(tc.name))) {
    return Promise.all(toolCalls.map(invokeOne));
  }

  // Otherwise execute sequentially (write tools need ordering)
  const results: Awaited<ReturnType<typeof invokeOne>>[] = [];
  for (const tc of toolCalls) {
    results.push(await invokeOne(tc));
  }
  return results;
}

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
 * Planner exploration loop.
 * Builds a Conversation and appends tool results natively so the LLM can see
 * what it already explored before deciding on the next step.
 * Returns the final markdown plan when the LLM responds with text only.
 */
async function plannerLoop(
  ctx: RunCtx,
  systemPrompt: string,
  userPrompt: string,
  env: EnvironmentContext,
  temperature?: number,
): Promise<string> {
  const readOnlyTools = listReadOnlyToolsForLLM();
  const conv = new Conversation({ system: systemPrompt });
  conv.addUserMessage(plannerUser(userPrompt, env, ctx.sessionMemory));

  let budget = PLANNER_EXPLORE_BUDGET;

  while (budget-- > 0) {
    if (ctx.signal.aborted) throw new Error('aborted');

    const response = await llmChat(ctx, 'planner', conv.getMessages(), temperature, readOnlyTools);

    // LLM responded with text (no tool call) — that's the plan.
    if (response.done) {
      const plan = response.text;
      if (!plan?.trim()) throw new Error('planner returned empty plan');
      return plan;
    }

    // Record assistant message with tool calls, then execute them.
    conv.addAssistantMessage(response.text, response.toolCalls);
    const results = await executeToolCalls(ctx, 'planner', response.toolCalls);
    budget -= results.length;

    // Append each tool result to the conversation so the LLM can see the output.
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      const tc = response.toolCalls[i]!;
      conv.addToolResult(tc.id, r.tool, r.ok ? r.output : `ERROR: ${r.error ?? 'unknown error'}`);
    }
  }

  throw new Error('planner exhausted exploration budget without producing a plan');
}

/** Max tool calls the executor can make in a single pass. */
const EXECUTOR_BUDGET = 30;

/**
 * Shared executor loop logic. Creates a Conversation and drives it to
 * completion, returning accumulated Observations for state/UI display.
 */
async function runExecutorLoop(
  ctx: RunCtx,
  systemPrompt: string,
  state: AgentState,
  temperature?: number,
): Promise<Observation[]> {
  const plan = state.plan;
  if (!plan) throw new Error('executor: no plan in state');

  const env = await gatherEnvContext(ctx);
  const conv = new Conversation({ system: systemPrompt });
  conv.addUserMessage(executorUser(state.prompt, plan, env, ctx.sessionMemory));

  const newObs: Observation[] = [];
  let budget = EXECUTOR_BUDGET;

  while (budget-- > 0) {
    if (ctx.signal.aborted) throw new Error('aborted');

    const response = await llmChat(ctx, 'executor', conv.getMessages(), temperature);
    if (response.done || !response.toolCalls?.length) break;

    // Append assistant message (with tool calls) to conversation.
    conv.addAssistantMessage(response.text, response.toolCalls);

    const results = await executeToolCalls(ctx, 'executor', response.toolCalls);
    budget -= results.length;

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      const tc = response.toolCalls[i]!;
      // Append tool result to conversation (native multi-turn).
      conv.addToolResult(tc.id, r.tool, r.ok ? r.output : `ERROR: ${r.error ?? 'unknown error'}`);
      // Also collect in Observation[] for state/UI display.
      newObs.push({
        tool: r.tool,
        args: r.args,
        ok: r.ok,
        output: r.output,
        error: r.error,
        durationMs: r.durationMs,
      });
    }

    if (results.some((r) => !r.ok) && budget <= 0) {
      log.warn('executor exhausted budget on failure');
    }
  }

  return newObs;
}

async function executorNode(
  state: AgentState,
  config?: RunnableConfig,
): Promise<Partial<AgentState>> {
  const ctx = ctxOf(config);
  const newObs = await runExecutorLoop(ctx, EXECUTOR_SYSTEM, state);
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
    const newObs = await runExecutorLoop(ctx, executorSys, state, temp);
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
