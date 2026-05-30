import { z } from 'zod';
import {
  addMemory,
  listSessionMemories,
  listWorkspaceMemories,
  MEMORY_TYPES,
} from '../memories.js';
import type { Tool } from './types.js';

const SCOPES = ['session', 'workspace'] as const;

export const readMemoriesTool: Tool<
  { scope?: 'session' | 'workspace'; sessionId?: string; limit?: number; type?: (typeof MEMORY_TYPES)[number] },
  { scope: string; total: number; memories: unknown[] }
> = {
  name: 'read_memories',
  description:
    'Read persisted memories.\n\n' +
    'Scope:\n' +
    '- session (default): memories for a specific session (requires sessionId)\n' +
    '- workspace: memories scoped to the current workspace, shared across sessions\n\n' +
    'Returns memories sorted by creation time. Filter by type to narrow results.\n\n' +
    'Memory types: semantic, episodic, procedural, preference, fact, summary, observation',
  schema: z.object({
    scope: z.enum(SCOPES).optional().default('session'),
    sessionId: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    type: z.enum(MEMORY_TYPES).optional(),
  }),
  needsApproval: false,
  run: async ({ scope = 'session', sessionId, limit = 100, type }, ctx) => {
    if (scope === 'workspace') {
      const all = listWorkspaceMemories(ctx.workspaceId, type);
      return {
        scope: 'workspace',
        total: all.length,
        memories: all.slice(0, limit),
      };
    }
    const sid = sessionId ?? ctx.sessionId;
    if (!sid) return { scope: 'session', total: 0, memories: [] };
    const all = listSessionMemories(sid);
    const filtered = type ? all.filter((m) => m.type === type) : all;
    return {
      scope: 'session',
      total: filtered.length,
      memories: filtered.slice(0, limit),
    };
  },
};

export const addMemoryTool: Tool<
  {
    scope?: 'session' | 'workspace';
    sessionId?: string;
    type: (typeof MEMORY_TYPES)[number];
    content: string;
    taskId?: string;
  },
  { ok: true; memory: unknown }
> = {
  name: 'add_memory',
  description:
    'Persist a new memory for future reference.\n\n' +
    'Scope:\n' +
    '- session (default): tied to a specific session\n' +
    '- workspace: persists across all sessions in this workspace — use for codebase facts, ' +
    'conventions, architectural decisions, and preferences\n\n' +
    'Memory types:\n' +
    '- fact: codebase knowledge ("auth uses JWT RS256", "DB is Postgres 15")\n' +
    '- preference: user preferences ("prefers functional style", "always use pnpm")\n' +
    '- procedural: how-to knowledge ("to deploy, run pnpm run deploy")\n' +
    '- observation: what you noticed during exploration\n' +
    '- summary: high-level summary of completed work\n' +
    '- semantic: conceptual/domain knowledge',
  schema: z.object({
    scope: z.enum(SCOPES).optional().default('session'),
    sessionId: z.string().min(1).optional(),
    type: z.enum(MEMORY_TYPES),
    content: z.string().min(1),
    taskId: z.string().min(1).optional(),
  }),
  needsApproval: false,
  run: async ({ scope = 'session', sessionId, type, content, taskId }, ctx) => {
    if (scope === 'workspace') {
      const memory = addMemory({
        workspaceId: ctx.workspaceId,
        type,
        content,
      });
      return { ok: true, memory };
    }
    const memory = addMemory({
      sessionId: sessionId ?? ctx.sessionId,
      taskId: taskId ?? ctx.taskId ?? null,
      type,
      content,
    });
    return { ok: true, memory };
  },
};
