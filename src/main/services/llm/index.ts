import type { LLMProvider } from './provider.js';
import { OllamaProvider } from './ollama.js';
import { CopilotProvider } from './copilot-provider.js';
import type { ProviderId } from '@shared/constants';

let _ollama: OllamaProvider | null = null;
let _copilot: CopilotProvider | null = null;

export function getProvider(id: ProviderId = 'ollama'): LLMProvider {
  if (id === 'ollama') {
    if (!_ollama) _ollama = new OllamaProvider();
    return _ollama;
  }
  if (!_copilot) _copilot = new CopilotProvider();
  return _copilot;
}
