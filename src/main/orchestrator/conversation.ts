import type { ChatMessage, ToolCall } from '../services/llm/provider.js';

/**
 * Append-only conversation history for a single agent loop.
 *
 * Messages are stored in order: [system, user, assistant?, tool?, ...].
 * When the total character estimate exceeds `maxChars`, `getMessages()` returns
 * a copy with old tool-result content replaced by `[truncated: N chars]`.
 * The tool message skeleton (role, toolCallId, name) is preserved so the
 * assistant↔tool_call_id correlation chain stays intact.
 */
export class Conversation {
  private readonly messages: ChatMessage[];

  constructor(opts: { system: string; maxChars?: number }) {
    this.messages = [{ role: 'system', content: opts.system }];
  }

  /** Append the initial (or follow-up) user message. */
  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content });
  }

  /**
   * Record an assistant response.
   * Pass `toolCalls` when the model returned native tool calls.
   */
  addAssistantMessage(content: string, thinking?: string, toolCalls?: ToolCall[]): void {
    if (toolCalls?.length) {
      this.messages.push({ role: 'assistant', content, thinking, toolCalls });
    } else {
      this.messages.push({ role: 'assistant', content, thinking });
    }
  }

  /**
   * Record the result of a single tool execution.
   * `toolCallId` must match the `id` on the corresponding `ToolCall` in the
   * preceding assistant message so providers can correlate them.
   */
  addToolResult(toolCallId: string, toolName: string, content: string): void {
    this.messages.push({ role: 'tool', toolCallId, toolName, content });
  }

  /**
   * Return all messages, applying content truncation if the conversation
   * exceeds the character budget.  The returned array is a shallow copy —
   * callers must not mutate it.
   */
  getMessages(): ChatMessage[] {
    return [...this.messages];
  }
}
