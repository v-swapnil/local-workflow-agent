import { requestUserInput } from '../approvals';

interface UserInputRequest {
  question: string;
  choices?: string[];
  allowFreeform?: boolean;
}

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
  const answer = await requestUserInput(
    taskId,
    request.question,
    { choices: request.choices },
    signal,
  );

  return { answer, wasFreeform: !request.choices?.includes(answer) };
}
