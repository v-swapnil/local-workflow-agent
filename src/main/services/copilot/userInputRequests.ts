import { requestUserInput } from '../approvals';
import { UserInputRequest } from '../approvals/types';

interface UserInputResponse {
  answer: string;
  wasFreeform: boolean;
}

export async function resolveUserInputRequest({
  taskId,
  request,
  signal,
}: {
  taskId: string;
  request: UserInputRequest;
  signal?: AbortSignal;
}): Promise<UserInputResponse> {
  const answer = await requestUserInput(taskId, request, signal);

  return { answer, wasFreeform: !request.choices?.includes(answer) };
}
