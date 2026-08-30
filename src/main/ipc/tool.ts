import { z } from 'zod';
import { router, publicProcedure } from './trpc.js';
import { invokeTool, listTools, listToolNames } from '../services/tools/registry.js';
import { ToolName } from '@shared/agent.js';

export const toolRouter = router({
  list: publicProcedure.query(() => listTools()),

  invoke: publicProcedure
    .input(
      z.object({
        workspaceId: z.number(),
        name: z.enum(listToolNames() as [ToolName, ...ToolName[]]),
        args: z.record(z.string(), z.unknown()),
      }),
    )
    .mutation(({ input }) =>
      invokeTool(input.name, input.args, { workspaceId: input.workspaceId, workspacePath: '' }),
    ),
});
