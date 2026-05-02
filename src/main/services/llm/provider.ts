export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ToolCallResult {
  name: string;
  arguments: Record<string, unknown>;
}

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
  tools?: ChatToolDef[];
}

export interface ChatResult {
  content: string;
  model: string;
  toolCalls?: ToolCallResult[];
  usage?: { promptTokens?: number; completionTokens?: number; totalDurationMs?: number };
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
