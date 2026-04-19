import { request as httpRequest } from 'node:http';
import { OLLAMA_URL } from '@shared/constants';
import { logger } from '../logger.js';
import type {
  ChatOptions,
  ChatResult,
  LLMProvider,
  ModelInfo,
  PullProgress,
} from './provider.js';

interface OllamaChatChunk {
  model: string;
  created_at: string;
  message?: { role: string; content: string };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

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

export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama';
  readonly label = 'Ollama (local)';
  private readonly baseUrls: string[];
  private preferredBaseUrl: string | null = null;

  constructor(baseUrl = OLLAMA_URL) {
    this.baseUrls = candidateBaseUrls(baseUrl);
  }

  async ping(): Promise<boolean> {
    const details = await this.pingDetails();
    return details.ok;
  }

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
    const { res } = await this.fetchWithFallback('/api/tags');
    if (!res.ok) throw new Error(`ollama listModels failed: ${res.status}`);
    const data = (await res.json()) as {
      models?: { name: string; size?: number; modified_at?: string }[];
    };
    return (data.models ?? []).map((m) => ({
      name: m.name,
      sizeBytes: m.size,
      modifiedAt: m.modified_at,
    }));
  }

  async chat(opts: ChatOptions): Promise<ChatResult> {
    const { res } = await this.fetchWithFallback('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: true,
        options: {
          temperature: opts.temperature ?? 0.2,
        },
      }),
      signal: opts.signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`ollama chat failed: ${res.status} ${await res.text().catch(() => '')}`);
    }

    let content = '';
    let model = opts.model;
    let totalDurationMs: number | undefined;
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;

    for await (const chunk of jsonLines<OllamaChatChunk>(res.body)) {
      if (chunk.message?.content) {
        content += chunk.message.content;
        opts.onDelta?.(chunk.message.content);
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
      model,
      usage: { promptTokens, completionTokens, totalDurationMs },
    };
  }

  async pullModel(
    name: string,
    onProgress: (p: PullProgress) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const { res } = await this.fetchWithFallback('/api/pull', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
      body: JSON.stringify({ name, stream: true }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`ollama pull failed: ${res.status} ${await res.text().catch(() => '')}`);
    }
    for await (const chunk of jsonLines<PullProgress>(res.body)) {
      onProgress(chunk);
      if (chunk.status === 'success') return;
    }
  }

  async deleteModel(name: string): Promise<void> {
    const { res } = await this.fetchWithFallback('/api/delete', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`ollama delete failed: ${res.status}`);
  }

  private orderedBaseUrls(): string[] {
    if (!this.preferredBaseUrl) return this.baseUrls;
    return [
      this.preferredBaseUrl,
      ...this.baseUrls.filter((url) => url !== this.preferredBaseUrl),
    ];
  }

  private async fetchWithFallback(path: string, init?: RequestInit): Promise<{ res: Response; baseUrl: string }> {
    let lastErr: unknown = null;
    for (const baseUrl of this.orderedBaseUrls()) {
      try {
        const res = await fetch(`${baseUrl}${path}`, init);
        this.preferredBaseUrl = baseUrl;
        return { res, baseUrl };
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

async function* jsonLines<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line) as T;
        } catch {
          /* skip malformed line */
        }
      }
    }
    const tail = buf.trim();
    if (tail) {
      try { yield JSON.parse(tail) as T; } catch { /* ignore */ }
    }
  } finally {
    reader.releaseLock();
  }
}
