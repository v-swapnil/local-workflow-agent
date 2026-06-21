export const APP_NAME = 'ASE';
export const APP_BUNDLE_ID = 'com.ase.app';
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5-coder:7b';
export const DEFAULT_COPILOT_MODEL = 'claude-sonnet-4.5';
export const OLLAMA_URL = 'http://127.0.0.1:11434';
export const COPILOT_CLI_URL = 'localhost:49393';
export const PROVIDERS = { COPILOT: 'copilot', OLLAMA: 'ollama' } as const;

/** Controls which orchestration nodes run for a custom agent. Copilot ignores this. */
export const AGENT_KIND = {
  PLANNER_EXECUTOR: 'planner+executor',
  EXECUTOR: 'executor',
  PLANNER: 'planner',
} as const;

export type AgentKind = (typeof AGENT_KIND)[keyof typeof AGENT_KIND];
