import { trpc } from '../trpc';
import { PROVIDERS } from '@shared/constants';
import type { ProviderId } from '@shared/types';
import { OllamaPanel } from './modelManager/OllamaPanel';
import { CopilotPanel } from './modelManager/CopilotPanel';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';

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
          <ToggleGroup
            type="single"
            value={provider}
            onValueChange={(provider: ProviderId) => setActiveProvider.mutate({ provider })}
            disabled={setActiveProvider.isPending}
            className="gap-1"
          >
            {[PROVIDERS.OLLAMA, PROVIDERS.COPILOT].map((id) => (
              <ToggleGroupItem
                value={id}
                size="sm"
                variant="outline"
                className="font-mono uppercase tracking-widest2 data-[state=on]:border-amber/30 data-[state=on]:bg-amber/8 data-[state=on]:text-amber"
              >
                {id === PROVIDERS.OLLAMA ? 'Ollama (local)' : 'Copilot CLI'}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {provider === PROVIDERS.OLLAMA ? <OllamaPanel /> : <CopilotPanel />}
    </div>
  );
}
