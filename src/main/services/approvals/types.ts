import { ApprovalRequestRecord } from '@shared/schema';

export type ApprovalDecision = 'approve' | 'deny';

export interface PendingApproval {
  request: ApprovalRequestRecord;
  resolve: (d: ApprovalDecision) => void;
}

export interface PendingUserInput {
  taskId: string;
  resolve: (answer: string) => void;
}

export interface UserInputRequest {
  question: string;
  description?: string;
  choices?: string[];
}

export interface UserInputResponse {
  answer: string;
}
