import { z } from 'zod';
import { createTask } from '../workspaces';
import { taskQueue } from '../../orchestrator/queue.js';
import type { Tool } from './types.js';
import { ToolResultV2 } from '@shared/types';

export const createTaskTool: Tool<{ prompt: string }, ToolResultV2> = {
  name: 'create_task',
  description:
    'Create a new task in the current session. The task will be queued and ' +
    'executed after the current task completes.\n' +
    'Use this to break complex work into smaller, focused tasks when the current task ' +
    'has grown too large, or when you want to defer follow-up work.\n' +
    'The new task runs in the same session and workspace with access to all tools ' +
    'and any changes made by the current task.\n' +
    'Parameters:\n' +
    '- prompt: detailed description of what the new task should accomplish',
  schema: z.object({
    prompt: z.string().min(1).describe('Detailed prompt for the new task.'),
  }),
  needsApproval: false,
  run: async ({ prompt }, ctx) => {
    if (!ctx.sessionId) throw new Error('create_task requires a session context');
    const task = createTask(ctx.sessionId, prompt);
    taskQueue.enqueue(task.id);
    return { status: 'success', content: `Task created successfully`, truncated: false };
  },
};

export const taskCompleteTool: Tool<{ summary?: string }, ToolResultV2> = {
  name: 'task_complete',
  description:
    'Signal that the current task is complete.\n' +
    'Call this only after the requested work is finished and verification has been run, ' +
    'or after you have clearly determined no further action is needed. Do not call this ' +
    'while there are outstanding edits, unresolved failures, or pending user questions.\n' +
    'Parameters:\n' +
    '- summary: optional concise summary of what was completed',
  schema: z.object({
    summary: z.string().min(1).optional(),
  }),
  needsApproval: false,
  run: async ({ summary }) => ({
    status: 'success',
    content: `Summary: ${summary ?? 'No summary provided.'}\nTask marked as complete.`,
    truncated: false,
  }),
};
