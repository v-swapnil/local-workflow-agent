import { PendingApproval, PendingUserInput } from './types';

export const pendingApprovals = new Map<number, PendingApproval>();
export const pendingUserInputs = new Map<string, PendingUserInput>();
