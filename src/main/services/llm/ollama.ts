import { Ollama } from 'ollama';
import { nanoid } from 'nanoid';
import { OLLAMA_URL } from '@shared/constants';
import { logger } from '../logger.js';
import { getSetting, SETTING_KEYS } from '../settings.js';
import { BaseLLMProvider } from './provider.js';
import type { ChatMessage, ChatOptions, ChatResult, ModelInfo, ToolCall } from './provider.js';

const log = logger.child({ mod: 'ollama' });

export class OllamaProvider extends BaseLLMProvider {
  readonly id = 'ollama';
  readonly label = 'Ollama (local)';

  constructor() {
    super();
  }

  private async client(): Promise<Ollama> {
    log.info('connecting to Ollama server...');
    const url = await this.url();
    const client = new Ollama({ host: url });
    log.info('connected to Ollama server at %s', url);
    return client;
  }

  async url(): Promise<string> {
    return getSetting(SETTING_KEYS.OLLAMA_URL, OLLAMA_URL);
  }

  async ping(): Promise<boolean> {
    try {
      const ol = await this.client();
      await ol.list();
      return true;
    } catch (err) {
      logger.warn({ err }, 'ollama ping failed');
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const ol = await this.client();
    const data = await ol.list();
    return (data.models ?? []).map((m) => ({
      name: m.name,
      sizeBytes: m.size,
      modifiedAt: m.modified_at?.toISOString(),
    }));
  }

  async chat(opts: ChatOptions): Promise<ChatResult> {
    const ol = await this.client();
    const response = await ol.chat({
      model: opts.model,
      messages: opts.messages.map(toOllamaMessage),
      stream: true,
      tools: opts.tools,
      options: {
        temperature: opts.temperature ?? 0.2,
      },
    });

    let content = '';
    let thinking = '';
    let model = opts.model;
    let totalDurationMs: number | undefined;
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    let toolCalls: ToolCall[] | undefined;

    for await (const chunk of response) {
      if (chunk.message?.thinking) {
        const t = chunk.message.thinking;
        thinking += t;
        opts.onThinkingDelta?.(t);
      }
      if (chunk.message?.content) {
        content += chunk.message.content;
        opts.onDelta?.(chunk.message.content);
      }
      if (chunk.message?.tool_calls?.length) {
        toolCalls ??= [];
        for (const tc of chunk.message.tool_calls) {
          toolCalls.push({
            id: `call_${nanoid(8)}`,
            name: tc.function.name,
            arguments: tc.function.arguments as Record<string, unknown>,
          });
        }
      }
      if (chunk.done) {
        model = chunk.model;
        if (chunk.total_duration) totalDurationMs = chunk.total_duration / 1_000_000;
        promptTokens = chunk.prompt_eval_count;
        completionTokens = chunk.eval_count;
      }
    }

    const finishReason = toolCalls?.length ? 'tool_calls' : 'stop';
    return {
      content,
      thinking: thinking || undefined,
      model,
      toolCalls,
      usage: { promptTokens, completionTokens, totalDurationMs },
      finishReason,
    };
  }

  async disconnect(): Promise<void> {
    const client = await this.client();
    client.abort();
  }
}

/**
 * Map our ChatMessage discriminated union to the shape the Ollama JS client expects.
 * - assistant messages: camelCase toolCalls → snake_case tool_calls
 * - tool result messages: include tool_name field
 */
function toOllamaMessage(msg: ChatMessage): {
  role: string;
  content: string;
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[];
  tool_name?: string;
} {
  if (msg.role === 'assistant' && msg.toolCalls?.length) {
    return {
      role: 'assistant',
      content: msg.content,
      tool_calls: msg.toolCalls.map((tc) => ({
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      })),
    };
  }
  if (msg.role === 'tool') {
    return { role: 'tool', content: msg.content, tool_name: msg.name };
  }
  return { role: msg.role, content: msg.content };
}
