import type { RunnableConfig } from '@langchain/core/runnables';
import { listReadOnlyToolsForLLM } from '../services/tools/registry.js';
import { updateTask } from '../services/workspaces';
import { PLANNER_SYSTEM } from './prompts.js';
import { Conversation } from './conversation.js';
import { llmChat } from './llmChat.js';
import { executeToolCalls } from './toolExecution.js';
import { emitStepStarted, emitStepFinished } from './eventEmitter.js';
import { ctxOf } from './runCtx.js';
import { getAgentOrNull } from '../services/agents.js';
import type { RunCtx } from './runCtx.js';
import type { AgentState } from './state.js';
import { buildPromptContext } from './prompts-context.js';

/**
 * Planner exploration loop.
 * Builds a Conversation and appends tool results natively so the LLM can see
 * what it already explored before deciding on the next step.
 * Returns the final markdown plan when the LLM responds with text only.
 */
async function runPlannerLoop(
  ctx: RunCtx,
  systemPrompt: string,
  userPrompt: string,
  temperature?: number,
): Promise<string> {
  const readOnlyTools = listReadOnlyToolsForLLM();
  const conv = new Conversation({ system: systemPrompt });

  const promptContext = await buildPromptContext(ctx);
  const userMessages = [promptContext, userPrompt].join('\n\n');

  conv.addUserMessage(userMessages);

  while (true) {
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

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      const tc = response.toolCalls[i]!;
      conv.addToolResult(tc.id, r.tool, r.ok ? r.output : `ERROR: ${r.error ?? 'unknown error'}`);
    }
  }
}

export async function plannerNode(
  state: AgentState,
  config?: RunnableConfig,
): Promise<Partial<AgentState>> {
  const ctx = ctxOf(config);
  const agent = ctx.agentId ? getAgentOrNull(ctx.agentId) : null;

  let systemPrompt = PLANNER_SYSTEM;
  let temperature: number | undefined;

  if (agent) {
    systemPrompt = [PLANNER_SYSTEM, '---', agent.systemPrompt].join('\n\n');
    temperature = agent.temperature;
  }

  const sequence = ctx.stepIdx.n++;
  const { stepId } = emitStepStarted(ctx.taskId, sequence, 'planner');
  try {
    const plan = await runPlannerLoop(ctx, systemPrompt, state.prompt, temperature);
    updateTask(ctx.taskId, { plan });
    emitStepFinished(ctx.taskId, stepId, true, { plan });
    return { plan };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emitStepFinished(ctx.taskId, stepId, false, null, msg);
    throw err;
  }
}
