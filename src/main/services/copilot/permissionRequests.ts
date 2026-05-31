import { PermissionRequest, PermissionRequestResult } from '@github/copilot-sdk';
import { requestApproval } from '../approvals';
import { ToolName } from '@shared/agent';
import { getToolCallById } from './events';

export async function resolvePermissionRequest({
  taskId,
  request,
  signal,
}: {
  taskId: string;
  request: PermissionRequest;
  signal?: AbortSignal;
}): Promise<PermissionRequestResult> {
  const toolCall = request.toolCallId ? await getToolCallById(taskId, request.toolCallId) : null;
  const toolName = (toolCall?.tool ?? request.kind) as ToolName;
  const decision = await requestApproval(taskId, toolName, toolCall?.arguments, signal);

  if (decision === 'approve' || decision === 'approve_session') {
    return { kind: 'approve-once' };
  }

  return { kind: 'no-result' };
}
