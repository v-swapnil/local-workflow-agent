import { trpc } from '../trpc';
import { PROVIDERS } from '@shared/constants';
import type { ProviderId } from '@shared/types';
import { OllamaPanel } from './modelManager/OllamaPanel';
import { CopilotPanel } from './modelManager/CopilotPanel';
import { Button } from './ui/button';

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
            <Button
              key={id}
              variant={provider === id ? 'default' : 'outline'}
              size="sm"
              className="font-mono uppercase tracking-widest2"
              onClick={() => setActiveProvider.mutate({ provider: id })}
              disabled={setActiveProvider.isPending}
            >
              {id === PROVIDERS.OLLAMA ? 'Ollama (local)' : 'Copilot CLI'}
            </Button>
          ))}
        </div>
      </div>

      {provider === PROVIDERS.OLLAMA ? <OllamaPanel /> : <CopilotPanel />}
    </div>
  );
}
