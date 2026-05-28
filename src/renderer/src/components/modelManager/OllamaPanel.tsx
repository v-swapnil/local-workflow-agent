import { trpc } from '../../trpc';
import { OLLAMA_URL } from '@shared/constants';
import { Pill } from '../Pill';
import { formatBytes } from './modelManagerUtils';
import { ModelDropdown } from './ModelDropdown';

export function OllamaPanel() {
  const utils = trpc.useUtils();
  const health = trpc.llm.ollamaHealth.useQuery(undefined, { refetchInterval: 5000 });
  const models = trpc.llm.listModels.useQuery(undefined, { refetchInterval: 8000 });
  const active = trpc.llm.activeModel.useQuery();
  const setActive = trpc.llm.setActiveModel.useMutation({
    onSuccess: () => utils.llm.activeModel.invalidate(),
  });
  const secondary = trpc.llm.secondaryModel.useQuery();
  const setSecondary = trpc.llm.setSecondaryModel.useMutation({
    onSuccess: () => utils.llm.secondaryModel.invalidate(),
  });
  const del = trpc.llm.deleteModel.useMutation({
    onSuccess: () => utils.llm.listModels.invalidate(),
  });

  const ollamaOk = health.data?.ok === true;
  const ollamaState = health.isLoading ? 'checking' : ollamaOk ? 'online' : 'offline';
  const modelList = models.data ?? [];

  return (
    <>
      <div className="rounded-lg border border-ink-800/40 bg-ink-900/15 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
              provider
            </div>
            <div className="mt-1 font-mono text-ui-base font-medium text-ink-50">Ollama</div>
            <div className="font-mono text-ui-2xs text-ink-500">
              {health.data?.url ?? OLLAMA_URL}
            </div>
          </div>
          <Pill ok={health.isLoading ? undefined : ollamaOk} label={ollamaState} />
        </div>
        {!ollamaOk && !health.isLoading && (
          <div className="rounded border border-ink-700 bg-ink-950 px-4 py-3 font-mono text-ui-sm text-ink-300">
            <div className="mb-1 text-amber">Ollama not detected.</div>
            Install from <span className="text-ink-100">ollama.com/download</span>, then run{' '}
            <code className="text-amber">ollama serve</code>. ASE will pick it up automatically.
            {health.error?.message && (
              <div className="mt-2 text-signal-err">query error: {health.error.message}</div>
            )}
            {health.data?.attempts?.length ? (
              <div className="mt-2 space-y-1">
                {health.data.attempts.map((a, idx) => (
                  <div key={`${a.url}-${idx}`} className="text-ink-500">
                    {a.url} {a.ok ? 'ok' : a.status ? `status ${a.status}` : (a.error ?? 'failed')}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-ink-800/40 bg-ink-900/15 p-5">
        <div className="mb-4 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
          installed models
        </div>
        {!ollamaOk ? (
          <div className="font-mono text-ui-xs text-ink-500">—</div>
        ) : modelList.length === 0 ? (
          <div className="font-mono text-ui-xs text-ink-500">
            no models installed yet. run{' '}
            <code className="text-amber">ollama pull &lt;model&gt;</code> in your terminal.
          </div>
        ) : (
          <div className="space-y-4">
            <ModelDropdown
              label="main model"
              description="Primary model used for tasks and chat"
              models={modelList}
              value={active.data ?? ''}
              onChange={(name) => setActive.mutate({ name })}
            />
            <ModelDropdown
              label="secondary model"
              description="Lighter model for sub-tasks and minor operations"
              models={modelList}
              value={secondary.data ?? ''}
              onChange={(name) => setSecondary.mutate({ name })}
            />
            <div className="border-t border-ink-800/30 pt-4">
              <div className="mb-2 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
                manage models
              </div>
              <ul className="space-y-1">
                {modelList.map((m) => (
                  <li
                    key={m.name}
                    className="flex items-center justify-between rounded px-3 py-1.5 hover:bg-ink-800/20"
                  >
                    <div>
                      <span className="font-mono text-ui-sm text-ink-100">{m.name}</span>
                      <span className="ml-2 font-mono text-ui-2xs text-ink-500">
                        {m.sizeBytes ? formatBytes(m.sizeBytes) : ''}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete ${m.name}?`)) del.mutate({ name: m.name });
                      }}
                      className="btn-danger !py-0.5 !px-2 text-ui-2xs"
                    >
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
