import type { RunnableConfig } from '@langchain/core/runnables';
import { COPILOT_EXECUTOR_SYSTEM } from './prompts.js';
import { Conversation } from './conversation.js';
import { llmChat } from './llmChat.js';
import { emitStepStarted, emitStepFinished } from './eventEmitter.js';
import { buildPromptContext } from './prompts-context.js';
import { getAgentOrNull } from '../services/agents.js';
import { ctxOf } from './runCtx.js';
import type { AgentState } from './state.js';

/**
 * Copilot executor node — delegates to CopilotProvider.chat() via llmChat().
 * No plan required; Copilot handles tool execution internally via the SDK.
 */
export async function copilotExecutorNode(
  state: AgentState,
  config?: RunnableConfig,
): Promise<Partial<AgentState>> {
  const ctx = ctxOf(config);
  const agent = ctx.agentId ? getAgentOrNull(ctx.agentId) : null;

  let systemPrompt = COPILOT_EXECUTOR_SYSTEM;
  if (agent) {
    systemPrompt = [systemPrompt, '---', agent.systemPrompt].join('\n\n');
  }

  const sequence = ctx.stepIdx.n++;
  const { stepId } = emitStepStarted(ctx.taskId, sequence, 'copilot-executor');

  try {
    const conv = new Conversation({ system: systemPrompt });
    const promptContext = await buildPromptContext(ctx);
    conv.addUserMessage([promptContext, state.prompt].join('\n\n'));

    // CopilotProvider.chat() handles the full agentic session (tools, permissions, events).
    // It returns done:true since toolCalls is always [] (SDK manages tools internally).
    await llmChat(ctx, 'copilot', conv.getMessages(), agent?.temperature);

    emitStepFinished(ctx.taskId, stepId, true, {});
    return { history: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emitStepFinished(ctx.taskId, stepId, false, null, msg);
    throw err;
  }
}
