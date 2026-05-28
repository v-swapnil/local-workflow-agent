import { z } from 'zod';
import { observable } from '@trpc/server/observable';
import { router, publicProcedure } from './trpc.js';
import { invokeTool, listTools, listToolNames } from '../services/tools/registry.js';
import type { ToolName } from '../services/tools/types.js';

const TOOL_NAMES = listToolNames() as [ToolName, ...ToolName[]];

export const toolRouter = router({
  list: publicProcedure.query(() => listTools()),

  invoke: publicProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        name: z.enum(TOOL_NAMES),
        args: z.unknown(),
      }),
    )
    .mutation(({ input }) =>
      invokeTool(input.name, input.args, { workspaceId: input.workspaceId }),
    ),

  // Streamed invocation (for run_shell / run_tests) — emits log lines + final result.
  invokeStream: publicProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        name: z.enum(TOOL_NAMES),
        args: z.unknown(),
      }),
    )
    .subscription(({ input }) => {
      return observable<
        | { type: 'log'; stream: 'stdout' | 'stderr'; text: string }
        | { type: 'done'; ok: boolean; output?: unknown; error?: string; durationMs: number }
      >((emit) => {
        const ctrl = new AbortController();
        (async () => {
          const result = await invokeTool(input.name, input.args, {
            workspaceId: input.workspaceId,
            signal: ctrl.signal,
            onLog: (chunk: { stream: 'stdout' | 'stderr'; text: string }) =>
              emit.next({ type: 'log', ...chunk }),
          });
          emit.next({ type: 'done', ...result });
          emit.complete();
        })();
        return () => ctrl.abort();
      });
    }),
});
