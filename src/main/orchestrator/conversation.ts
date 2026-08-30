import type { ChatMessage, ToolCall } from '../services/llm/provider.js';
import type { MessageRecord } from '@shared/schema.js';
import { addMessage, listTaskMessages } from '../services/store.js';

/**
 * DB-backed conversation history for a single agent loop.
 *
 * Every message is persisted to the `messages` table, keyed by `taskId`, so the
 * database is the single source of truth for the loop's context. `getMessages()`
 * reads the persisted rows back and prepends the (non-persisted, config-derived)
 * system prompt before handing the array to a provider.
 *
 * The assistant↔tool_call_id correlation chain is preserved because assistant
 * `toolCalls` and tool `toolCallId`/`toolName` are stored on their rows.
 */
export class Conversation {
  private readonly taskId: number;
  private readonly agentId: number | null;

  constructor(opts: { taskId: number; agentId: number | null }) {
    this.taskId = opts.taskId;
    this.agentId = opts.agentId;
  }

  private persist(message: ChatMessage): MessageRecord {
    const payload: Omit<MessageRecord, 'id'> = {
      taskId: this.taskId,
      agentId: this.agentId,
      role: message.role,
      content: message.content,
      createdAt: Date.now(),
      thinking: null,
      toolCalls: null,
      toolCallId: null,
      toolName: null,
    };

    if (message.role === 'assistant') {
      payload.thinking = message.thinking ?? null;
      payload.toolCalls = message.toolCalls?.length ? JSON.stringify(message.toolCalls) : null;
    }

    if (message.role === 'tool') {
      payload.toolCallId = message.toolCallId;
      payload.toolName = message.toolName;
    }

    return addMessage(payload);
  }

  // Append the system prompt (non-persisted) to the conversation. This is prepended
  addSystemMessage(content: string): void {
    this.persist({ role: 'system', content });
  }

  /** Append the initial (or follow-up) user message. */
  addUserMessage(content: string): void {
    this.persist({ role: 'user', content });
  }

  /**
   * Record an assistant response and return the persisted row so callers can
   * reference its `id` (e.g. to correlate tool executions).
   * Pass `toolCalls` when the model returned native tool calls.
   */
  addAssistantMessage(content: string, thinking?: string, toolCalls?: ToolCall[]): MessageRecord {
    return this.persist({ role: 'assistant', content, thinking, toolCalls });
  }

  /**
   * Record the result of a single tool execution.
   * `toolCallId` must match the `id` on the corresponding `ToolCall` in the
   * preceding assistant message so providers can correlate them.
   */
  addToolResult(toolCallId: string, toolName: string, content: string): void {
    this.persist({ role: 'tool', content, toolCallId, toolName });
  }

  /**
   * Return all messages for this task in conversation order, with the system
   * prompt prepended. The system prompt is config-derived and not persisted.
   */
  getMessages(): ChatMessage[] {
    const message = listTaskMessages(this.taskId);
    const formattedMessages = message.map((msg): ChatMessage => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          toolCallId: msg.toolCallId ?? '',
          toolName: msg.toolName ?? '',
          content: msg.content,
        };
      }

      if (msg.role === 'assistant') {
        return {
          role: 'assistant',
          content: msg.content,
          thinking: msg.thinking ?? undefined,
          toolCalls: msg.toolCalls ? (JSON.parse(msg.toolCalls) as ToolCall[]) : undefined,
        };
      }

      if (msg.role === 'system') {
        return { role: 'system', content: msg.content };
      }

      return { role: 'user', content: msg.content };
    });

    return formattedMessages;
  }
}
