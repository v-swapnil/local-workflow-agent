export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/** A tool call returned by the LLM, or sent back as a tool result header. */
export interface ToolCall {
  /** Unique ID used to correlate assistant tool_calls with tool result messages. */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** @deprecated Use ToolCall. */
export type ToolCallResult = ToolCall;

/**
 * Discriminated union covering all message roles.
 * - system / user: plain text
 * - assistant: optional tool calls emitted by the LLM
 * - tool: result of a tool execution, correlated via toolCallId
 */
export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface ChatToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
  tools?: ChatToolDef[];
}

export interface ChatResult {
  content: string;
  thinking?: string;
  model: string;
  toolCalls?: ToolCall[];
  usage?: { promptTokens?: number; completionTokens?: number; totalDurationMs?: number };
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'error';
}

export interface ModelInfo {
  name: string;
  sizeBytes?: number;
  modifiedAt?: string;
}

export interface PullProgress {
  status: string; // e.g. "downloading", "verifying", "success"
  digest?: string;
  total?: number;
  completed?: number;
}

export interface LLMProvider {
  readonly id: string;
  readonly label: string;
  ping(): Promise<boolean>;
  listModels(): Promise<ModelInfo[]>;
  chat(opts: ChatOptions): Promise<ChatResult>;
  pullModel(
    name: string,
    onProgress: (p: PullProgress) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  deleteModel(name: string): Promise<void>;
}

export abstract class BaseLLMProvider implements LLMProvider {
  abstract readonly id: string;
  abstract readonly label: string;

  abstract ping(): Promise<boolean>;
  abstract listModels(): Promise<ModelInfo[]>;
  abstract chat(opts: ChatOptions): Promise<ChatResult>;

  async pullModel(
    name: string,
    onProgress: (p: PullProgress) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    throw new Error(`${this.id}: pullModel is not supported`);
  }

  async deleteModel(name: string): Promise<void> {
    throw new Error(`${this.id}: deleteModel is not supported`);
  }
}
