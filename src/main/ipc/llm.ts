import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import { getProvider } from '../services/llm/index.js';
import { getSetting, setSetting, SETTING_KEYS } from '../services/settings.js';
import {
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_COPILOT_MODEL,
  COPILOT_CLI_URL,
  OLLAMA_URL,
  PROVIDERS,
} from '@shared/constants';
import type { ProviderId } from '@shared/types';

export const llmRouter = router({
  ollamaHealth: publicProcedure.query(async () => {
    const provider = getProvider(PROVIDERS.OLLAMA);
    const ok = await provider.ping();
    const url = await provider.url();
    return { provider: provider.id, label: provider.label, ok, url };
  }),

  copilotHealth: publicProcedure.query(async () => {
    const provider = getProvider(PROVIDERS.COPILOT);
    const ok = await provider.ping();
    const url = await provider.url();
    return { provider: provider.id, label: provider.label, ok, url };
  }),

  /** Unified health check — pings only the active provider. */
  health: publicProcedure.query(async () => {
    const providerId = await getSetting(SETTING_KEYS.ACTIVE_PROVIDER, PROVIDERS.OLLAMA);
    switch (providerId) {
      case PROVIDERS.COPILOT:
      case PROVIDERS.OLLAMA: {
        const provider = getProvider(providerId);
        const ok = await provider.ping();
        const url = await provider.url();
        return { provider: provider.id, label: provider.label, ok, url };
      }
      default:
        throw new Error(`unknown provider: ${providerId}`);
    }
  }),

  ollamaModels: publicProcedure.query(async () => {
    const provider = getProvider(PROVIDERS.OLLAMA);
    if (!(await provider.ping())) return [];
    return provider.listModels();
  }),

  copilotModels: publicProcedure.query(async () => {
    const provider = getProvider(PROVIDERS.COPILOT);
    if (!(await provider.ping())) return [];
    return provider.listModels();
  }),

  listModelsByProvider: publicProcedure
    .input(z.object({ provider: z.enum([PROVIDERS.OLLAMA, PROVIDERS.COPILOT]) }))
    .query(async ({ input }) => {
      switch (input.provider) {
        case PROVIDERS.COPILOT:
        case PROVIDERS.OLLAMA: {
          const provider = getProvider(input.provider);
          if (!(await provider.ping())) return [];
          return provider.listModels();
        }
        default:
          throw new Error(`unknown provider: ${input.provider}`);
      }
    }),

  activeModel: publicProcedure.query(async () => {
    const provider = (await getSetting(
      SETTING_KEYS.ACTIVE_PROVIDER,
      PROVIDERS.OLLAMA,
    )) as ProviderId;
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
    const provider = (await getSetting(
      SETTING_KEYS.ACTIVE_PROVIDER,
      PROVIDERS.OLLAMA,
    )) as ProviderId;
    const fallback = provider === PROVIDERS.COPILOT ? DEFAULT_COPILOT_MODEL : DEFAULT_OLLAMA_MODEL;
    return await getSetting(SETTING_KEYS.SECONDARY_MODEL, fallback);
  }),

  setSecondaryModel: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await setSetting(SETTING_KEYS.SECONDARY_MODEL, input.name);
      return { ok: true };
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

  copilotCliUrl: publicProcedure.query(async () => {
    return await getSetting(SETTING_KEYS.COPILOT_CLI_URL, COPILOT_CLI_URL);
  }),

  setCopilotCliUrl: publicProcedure
    .input(z.object({ url: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await setSetting(SETTING_KEYS.COPILOT_CLI_URL, input.url.replace(/\/$/, ''));
      return { ok: true };
    }),

  ollamaUrl: publicProcedure.query(async () => {
    return await getSetting(SETTING_KEYS.OLLAMA_URL, OLLAMA_URL);
  }),

  setOllamaUrl: publicProcedure
    .input(z.object({ url: z.string().url().min(1) }))
    .mutation(async ({ input }) => {
      await setSetting(SETTING_KEYS.OLLAMA_URL, input.url.replace(/\/$/, ''));
      return { ok: true };
    }),
});
