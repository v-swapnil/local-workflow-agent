import type { ChatMessage, ToolCall } from '../services/llm/provider.js';

/**
 * Default context budget in characters (~25k tokens at 4 chars/token).
 * Safe for models with a 32k context window.
 */
const DEFAULT_MAX_CHARS = 100_000;

/**
 * Number of most-recent assistant turns to protect from truncation.
 * We never truncate the last N assistant+tool-result pairs so the model
 * retains recent context even during heavy truncation.
 */
const MIN_PROTECTED_TURNS = 2;

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
  private readonly maxChars: number;

  constructor(opts: { system: string; maxChars?: number }) {
    this.maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
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
  addAssistantMessage(content: string, toolCalls?: ToolCall[]): void {
    if (toolCalls?.length) {
      this.messages.push({ role: 'assistant', content, toolCalls });
    } else {
      this.messages.push({ role: 'assistant', content });
    }
  }

  /**
   * Record the result of a single tool execution.
   * `toolCallId` must match the `id` on the corresponding `ToolCall` in the
   * preceding assistant message so providers can correlate them.
   */
  addToolResult(toolCallId: string, name: string, content: string): void {
    this.messages.push({ role: 'tool', toolCallId, name, content });
  }

  /**
   * Return all messages, applying content truncation if the conversation
   * exceeds the character budget.  The returned array is a shallow copy —
   * callers must not mutate it.
   */
  getMessages(): ChatMessage[] {
    if (this.estimateChars() <= this.maxChars) {
      return [...this.messages];
    }
    return this.applyTruncation();
  }

  /**
   * Rough character-count estimate for the entire conversation.
   * Uses chars / 4 ≈ tokens — no tokenizer dependency needed.
   */
  estimateChars(): number {
    return this.messages.reduce((sum, m) => {
      let chars = m.content.length;
      if (m.role === 'assistant' && m.toolCalls) {
        chars += JSON.stringify(m.toolCalls).length;
      }
      return sum + chars;
    }, 0);
  }

  private applyTruncation(): ChatMessage[] {
    // Build a mutable shallow copy (spread each message object to avoid mutating originals)
    const copy: ChatMessage[] = this.messages.map((m) => ({ ...m } as ChatMessage));

    // Determine the "protected zone": messages from index protectFromIdx onwards are kept intact.
    // We protect at least the last MIN_PROTECTED_TURNS assistant turns and everything after them.
    let assistantCount = 0;
    let protectFromIdx = copy.length;
    for (let i = copy.length - 1; i >= 2; i--) {
      const msg = copy[i];
      if (!msg) continue;
      if (msg.role === 'assistant') {
        assistantCount++;
        if (assistantCount >= MIN_PROTECTED_TURNS) {
          protectFromIdx = i;
          break;
        }
      }
    }

    // Always protect: index 0 (system) + index 1 (first user message).
    // Truncate tool-result content in indices [2, protectFromIdx) from oldest to newest.
    let chars = this.estimateChars();
    for (let i = 2; i < protectFromIdx && chars > this.maxChars; i++) {
      const msg = copy[i];
      if (!msg) continue;
      if (msg.role === 'tool') {
        const originalLen = msg.content.length;
        if (originalLen > 30) {
          const replacement = `[truncated: ${originalLen} chars]`;
          copy[i] = { role: 'tool', toolCallId: msg.toolCallId, name: msg.name, content: replacement };
          chars -= originalLen - replacement.length;
        }
      }
    }

    return copy;
  }
}
