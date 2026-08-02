import { z } from 'zod';
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
        args: z.record(z.unknown()),
      }),
    )
    .mutation(({ input }) =>
      invokeTool(input.name, input.args, { workspaceId: input.workspaceId, workspacePath: '' }),
    ),
});
