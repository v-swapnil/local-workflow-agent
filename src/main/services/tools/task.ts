import { z } from 'zod';
import { createTask } from '../store.js';
import { enqueueTask } from '../../orchestrator/queue.js';
import type { Tool } from './types.js';

export const createTaskTool: Tool<{ prompt: string }, { taskId: string; status: string }> = {
  name: 'create_task',
  description:
    'Create a new task in the current session. The task will be queued and ' +
    'executed after the current task completes.\n\n' +
    'Use this to break complex work into smaller, focused tasks when the current task ' +
    'has grown too large, or when you want to defer follow-up work.\n\n' +
    'The new task runs in the same session and workspace with access to all tools ' +
    'and any changes made by the current task.\n\n' +
    'Parameters:\n' +
    '- prompt: detailed description of what the new task should accomplish',
  schema: z.object({
    prompt: z.string().min(1).describe('Detailed prompt for the new task.'),
  }),
  needsApproval: false,
  run: async ({ prompt }, ctx) => {
    if (!ctx.sessionId) {
      throw new Error('create_task requires a session context');
    }
    const task = createTask(ctx.sessionId, prompt);
    enqueueTask(task.id);
    return { taskId: task.id, status: task.status };
  },
};
