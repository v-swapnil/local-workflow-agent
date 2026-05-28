import { PROVIDERS } from '@shared/constants';
import type { ProviderId } from '@shared/types';

export interface AgentFormState {
  id?: string;
  name: string;
  role: string;
  model: string;
  systemPrompt: string;
  tools: string;
  temperature: number;
  graphMode: 'full' | 'direct';
  maxIterations: number;
  description: string;
  provider: ProviderId;
}

export const BLANK: AgentFormState = {
  name: '',
  role: '',
  model: '',
  systemPrompt: '',
  tools: '',
  temperature: 0.2,
  graphMode: 'full',
  maxIterations: 10,
  description: '',
  provider: PROVIDERS.OLLAMA,
};
