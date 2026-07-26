import { nanoid } from 'nanoid';
import { UserInputRequest } from './types';
import { taskBus } from '../events';
import { pendingUserInputs } from './state';

/**
 * Block until the user provides a text response.
 * Similar to `requestApproval` but returns a string answer.
 */
export function requestUserInput(
  taskId: string,
  request: UserInputRequest,
  signal?: AbortSignal,
): Promise<string> {
  const requestId = nanoid(10);

  return new Promise<string>((resolve, reject) => {
    pendingUserInputs.set(requestId, { taskId, resolve });
    taskBus.emit(taskId, {
      type: 'user_input.requested',
      taskId,
      ts: Date.now(),
      requestId,
      question: request.question,
      description: request.description,
      choices: request.choices,
    });

    const onAbort = () => {
      pendingUserInputs.delete(requestId);
      reject(new Error('aborted'));
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export function respondUserInput(id: string, answer: string): boolean {
  const p = pendingUserInputs.get(id);
  if (!p) return false;
  pendingUserInputs.delete(id);

  taskBus.emit(p.taskId, {
    type: 'user_input.responded',
    taskId: p.taskId,
    ts: Date.now(),
    requestId: id,
    answer,
  });

  p.resolve(answer);
  return true;
}
