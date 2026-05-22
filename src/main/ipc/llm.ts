import { z } from 'zod';
import { observable } from '@trpc/server/observable';
import { router, publicProcedure } from './trpc.js';
import { getProvider } from '../services/llm/index.js';
import { OllamaProvider } from '../services/llm/ollama.js';
import { getCopilotService } from '../services/llm/copilot.js';
import { getSetting, setSetting, SETTING_KEYS } from '../services/settings.js';
import {
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_COPILOT_MODEL,
  COPILOT_CLI_URL,
  OLLAMA_URL,
  PROVIDERS,
} from '@shared/constants';
import type { ProviderId } from '@shared/types';
import type { PullProgress } from '../services/llm/provider.js';

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

export const llmRouter = router({
  ollamaHealth: publicProcedure.query(async () => {
    const p = getProvider(PROVIDERS.OLLAMA);
    if (p instanceof OllamaProvider) {
      const details = await p.pingDetails();
      return {
        provider: p.id,
        label: p.label,
        ok: details.ok,
        url: details.url,
        attempts: details.attempts,
      };
    }
    const ok = await p.ping();
    return { provider: p.id, ok, label: p.label, url: null, attempts: [] };
  }),

  /** Unified health check — pings only the active provider. */
  health: publicProcedure.query(async () => {
    const providerId = (await getSetting(SETTING_KEYS.ACTIVE_PROVIDER, PROVIDERS.OLLAMA)) as ProviderId;
    switch (providerId) {
      case PROVIDERS.COPILOT: {
        const svc = getCopilotService();
        const ok = await svc.ping();
        const url = await getSetting(SETTING_KEYS.COPILOT_CLI_URL, COPILOT_CLI_URL);
        return { provider: PROVIDERS.COPILOT, label: 'GitHub Copilot', ok, url };
      }
      case PROVIDERS.OLLAMA: {
        const p = getProvider(PROVIDERS.OLLAMA);
        if (p instanceof OllamaProvider) {
          const details = await p.pingDetails();
          return { provider: PROVIDERS.OLLAMA, label: 'Ollama', ok: details.ok, url: details.url };
        }
        const ok = await p.ping();
        return { provider: PROVIDERS.OLLAMA, label: 'Ollama', ok, url: OLLAMA_URL };
      }
      default:
        throw new Error(`unknown provider: ${providerId}`);
    }
  }),

  listModels: publicProcedure.query(async () => {
    const p = getProvider(PROVIDERS.OLLAMA);
    if (!(await p.ping())) return [];
    return p.listModels();
  }),

  listModelsByProvider: publicProcedure
    .input(z.object({ provider: z.enum([PROVIDERS.OLLAMA, PROVIDERS.COPILOT]) }))
    .query(async ({ input }) => {
      switch (input.provider) {
        case PROVIDERS.COPILOT: {
          const svc = getCopilotService();
          if (!(await svc.ping())) return [];
          return svc.listModels();
        }
        case PROVIDERS.OLLAMA: {
          const p = getProvider(PROVIDERS.OLLAMA);
          if (!(await p.ping())) return [];
          return p.listModels();
        }
        default:
          throw new Error(`unknown provider: ${input.provider}`);
      }
    }),

  activeModel: publicProcedure.query(async () => {
    const provider = (await getSetting(SETTING_KEYS.ACTIVE_PROVIDER, PROVIDERS.OLLAMA)) as ProviderId;
    const fallback = provider === PROVIDERS.COPILOT ? DEFAULT_COPILOT_MODEL : DEFAULT_OLLAMA_MODEL;
    return await getSetting(SETTING_KEYS.PRIMARY_MODEL, fallback);
  }),

  setActiveModel: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await setSetting(SETTING_KEYS.PRIMARY_MODEL, input.name);
      return { ok: true };
    }),

  secondaryModel: publicProcedure.query(async () => {
    const provider = (await getSetting(SETTING_KEYS.ACTIVE_PROVIDER, PROVIDERS.OLLAMA)) as ProviderId;
    const fallback = provider === PROVIDERS.COPILOT ? DEFAULT_COPILOT_MODEL : DEFAULT_OLLAMA_MODEL;
    return await getSetting(SETTING_KEYS.SECONDARY_MODEL, fallback);
  }),

  setSecondaryModel: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await setSetting(SETTING_KEYS.SECONDARY_MODEL, input.name);
      return { ok: true };
    }),

  deleteModel: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await getProvider(PROVIDERS.OLLAMA).deleteModel(input.name);
      return { ok: true };
    }),

  // One-shot chat (no streaming) — used by debug panel.
  chat: publicProcedure
    .input(
      z.object({
        model: z.string().optional(),
        messages: z.array(messageSchema).min(1),
        temperature: z.number().min(0).max(2).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const providerId = (await getSetting(SETTING_KEYS.ACTIVE_PROVIDER, PROVIDERS.OLLAMA)) as ProviderId;
      const p = getProvider(providerId);
      const fallback =
        providerId === PROVIDERS.COPILOT ? DEFAULT_COPILOT_MODEL : DEFAULT_OLLAMA_MODEL;
      const model = input.model ?? await getSetting(SETTING_KEYS.PRIMARY_MODEL, fallback);
      const t0 = Date.now();
      const result = await p.chat({
        model,
        messages: input.messages,
        temperature: input.temperature,
      });
      return { ...result, wallMs: Date.now() - t0 };
    }),

  // Subscription: streamed model pull progress.
  pullModel: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .subscription(({ input }) => {
      return observable<PullProgress | { status: 'error'; error: string } | { status: 'done' }>(
        (emit) => {
          const ctrl = new AbortController();
          const p = getProvider(PROVIDERS.OLLAMA);
          (async () => {
            try {
              await p.pullModel(input.name, (prog) => emit.next(prog), ctrl.signal);
              emit.next({ status: 'done' });
              emit.complete();
            } catch (err) {
              emit.next({ status: 'error', error: (err as Error).message });
              emit.complete();
            }
          })();
          return () => ctrl.abort();
        },
      );
    }),

  // Subscription: streamed chat (used later by agents; exposed for debug too).
  chatStream: publicProcedure
    .input(
      z.object({
        model: z.string().optional(),
        messages: z.array(messageSchema).min(1),
        temperature: z.number().min(0).max(2).optional(),
      }),
    )
    .subscription(({ input }) => {
      return observable<
        | { type: 'delta'; content: string }
        | { type: 'done'; content: string; model: string }
        | { type: 'error'; error: string }
      >((emit) => {
        const ctrl = new AbortController();
        (async () => {
          const providerId = (await getSetting(SETTING_KEYS.ACTIVE_PROVIDER, PROVIDERS.OLLAMA)) as ProviderId;
          const p = getProvider(providerId);
          const fallback =
            providerId === PROVIDERS.COPILOT ? DEFAULT_COPILOT_MODEL : DEFAULT_OLLAMA_MODEL;
          const model = input.model ?? await getSetting(SETTING_KEYS.PRIMARY_MODEL, fallback);
          try {
            const result = await p.chat({
              model,
              messages: input.messages,
              temperature: input.temperature,
              signal: ctrl.signal,
              onDelta: (d) => emit.next({ type: 'delta', content: d }),
            });
            emit.next({ type: 'done', content: result.content, model: result.model });
            emit.complete();
          } catch (err) {
            emit.next({ type: 'error', error: (err as Error).message });
            emit.complete();
          }
        })();
        return () => ctrl.abort();
      });
    }),

  activeProvider: publicProcedure.query(async () => {
    return (await getSetting(SETTING_KEYS.ACTIVE_PROVIDER, PROVIDERS.OLLAMA)) as ProviderId;
  }),

  setActiveProvider: publicProcedure
    .input(z.object({ provider: z.enum([PROVIDERS.OLLAMA, PROVIDERS.COPILOT]) }))
    .mutation(async ({ input }) => {
      await setSetting(SETTING_KEYS.ACTIVE_PROVIDER, input.provider);
      return { ok: true };
    }),

  copilotHealth: publicProcedure.query(async () => {
    const ok = await getCopilotService().ping();
    const url = await getSetting(SETTING_KEYS.COPILOT_CLI_URL, COPILOT_CLI_URL);
    return { provider: PROVIDERS.COPILOT, ok, label: 'GitHub Copilot', url };
  }),

  copilotModels: publicProcedure.query(async () => {
    return getCopilotService().listModels();
  }),

  copilotRetry: publicProcedure.mutation(async () => {
    const service = getCopilotService();
    await service.disconnect();
    const ok = await service.ping();
    return { ok };
  }),

  copilotCliUrl: publicProcedure.query(async () => {
    return await getSetting(SETTING_KEYS.COPILOT_CLI_URL, COPILOT_CLI_URL);
  }),

  setCopilotCliUrl: publicProcedure
    .input(z.object({ url: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await setSetting(SETTING_KEYS.COPILOT_CLI_URL, input.url);
      // Force reconnect on next use
      getCopilotService()
        .disconnect()
        .catch(() => {});
      return { ok: true };
    }),
});
