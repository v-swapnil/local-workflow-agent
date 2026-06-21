export interface AgentFormState {
  id?: string;
  name: string;
  role: string;
  systemPrompt: string;
  tools: string[];
  temperature: number;
  description: string;
}

export const BLANK: AgentFormState = {
  name: '',
  role: '',
  systemPrompt: '',
  tools: [],
  temperature: 0.2,
  description: '',
};
