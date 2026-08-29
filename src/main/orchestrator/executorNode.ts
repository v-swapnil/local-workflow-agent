import type { RunnableConfig } from '@langchain/core/runnables';
import { logger } from '../services/logger.js';
import { EXECUTOR_SYSTEM } from './prompts.js';
import { Conversation } from './conversation.js';
import { llmChat } from './llmChat.js';
import { executeToolCalls } from './toolExecution.js';
import { emitStepStarted, emitStepFinished } from './eventEmitter.js';
import { ctxOf } from './runCtx.js';
import { getAgentOrNull } from '../services/agents.js';
import { addMessage } from '../services/store.js';
import type { RunCtx } from './runCtx.js';
import type { AgentState } from './state.js';
import type { Observation } from '@shared/agent';
import { buildPromptContext } from './prompts-context.js';

const log = logger.child({ mod: 'orchestrator' });

/**
 * Shared executor loop logic. Creates a Conversation and drives it to
 * completion, returning accumulated Observations for state/UI display.
 * The agent analyzes the codebase itself — no pre-made plan is provided.
 */
async function runExecutorLoop(
  ctx: RunCtx,
  systemPrompt: string,
  state: AgentState,
  temperature?: number,
): Promise<Observation[]> {
  const conv = new Conversation({ system: systemPrompt });

  const promptContext = await buildPromptContext(ctx);
  const goalLine = `**GOAL**: ${state.prompt}`;
  conv.addUserMessage([promptContext, goalLine].join('\n'));

  const newObs: Observation[] = [];

  while (true) {
    if (ctx.signal.aborted) throw new Error('aborted');

    const response = await llmChat(ctx, conv.getMessages(), temperature);

    const assistantMessage = addMessage(
      ctx.taskId,
      'assistant',
      response.text,
      response.thinking ?? null,
    );

    if (response.done || !response.toolCalls?.length) break;

    conv.addAssistantMessage(response.text, response.thinking, response.toolCalls);

    const results = await executeToolCalls(ctx, assistantMessage.id, response.toolCalls);

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      const tc = response.toolCalls[i]!;
      conv.addToolResult(tc.id, r.toolName, r.content);
      newObs.push({
        tool: r.toolName,
        args: r.arguments,
        ok: r.status === 'success',
        output: r.content,
        durationMs: r.duration,
      });
    }

    if (results.some((r) => r.status === 'success' && r.toolName === 'task_complete')) {
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
    systemPrompt = [EXECUTOR_SYSTEM, '---', agent.systemPrompt].join('\n');
    temperature = agent.temperature;
  }

  try {
    emitStepStarted(ctx.taskId, ctx.agentId || 'executor');
    const newObs = await runExecutorLoop(ctx, systemPrompt, state, temperature);
    emitStepFinished(ctx.taskId, ctx.agentId || 'executor', 'succeeded');
    return { history: newObs };
  } catch (err) {
    emitStepFinished(ctx.taskId, ctx.agentId || 'executor', 'failed');
    throw err;
  }
}
