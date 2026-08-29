import { UserInputRequest } from './types';
import { emitUserInputRequested, emitUserInputResponded } from '@main/orchestrator/eventEmitter';
import { pendingRegistry } from './state';
import { getDb } from '@main/db';
import { userInputs } from '@main/db/schema';
import { UserInputRecord } from '@shared/schema';
import { eq } from 'drizzle-orm';

const createUserInput = (input: Omit<UserInputRecord, 'id'>) => {
  return getDb().insert(userInputs).values(input).returning().get();
};

const updateUserInput = (id: number, input: Partial<UserInputRecord>) => {
  return getDb().update(userInputs).set(input).where(eq(userInputs.id, id)).returning().get();
};

/**
 * Block until the user provides a text response.
 * Similar to `requestApproval` but returns a string answer.
 */
export function requestUserInput(
  taskId: number,
  request: UserInputRequest,
  signal?: AbortSignal,
): Promise<string> {
  const result = createUserInput({
    taskId,
    question: request.question,
    description: request.description ?? null,
    choices: request.choices?.join(',') ?? null,
    toolCallId: null,
    decision: null,
    createdAt: Date.now(),
    decidedAt: null,
  });

  return new Promise<string>((resolve, reject) => {
    pendingRegistry.add({
      type: 'user_input',
      taskId,
      referenceId: result.id,
      resolve: (value) => resolve(value ?? ''),
    });
    emitUserInputRequested(taskId, result.id, request.question);

    const onAbort = () => {
      pendingRegistry.remove('user_input', result.id);
      reject(new Error('aborted'));
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export function respondUserInput(id: number, answer: string): boolean {
  const resolved = pendingRegistry.resolve('user_input', id, answer);
  if (!resolved) return false;

  const row = updateUserInput(id, { decision: answer, decidedAt: Date.now() });

  emitUserInputResponded(row.taskId, id, answer);

  return true;
}
