import type { RunnableConfig } from '@langchain/core/runnables';
import { logger } from '../services/logger.js';
import { EXECUTOR_SYSTEM } from './prompts.js';
import { Conversation } from './conversation.js';
import { llmChat } from './llmChat.js';
import { executeToolCalls } from './toolExecution.js';
import { emitStepStarted, emitStepFinished } from './eventEmitter.js';
import { ctxOf } from './runCtx.js';
import { getAgentOrNull } from '../services/agents.js';
import type { RunCtx } from './runCtx.js';
import type { AgentState } from './state.js';
import type { Observation } from '@shared/agent';
import { buildPromptContext } from './prompts-context.js';

const log = logger.child({ mod: 'orchestrator' });

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

  while (true) {
    if (ctx.signal.aborted) throw new Error('aborted');

    const response = await llmChat(ctx, 'executor', conv.getMessages(), temperature);
    if (response.done || !response.toolCalls?.length) break;

    conv.addAssistantMessage(response.text, response.toolCalls);

    const results = await executeToolCalls(ctx, 'executor', response.toolCalls);

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
  }

  return newObs;
}

export async function executorNode(
  state: AgentState,
  config?: RunnableConfig,
): Promise<Partial<AgentState>> {
  const ctx = ctxOf(config);
  const agent = ctx.agentId ? getAgentOrNull(ctx.agentId) : null;

  let systemPrompt = EXECUTOR_SYSTEM;
  let temperature: number | undefined;

  if (agent) {
    systemPrompt = [EXECUTOR_SYSTEM, '---', agent.systemPrompt].join('\n\n');
    temperature = agent.temperature;
  }

  const sequence = ctx.stepIdx.n++;
  const { stepId } = emitStepStarted(ctx.taskId, sequence, 'executor');
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
