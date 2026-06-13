import type { RunnableConfig } from '@langchain/core/runnables';
import { logger } from '../services/logger.js';
import { EXECUTOR_SYSTEM } from './prompts.js';
import { Conversation } from './conversation.js';
import { llmChat } from './llmChat.js';
import { executeToolCalls } from './toolExecution.js';
import { emitStepStarted, emitStepFinished } from './eventEmitter.js';
import { ctxOf } from './runCtx.js';
import type { RunCtx } from './runCtx.js';
import type { AgentState } from './state.js';
import type { Observation } from '@shared/agent';
import { buildPromptContext } from './prompts-context.js';

const log = logger.child({ mod: 'orchestrator' });

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

  const conv = new Conversation({ system: systemPrompt });

  const promptContext = await buildPromptContext(ctx);
  const userMessages = [promptContext, `GOAL: ${state.prompt}`, `PLAN: ${plan}`].join('\n\n');

  conv.addUserMessage(userMessages);

  const newObs: Observation[] = [];
  let budget = EXECUTOR_BUDGET;

  while (budget-- > 0) {
    if (ctx.signal.aborted) throw new Error('aborted');

    const response = await llmChat(ctx, 'executor', conv.getMessages(), temperature);
    if (response.done || !response.toolCalls?.length) break;

    conv.addAssistantMessage(response.text, response.toolCalls);

    const results = await executeToolCalls(ctx, 'executor', response.toolCalls);
    budget -= results.length;

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      const tc = response.toolCalls[i]!;
      conv.addToolResult(tc.id, r.tool, r.ok ? r.output : `ERROR: ${r.error ?? 'unknown error'}`);
      newObs.push({
        tool: r.tool,
        args: r.args,
        ok: r.ok,
        output: r.output,
        error: r.error,
        durationMs: r.durationMs,
      });
    }

    if (results.some((r) => r.ok && r.tool === 'task_complete')) {
      log.info('executor completed task');
      break;
    }

    if (results.some((r) => !r.ok) && budget <= 0) {
      log.warn('executor exhausted budget on failure');
    }
  }

  return newObs;
}

export async function executorNode(
  state: AgentState,
  config?: RunnableConfig,
): Promise<Partial<AgentState>> {
  return runExecutorNode(state, config, EXECUTOR_SYSTEM);
}

export async function runExecutorNode(
  state: AgentState,
  config: RunnableConfig | undefined,
  systemPrompt: string,
  temperature?: number,
): Promise<Partial<AgentState>> {
  const ctx = ctxOf(config);
  const sequece = ctx.stepIdx.n++;
  const { stepId } = emitStepStarted(ctx.taskId, sequece, 'executor');
  try {
    const newObs = await runExecutorLoop(ctx, systemPrompt, state, temperature);
    emitStepFinished(ctx.taskId, stepId, true, { observations: newObs.length });
    return { history: newObs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emitStepFinished(ctx.taskId, stepId, false, null, msg);
    throw err;
  }
}
