import { DEFAULT_COPILOT_MODEL } from '@shared/constants';
import type { SessionEvent } from '@github/copilot-sdk';
import { getCopilotService } from './copilot.js';
import { BaseLLMProvider } from './provider.js';
import type { ChatMessage, ChatOptions, ChatResult, ModelInfo, PullProgress } from './provider.js';

function eventDeltaContent(event: SessionEvent): string {
  const data = (event as { data?: { deltaContent?: string } }).data;
  return data?.deltaContent ?? '';
}

/**
 * Render the full ChatMessage history as a plain-text prompt for the Copilot SDK.
 * Tool messages are formatted inline since the SDK doesn't support multi-turn natively.
 */
function toPrompt(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      if (m.role === 'tool') {
        return `TOOL RESULT (${m.name}):\n${m.content}`;
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        const calls = m.toolCalls
          .map((tc) => `  call ${tc.name}(${JSON.stringify(tc.arguments)})`)
          .join('\n');
        return `ASSISTANT:\n${m.content}\n[Tool calls:\n${calls}\n]`;
      }
      return `${m.role.toUpperCase()}:\n${m.content}`;
    })
    .join('\n\n');
}

export class CopilotProvider extends BaseLLMProvider {
  readonly id = 'copilot';
  readonly label = 'GitHub Copilot';

  async ping(): Promise<boolean> {
    const svc = getCopilotService();
    return svc.ping();
  }

  async listModels(): Promise<ModelInfo[]> {
    const svc = getCopilotService();
    return svc.listModels();
  }

  async chat(opts: ChatOptions): Promise<ChatResult> {
    const svc = getCopilotService();
    const client = await svc.getClient();

    const chunks: string[] = [];
    const thinkingChunks: string[] = [];

    const session = await client.createSession({
      model: opts.model || DEFAULT_COPILOT_MODEL,
      workingDirectory: process.cwd(),
      streaming: true,
      onPermissionRequest: async () => ({ kind: 'no-result' }),
      onUserInputRequest: async () => ({ answer: '', wasFreeform: true }),
      onEvent: (event: SessionEvent) => {
        if (event.type === 'assistant.message_delta') {
          const text = eventDeltaContent(event);
          if (text) {
            chunks.push(text);
            opts.onDelta?.(text);
          }
          return;
        }
        if (event.type === 'assistant.reasoning_delta') {
          const text = eventDeltaContent(event);
          if (text) {
            thinkingChunks.push(text);
            opts.onThinkingDelta?.(text);
          }
        }
      },
    });

    try {
      const prompt = toPrompt(opts.messages);
      await session.sendAndWait({ prompt }, 10 * 60 * 1000);
      const content = chunks.join('');
      const thinking = thinkingChunks.join('');
      return {
        content,
        thinking: thinking || undefined,
        model: opts.model || DEFAULT_COPILOT_MODEL,
        toolCalls: [],
      };
    } finally {
      await session.disconnect().catch(() => undefined);
    }
  }

  async pullModel(_name: string, _onProgress: (p: PullProgress) => void): Promise<void> {
    throw new Error('copilot: pullModel is not supported');
  }

  async deleteModel(_name: string): Promise<void> {
    throw new Error('copilot: deleteModel is not supported');
  }
}
