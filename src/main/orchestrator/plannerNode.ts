import type { RunnableConfig } from '@langchain/core/runnables';
import { listReadOnlyToolsForLLM } from '../services/tools/registry.js';
import { updateTask } from '../services/store.js';
import { PLANNER_SYSTEM, plannerUser } from './prompts.js';
import { Conversation } from './conversation.js';
import { llmChat, gatherEnvContext } from './llmChat.js';
import { executeToolCalls } from './toolExecution.js';
import { emitStepStarted, emitStepFinished } from './eventEmitter.js';
import { ctxOf } from './runCtx.js';
import type { RunCtx } from './runCtx.js';
import type { EnvironmentContext } from './prompts.js';
import type { AgentState } from './state.js';

/** Max read-only tool calls the planner can make while exploring. */
const PLANNER_EXPLORE_BUDGET = 15;

/**
 * Planner exploration loop.
 * Builds a Conversation and appends tool results natively so the LLM can see
 * what it already explored before deciding on the next step.
 * Returns the final markdown plan when the LLM responds with text only.
 */
export async function plannerLoop(
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

    const messages = conv.getMessages();
    const response = await llmChat(ctx, 'planner', messages, temperature, readOnlyTools);

    if (response.done) {
      const plan = response.text;
      if (!plan?.trim()) throw new Error('planner returned empty plan');
      return plan;
    }

    conv.addAssistantMessage(response.text, response.toolCalls);
    const results = await executeToolCalls(ctx, 'planner', response.toolCalls);
    budget -= results.length;

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      const tc = response.toolCalls[i]!;
      conv.addToolResult(tc.id, r.tool, r.ok ? r.output : `ERROR: ${r.error ?? 'unknown error'}`);
    }
  }

  throw new Error('planner exhausted exploration budget without producing a plan');
}

export async function plannerNode(
  state: AgentState,
  config?: RunnableConfig,
): Promise<Partial<AgentState>> {
  return runPlannerNode(state, config, PLANNER_SYSTEM);
}

export async function runPlannerNode(
  state: AgentState,
  config: RunnableConfig | undefined,
  systemPrompt: string,
  temperature?: number,
): Promise<Partial<AgentState>> {
  const ctx = ctxOf(config);
  const sequence = ctx.stepIdx.n++;
  const { stepId } = emitStepStarted(ctx.taskId, sequence, 'planner');
  try {
    const env = await gatherEnvContext(ctx);
    const plan = await plannerLoop(ctx, systemPrompt, state.prompt, env, temperature);
    updateTask(ctx.taskId, { plan });
    emitStepFinished(ctx.taskId, stepId, true, { plan });
    return { plan };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emitStepFinished(ctx.taskId, stepId, false, null, msg);
    throw err;
  }
}
