import type { RunnableConfig } from '@langchain/core/runnables';
import { logger } from '../services/logger.js';
import { EXECUTOR_SYSTEM } from './prompts.js';
import { Conversation } from './conversation.js';
import { llmChat } from './llmChat.js';
import { executeToolCalls } from './toolExecution.js';
import { emitStepStarted, emitStepFinished } from './eventEmitter.js';
import { ctxOf } from './runCtx.js';
import { getAgent } from '../services/agents.js';
import { addMessage } from '../services/store.js';
import type { RunCtx } from './runCtx.js';
import type { AgentState } from './state.js';
import { buildPromptContext } from './prompts-context.js';

const log = logger.child({ mod: 'orchestrator' });

/**
 * Shared executor loop logic. Creates a Conversation and drives it to
 * completion, returning the final assistant text.
 * The agent analyzes the codebase itself — no pre-made plan is provided.
 */
async function runExecutorLoop(
  ctx: RunCtx,
  systemPrompt: string,
  state: AgentState,
  temperature?: number,
): Promise<string> {
  const conv = new Conversation({ system: systemPrompt });

  const promptContext = await buildPromptContext(ctx);
  const goalLine = `**GOAL**: ${state.prompt}`;
  conv.addUserMessage([promptContext, goalLine].join('\n'));

  let finalText = '';

  while (true) {
    if (ctx.signal.aborted) throw new Error('aborted');

    const response = await llmChat(ctx, conv.getMessages(), temperature);
    finalText = response.text;

    const assistantMessage = addMessage({
      taskId: ctx.taskId,
      role: 'assistant',
      content: response.text,
      thinking: response.thinking ?? null,
      agentId: ctx.agentId,
      toolCalls: response.toolCalls?.length ? JSON.stringify(response.toolCalls) : null,
      toolCallId: null,
      toolName: null,
      createdAt: Date.now(),
    });

    if (response.done || !response.toolCalls?.length) break;

    conv.addAssistantMessage(response.text, response.thinking, response.toolCalls);

    const results = await executeToolCalls(ctx, assistantMessage.id, response.toolCalls);

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      const tc = response.toolCalls[i]!;
      conv.addToolResult(tc.id, r.toolName, r.content);
    }

    if (results.some((r) => r.status === 'success' && r.toolName === 'task_complete')) {
      log.info('executor completed task');
      break;
    }
  }

  return finalText;
}

export async function executorNode(
  state: AgentState,
  config?: RunnableConfig,
): Promise<Partial<AgentState>> {
  const ctx = ctxOf(config);
  const agent = ctx.agentId ? getAgent(ctx.agentId) : null;

  let systemPrompt = EXECUTOR_SYSTEM;
  let temperature: number | undefined;

  if (agent) {
    systemPrompt = [EXECUTOR_SYSTEM, '---', agent.systemPrompt].join('\n');
    temperature = agent.temperature;
  }

  try {
    emitStepStarted(ctx.taskId, ctx.agentId);
    const result = await runExecutorLoop(ctx, systemPrompt, state, temperature);
    emitStepFinished(ctx.taskId, ctx.agentId, 'succeeded');
    return { result };
  } catch (err) {
    emitStepFinished(ctx.taskId, ctx.agentId, 'failed');
    throw err;
  }
}
