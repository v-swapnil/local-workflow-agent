import { z } from 'zod';
import { observable } from '@trpc/server/observable';
import { router, publicProcedure } from './trpc.js';
import { getProvider } from '../services/llm/index.js';
import { OllamaProvider } from '../services/llm/ollama.js';
import { getSetting, setSetting, SETTING_KEYS } from '../services/settings.js';
import { DEFAULT_MODEL } from '@shared/constants';
import type { PullProgress } from '../services/llm/provider.js';

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

export const llmRouter = router({
  health: publicProcedure.query(async () => {
    const p = getProvider('ollama');
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

  listModels: publicProcedure.query(async () => {
    const p = getProvider('ollama');
    if (!(await p.ping())) return [];
    return p.listModels();
  }),

  activeModel: publicProcedure.query(async () => {
    return (await getSetting(SETTING_KEYS.ACTIVE_MODEL)) ?? DEFAULT_MODEL;
  }),

  setActiveModel: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await setSetting(SETTING_KEYS.ACTIVE_MODEL, input.name);
      return { ok: true };
    }),

  deleteModel: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await getProvider('ollama').deleteModel(input.name);
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
      const p = getProvider('ollama');
      const model =
        input.model ?? (await getSetting(SETTING_KEYS.ACTIVE_MODEL)) ?? DEFAULT_MODEL;
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
          const p = getProvider('ollama');
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
          const p = getProvider('ollama');
          const model =
            input.model ?? (await getSetting(SETTING_KEYS.ACTIVE_MODEL)) ?? DEFAULT_MODEL;
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
});
