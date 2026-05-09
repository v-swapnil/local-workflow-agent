import { shell } from 'electron';
import { z } from 'zod';
import { publicProcedure, router } from './trpc.js';
import { logsDir } from '../util/paths.js';
import { getSetting, setSetting, SETTING_KEYS } from '../services/settings.js';

const themeSchema = z.enum(['dark', 'light']);
const textSizeSchema = z.enum(['compact', 'default', 'comfortable']);

export const settingsRouter = router({
  theme: publicProcedure.query(async () => {
    const saved = await getSetting(SETTING_KEYS.UI_THEME);
    return themeSchema.catch('dark').parse(saved ?? 'dark');
  }),

  setTheme: publicProcedure.input(z.object({ value: themeSchema })).mutation(async ({ input }) => {
    await setSetting(SETTING_KEYS.UI_THEME, input.value);
    return { ok: true as const };
  }),

  textSize: publicProcedure.query(async () => {
    const saved = await getSetting(SETTING_KEYS.UI_TEXT_SIZE);
    return textSizeSchema.catch('compact').parse(saved ?? 'compact');
  }),

  setTextSize: publicProcedure
    .input(z.object({ value: textSizeSchema }))
    .mutation(async ({ input }) => {
      await setSetting(SETTING_KEYS.UI_TEXT_SIZE, input.value);
      return { ok: true as const };
    }),

  queueConcurrency: publicProcedure.query(async () => {
    const saved = await getSetting(SETTING_KEYS.QUEUE_CONCURRENCY);
    const n = saved ? parseInt(saved, 10) : 1;
    return isNaN(n) || n < 1 ? 1 : Math.min(n, 8);
  }),

  setQueueConcurrency: publicProcedure
    .input(z.object({ value: z.number().int().min(1).max(8) }))
    .mutation(async ({ input }) => {
      await setSetting(SETTING_KEYS.QUEUE_CONCURRENCY, String(input.value));
      return { ok: true as const };
    }),

  openLogsFolder: publicProcedure.mutation(async () => {
    const dir = logsDir();
    await shell.openPath(dir);
    return { ok: true as const, path: dir };
  }),

  kanbanAutoClear: publicProcedure.query(async () => {
    const saved = await getSetting(SETTING_KEYS.KANBAN_AUTO_CLEAR);
    return saved !== 'false'; // default true
  }),

  setKanbanAutoClear: publicProcedure
    .input(z.object({ value: z.boolean() }))
    .mutation(async ({ input }) => {
      await setSetting(SETTING_KEYS.KANBAN_AUTO_CLEAR, String(input.value));
      return { ok: true as const };
    }),

  kanbanDefaultView: publicProcedure.query(async () => {
    const saved = await getSetting(SETTING_KEYS.KANBAN_DEFAULT_VIEW);
    return (saved === 'list' ? 'list' : 'board') as 'board' | 'list';
  }),

  setKanbanDefaultView: publicProcedure
    .input(z.object({ value: z.enum(['board', 'list']) }))
    .mutation(async ({ input }) => {
      await setSetting(SETTING_KEYS.KANBAN_DEFAULT_VIEW, input.value);
      return { ok: true as const };
    }),

  useWorktrees: publicProcedure.query(async () => {
    const saved = await getSetting(SETTING_KEYS.USE_WORKTREES);
    return saved === '1';
  }),

  setUseWorktrees: publicProcedure
    .input(z.object({ value: z.boolean() }))
    .mutation(async ({ input }) => {
      await setSetting(SETTING_KEYS.USE_WORKTREES, input.value ? '1' : '0');
      return { ok: true as const };
    }),
});
