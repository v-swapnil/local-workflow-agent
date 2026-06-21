import { AGENT_KIND, type AgentKind } from '@shared/constants';

export interface AgentFormState {
  id?: string;
  name: string;
  role: string;
  systemPrompt: string;
  tools: string[];
  temperature: number;
  description: string;
  kind: AgentKind;
}

export const BLANK: AgentFormState = {
  name: '',
  role: '',
  systemPrompt: '',
  tools: [],
  temperature: 0.2,
  description: '',
  kind: AGENT_KIND.PLANNER_EXECUTOR,
};
