import { trpc } from '../trpc';
import { PROVIDERS } from '@shared/constants';
import type { ProviderId } from '@shared/types';
import { OllamaPanel } from './modelManager/OllamaPanel';
import { CopilotPanel } from './modelManager/CopilotPanel';

export function ModelManager() {
  const utils = trpc.useUtils();
  const activeProvider = trpc.llm.activeProvider.useQuery();
  const setActiveProvider = trpc.llm.setActiveProvider.useMutation({
    onSuccess: () => {
      utils.llm.activeProvider.invalidate();
    },
  });

  const provider: ProviderId = activeProvider.data ?? PROVIDERS.OLLAMA;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-ink-800/40 bg-ink-900/15 p-5">
        <div className="mb-3 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
          active provider
        </div>
        <div className="flex items-center gap-2">
          {[PROVIDERS.OLLAMA, PROVIDERS.COPILOT].map((id) => (
            <button
              key={id}
              className={`rounded border px-4 py-2 font-mono text-ui-sm uppercase tracking-widest2 transition-colors ${
                provider === id
                  ? 'border-amber/30 bg-amber/8 text-amber'
                  : 'border-ink-700/50 text-ink-300 hover:border-ink-600'
              }`}
              onClick={() => setActiveProvider.mutate({ provider: id })}
              disabled={setActiveProvider.isPending}
            >
              {id === PROVIDERS.OLLAMA ? 'Ollama (local)' : 'Copilot CLI'}
            </button>
          ))}
        </div>
      </div>

      {provider === PROVIDERS.OLLAMA ? <OllamaPanel /> : <CopilotPanel />}
    </div>
  );
}
