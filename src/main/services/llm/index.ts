import type { LLMProvider } from './provider.js';
import { OllamaProvider } from './ollama.js';
import { CopilotProvider } from './copilot-provider.js';
import { PROVIDERS } from '@shared/constants';
import type { ProviderId } from '@shared/types';

let _ollama: OllamaProvider | null = null;
let _copilot: CopilotProvider | null = null;

export function getProvider(id: ProviderId = PROVIDERS.OLLAMA): LLMProvider {
  switch (id) {
    case PROVIDERS.OLLAMA:
      if (!_ollama) _ollama = new OllamaProvider();
      return _ollama;

    case PROVIDERS.COPILOT:
      if (!_copilot) _copilot = new CopilotProvider();
      return _copilot;

    default:
      throw new Error(`unknown provider: ${id}`);
  }
}
