// TODO: remove this
export interface ApprovalReq {
  id: number;
  tool: string;
  args: unknown;
  ts: number;
}

export interface UserInputReq {
  id: number;
  question: string;
  description?: string;
  choices?: string[];
  allowMultiple?: boolean;
  ts: number;
}
