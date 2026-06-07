import { getProvider } from '../services/llm/index.js';
import { PROVIDERS } from '@shared/constants';
import { listToolsForLLM } from '../services/tools/registry.js';
import { emitMessageDelta, emitThinkingDelta } from './eventEmitter.js';
import type { ChatMessage, ChatToolDef, ToolCall } from '../services/llm/provider.js';
import type { RunCtx } from './runCtx.js';
import { getSetting, SETTING_KEYS } from '@main/services/settings.js';
import { ProviderId } from '@shared/types.js';

export interface ToolCallResponse {
  toolCalls: ToolCall[];
  /** Text content of the assistant message (may be empty string). */
  text: string;
  done: false;
}

export interface DoneResponse {
  toolCalls?: undefined;
  done: true;
  /** Text content from the final LLM response (used by planner to extract the plan). */
  text: string;
}

/**
 * Send the current conversation messages to the LLM and return either
 * tool calls (with IDs for correlation) or a "done" signal.
 */
export async function llmChat(
  ctx: RunCtx,
  agent: string,
  messages: ChatMessage[],
  temperature = 0.2,
  availableTools?: ChatToolDef[],
): Promise<ToolCallResponse | DoneResponse> {
  const activeProviderId = await getSetting(SETTING_KEYS.ACTIVE_PROVIDER, PROVIDERS.OLLAMA);
  const provider = getProvider(activeProviderId as ProviderId);
  const tools = availableTools ?? listToolsForLLM();

  const result = await provider.chat({
    taskId: ctx.taskId,
    workingDirectory: ctx.workspacePath,
    model: ctx.model,
    temperature,
    signal: ctx.signal,
    messages,
    tools,
    onDelta: (d) => emitMessageDelta(ctx.taskId, agent, d),
    onThinkingDelta: (d) => emitThinkingDelta(ctx.taskId, agent, d),
  });

  if (result.toolCalls?.length) {
    return { toolCalls: result.toolCalls, text: result.content, done: false };
  }

  return { done: true, text: result.content };
}
