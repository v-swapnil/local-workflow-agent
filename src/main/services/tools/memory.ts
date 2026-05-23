import { z } from 'zod';
import { addSessionMemory, listSessionMemories, MEMORY_TYPES } from '../memories.js';
import type { Tool } from './types.js';
import { getTask } from '../store.js';

export const readMemoriesTool: Tool<
  { sessionId: string; limit?: number; type?: (typeof MEMORY_TYPES)[number] },
  { sessionId: string; total: number; memories: unknown[] }
> = {
  name: 'read_memories',
  description: 'Read persisted memories for a specific session.',
  schema: z.object({
    sessionId: z.string().min(1),
    limit: z.number().int().min(1).max(200).optional(),
    type: z.enum(MEMORY_TYPES).optional(),
  }),
  needsApproval: false,
  run: async ({ sessionId, limit = 100, type }) => {
    const all = listSessionMemories(sessionId);
    const filtered = type ? all.filter((m) => m.type === type) : all;
    return {
      sessionId,
      total: filtered.length,
      memories: filtered.slice(0, limit),
    };
  },
};

export const addMemoryTool: Tool<
  {
    sessionId: string;
    type: (typeof MEMORY_TYPES)[number];
    content: string;
    taskId?: string;
  },
  { ok: true; memory: unknown }
> = {
  name: 'add_memory',
  description: 'Add a new persisted memory to a session.',
  schema: z.object({
    sessionId: z.string().min(1),
    type: z.enum(MEMORY_TYPES),
    content: z.string().min(1),
    taskId: z.string().min(1).optional(),
  }),
  needsApproval: false,
  run: async ({ sessionId, type, content, taskId }, ctx) => {
    const memory = addSessionMemory({
      sessionId,
      taskId: taskId ?? ctx.taskId ?? null,
      type,
      content,
    });
    return { ok: true, memory };
  },
};
