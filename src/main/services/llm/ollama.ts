import { request as httpRequest } from 'node:http';
import { Ollama } from 'ollama';
import { OLLAMA_URL } from '@shared/constants';
import { logger } from '../logger.js';
import { BaseLLMProvider } from './provider.js';
import type {
  ChatOptions,
  ChatResult,
  ModelInfo,
  PullProgress,
  ToolCallResult,
} from './provider.js';

export interface OllamaPingAttempt {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
}

export interface OllamaPingDetails {
  ok: boolean;
  url: string | null;
  attempts: OllamaPingAttempt[];
}

export class OllamaProvider extends BaseLLMProvider {
  readonly id = 'ollama';
  readonly label = 'Ollama (local)';
  private readonly baseUrls: string[];
  private preferredBaseUrl: string | null = null;

  constructor(baseUrl = OLLAMA_URL) {
    super();
    this.baseUrls = candidateBaseUrls(baseUrl);
  }

  /** Get an Ollama client for the preferred (or given) base URL. */
  private client(baseUrl?: string): Ollama {
    return new Ollama({ host: baseUrl ?? this.preferredBaseUrl ?? this.baseUrls[0] });
  }

  async ping(): Promise<boolean> {
    const details = await this.pingDetails();
    return details.ok;
  }

  /**
   * Ping using raw node:http so we bypass HTTP_PROXY env vars that can
   * misroute loopback requests.  Falls through candidate URLs.
   */
  async pingDetails(): Promise<OllamaPingDetails> {
    const attempts: OllamaPingAttempt[] = [];
    for (const baseUrl of this.orderedBaseUrls()) {
      const url = `${baseUrl}/api/tags`;
      const result = await rawHttpPing(url, 1500);
      if (result.ok) {
        attempts.push({ url, ok: true, status: result.status });
        this.preferredBaseUrl = baseUrl;
        return { ok: true, url: baseUrl, attempts };
      }
      attempts.push({
        url,
        ok: false,
        status: result.status,
        error: result.error,
      });
    }
    logger.warn({ attempts }, 'ollama ping: no candidate URL responded');
    return { ok: false, url: null, attempts };
  }

  async listModels(): Promise<ModelInfo[]> {
    const ol = await this.clientWithFallback();
    const data = await ol.list();
    return (data.models ?? []).map((m) => ({
      name: m.name,
      sizeBytes: m.size,
      modifiedAt: m.modified_at?.toISOString(),
    }));
  }

  async chat(opts: ChatOptions): Promise<ChatResult> {
    const ol = await this.clientWithFallback();
    const response = await ol.chat({
      model: opts.model,
      messages: opts.messages,
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
    let toolCalls: ToolCallResult[] | undefined;

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
            name: tc.function.name,
            arguments: tc.function.arguments,
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

    return {
      content,
      thinking: thinking || undefined,
      model,
      toolCalls,
      usage: { promptTokens, completionTokens, totalDurationMs },
    };
  }

  async pullModel(
    name: string,
    onProgress: (p: PullProgress) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const ol = await this.clientWithFallback();
    const response = await ol.pull({ model: name, stream: true });
    for await (const chunk of response) {
      if (signal?.aborted) throw new Error('aborted');
      onProgress({
        status: chunk.status,
        digest: chunk.digest,
        total: chunk.total,
        completed: chunk.completed,
      });
      if (chunk.status === 'success') return;
    }
  }

  async deleteModel(name: string): Promise<void> {
    const ol = await this.clientWithFallback();
    await ol.delete({ model: name });
  }

  private orderedBaseUrls(): string[] {
    if (!this.preferredBaseUrl) return this.baseUrls;
    return [this.preferredBaseUrl, ...this.baseUrls.filter((url) => url !== this.preferredBaseUrl)];
  }

  /** Try each candidate URL until one responds, then cache the working client. */
  private async clientWithFallback(): Promise<Ollama> {
    let lastErr: unknown = null;
    for (const baseUrl of this.orderedBaseUrls()) {
      try {
        const ol = this.client(baseUrl);
        await ol.list(); // lightweight connectivity check
        this.preferredBaseUrl = baseUrl;
        return ol;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('failed to reach Ollama');
  }
}

function candidateBaseUrls(baseUrl: string): string[] {
  const normalized = baseUrl.replace(/\/$/, '');
  const urls = [normalized];
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname === 'localhost') {
      const ipv4 = new URL(parsed.toString());
      ipv4.hostname = '127.0.0.1';
      urls.push(ipv4.toString().replace(/\/$/, ''));

      const ipv6 = new URL(parsed.toString());
      ipv6.hostname = '::1';
      urls.push(ipv6.toString().replace(/\/$/, ''));
    }
  } catch {
    // ignore malformed base URL and keep the provided one only
  }
  return Array.from(new Set(urls));
}

/**
 * Direct TCP/HTTP probe via node:http. Bypasses undici/fetch which respects
 * HTTP_PROXY env vars and can misroute loopback requests on some systems.
 */
interface RawPingResult {
  ok: boolean;
  status?: number;
  error?: string;
}

function rawHttpPing(url: string, timeoutMs: number): Promise<RawPingResult> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: RawPingResult): void => {
      if (settled) return;
      settled = true;
      if (!result.ok && result.error) logger.debug({ err: result.error, url }, 'rawHttpPing error');
      resolve(result);
    };
    try {
      const req = httpRequest(url, { method: 'GET' }, (res) => {
        const status = res.statusCode ?? 0;
        const ok = status >= 200 && status < 500;
        res.resume();
        done({ ok, status });
      });
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`timeout after ${timeoutMs}ms`));
      });
      req.on('error', (err) => done({ ok: false, error: err.message }));
      req.end();
    } catch (err) {
      done({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
