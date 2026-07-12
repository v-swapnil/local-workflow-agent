import { z } from 'zod';
import { addMemory, MEMORY_TYPES } from '../memories.js';
import type { Tool } from './types.js';

const SCOPES = ['session', 'workspace'] as const;

export const createMemoryTool: Tool<
  { scope?: 'session' | 'workspace'; type: (typeof MEMORY_TYPES)[number]; content: string },
  { ok: true; memory: unknown }
> = {
  name: 'create_memory',
  description:
    'Persist a new memory for future reference.\n' +
    'Scope:\n' +
    '- session (default): tied to a specific session\n' +
    '- workspace: persists across all sessions in this workspace — use for codebase facts, ' +
    'conventions, architectural decisions, and preferences\n' +
    'Memory types:\n' +
    '- fact: codebase knowledge ("auth uses JWT RS256", "DB is Postgres 15")\n' +
    '- preference: user preferences ("prefers functional style", "always use pnpm")\n' +
    '- procedural: how-to knowledge ("to deploy, run pnpm run deploy")\n' +
    '- observation: what you noticed during exploration\n' +
    '- summary: high-level summary of completed work\n' +
    '- semantic: conceptual/domain knowledge',
  schema: z.object({
    scope: z.enum(SCOPES).optional().default('session'),
    type: z.enum(MEMORY_TYPES),
    content: z.string().min(1),
  }),
  needsApproval: false,
  run: async ({ scope = 'session', type, content }, ctx) => {
    if (scope === 'workspace') {
      const memory = addMemory({
        workspaceId: ctx.workspaceId,
        type,
        content,
      });
      return { ok: true, memory };
    }
    const memory = addMemory({
      workspaceId: ctx.workspaceId,
      sessionId: ctx.sessionId,
      taskId: ctx.taskId,
      type,
      content,
    });
    return { ok: true, memory };
  },
};
