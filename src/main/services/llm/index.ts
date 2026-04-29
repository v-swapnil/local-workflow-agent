import type { LLMProvider } from './provider.js';
import { OllamaProvider } from './ollama.js';
import type { ProviderId } from '@shared/constants';

let _ollama: OllamaProvider | null = null;

export function getProvider(id: ProviderId = 'ollama'): LLMProvider {
  if (id === 'ollama') {
    if (!_ollama) _ollama = new OllamaProvider();
    return _ollama;
  }
  // For 'copilot', the LLMProvider interface isn't used — Copilot has its own
  // agentic runtime accessed via CopilotService + copilot-runner.
  // Return Ollama as fallback for chat/debug panel.
  if (!_ollama) _ollama = new OllamaProvider();
  return _ollama;
}
