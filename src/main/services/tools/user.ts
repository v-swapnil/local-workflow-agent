import { z } from 'zod';
import { requestUserInput } from '../approvals.js';
import type { Tool } from './types.js';

export const askUserTool: Tool<
  { question: string; context?: string; choices?: string[] },
  { answer: string }
> = {
  name: 'ask_user',
  description:
    'Ask the user a question and wait for their response. Use this when you need clarification, confirmation, or additional information from the user to proceed with the task.',
  schema: z.object({
    question: z.string().min(1).describe('The question to ask the user'),
    context: z.string().optional().describe('Additional context to help the user understand the question'),
    choices: z.array(z.string()).optional().describe('Optional list of choices for the user to pick from'),
  }),
  needsApproval: false,
  run: async ({ question, context, choices }, ctx) => {
    if (!ctx.taskId) {
      return { answer: '' };
    }
    const answer = await requestUserInput(ctx.taskId, question, { context, choices }, ctx.signal);
    return { answer };
  },
};
