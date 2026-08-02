import { ToolName } from '@shared/agent';

export interface ToolResultV2 {
  status: 'success' | 'error' | 'cancelled';
  toolName: ToolName;
  errorCode?: string | number | null;
  content: string;
  duration: number;
}

interface ToolResultOptions {
  status?: 'success' | 'error' | 'cancelled';
  toolName: ToolName;
  content: string;
  errorCode?: number | string | null;
  duration: number;
}

export class ToolResultSuccess {
  content: string;

  constructor(options: ToolResultOptions) {
    this.content = options.content;
  }

  getMessage() {
    return this.content;
  }

  getToolResult() {
    return {};
  }
}

interface ToolResultErrorOptions {
  toolName: ToolName;
  errorCode: string | number;
  message: string;
  duration: number;
}

export class ToolResultError extends Error {
  errorCode: string | number;
  toolName: ToolName;

  constructor(options: ToolResultErrorOptions) {
    super(options.message);
    this.name = 'ToolResultError';
    this.errorCode = options.errorCode;
    this.toolName = options.toolName;
  }

  getMessage() {
    return `[${this.errorCode}] ${this.message}`;
  }

  getToolResult() {
    const message = this.getMessage();
    return {
      status: 'error',
      errorCode: this.errorCode,
      content: message,
      toolName: this.toolName,
    };
  }
}
