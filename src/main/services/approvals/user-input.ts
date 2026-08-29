import { nanoid } from 'nanoid';
import { UserInputRequest } from './types';
import { emitUserInputRequested, emitUserInputResponded } from '@main/orchestrator/eventEmitter';
import { pendingUserInputs } from './state';

/**
 * Block until the user provides a text response.
 * Similar to `requestApproval` but returns a string answer.
 */
export function requestUserInput(
  taskId: number,
  request: UserInputRequest,
  signal?: AbortSignal,
): Promise<string> {
  const requestId = nanoid(10);

  return new Promise<string>((resolve, reject) => {
    pendingUserInputs.set(requestId, { taskId, resolve });
    emitUserInputRequested(taskId, request.question);

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

  emitUserInputResponded(p.taskId, answer);

  p.resolve(answer);
  return true;
}
