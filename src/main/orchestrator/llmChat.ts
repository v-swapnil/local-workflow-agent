import { getProvider } from '../services/llm/index.js';
import { PROVIDERS } from '@shared/constants';
import { listToolsForLLM } from '../services/tools/registry.js';
import type { ChatMessage, ChatToolDef, ToolCall } from '../services/llm/provider.js';
import type { RunCtx } from './runCtx.js';
import { getSetting, SETTING_KEYS } from '@main/services/settings.js';
import { ProviderId } from '@shared/types.js';

interface ToolCallResponse {
  done: false;
  toolCalls: ToolCall[];
  text: string;
  thinking?: string;
}

interface DoneResponse {
  done: true;
  toolCalls?: undefined;
  text: string;
  thinking?: string;
}

/**
 * Send the current conversation messages to the LLM and return either
 * tool calls (with IDs for correlation) or a "done" signal.
 */
export async function llmChat(
  ctx: RunCtx,
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
    timeout: ctx.timeoutMs,
  });

  if (result.toolCalls?.length) {
    return {
      done: false,
      toolCalls: result.toolCalls,
      text: result.content,
      thinking: result.thinking,
    };
  }

  return { done: true, text: result.content, thinking: result.thinking };
}
