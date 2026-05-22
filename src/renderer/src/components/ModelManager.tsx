import { useState } from 'react';
import { trpc } from '../trpc';
import { OLLAMA_URL, PROVIDERS } from '@shared/constants';
import type { ProviderId } from '@shared/types';

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
      {/* Provider toggle */}
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

/* ---------- Ollama Panel ---------- */

function OllamaPanel() {
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

/* ---------- Copilot Panel ---------- */

function CopilotPanel() {
  const utils = trpc.useUtils();
  const copilotHealth = trpc.llm.copilotHealth.useQuery(undefined, { refetchInterval: 5000 });
  const copilotModels = trpc.llm.copilotModels.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const activeModel = trpc.llm.activeModel.useQuery();
  const setActiveModel = trpc.llm.setActiveModel.useMutation({
    onSuccess: () => utils.llm.activeModel.invalidate(),
  });
  const secondary = trpc.llm.secondaryModel.useQuery();
  const setSecondary = trpc.llm.setSecondaryModel.useMutation({
    onSuccess: () => utils.llm.secondaryModel.invalidate(),
  });
  const cliUrl = trpc.llm.copilotCliUrl.useQuery();
  const setCliUrl = trpc.llm.setCopilotCliUrl.useMutation({
    onSuccess: () => {
      utils.llm.copilotCliUrl.invalidate();
      utils.llm.copilotHealth.invalidate();
      utils.llm.copilotModels.invalidate();
    },
  });
  const retryCopilot = trpc.llm.copilotRetry.useMutation({
    onSuccess: () => {
      utils.llm.copilotHealth.invalidate();
      utils.llm.copilotModels.invalidate();
    },
  });
  const [urlDraft, setUrlDraft] = useState('');
  const [editing, setEditing] = useState(false);

  const ok = copilotHealth.data?.ok === true;
  const state = copilotHealth.isLoading ? 'checking' : ok ? 'online' : 'offline';
  const modelList = copilotModels.data ?? [];

  return (
    <>
      <div className="rounded-lg border border-ink-800/40 bg-ink-900/15 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
              provider
            </div>
            <div className="mt-1 font-mono text-ui-base font-medium text-ink-50">
              GitHub Copilot
            </div>
            <div className="font-mono text-ui-xs text-ink-500">
              {editing ? (
                <form
                  className="mt-1 flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (urlDraft.trim()) {
                      setCliUrl.mutate({ url: urlDraft.trim() });
                      setEditing(false);
                    }
                  }}
                >
                  <input
                    autoFocus
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    className="w-40 rounded border border-ink-700 bg-ink-950 px-2 py-0.5 font-mono text-ui-xs text-ink-100 focus:border-amber focus:outline-none"
                    placeholder="localhost:49393"
                  />
                  <button type="submit" className="font-mono text-ui-xs text-amber hover:underline">
                    save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="font-mono text-ui-xs text-ink-500 hover:underline"
                  >
                    cancel
                  </button>
                </form>
              ) : (
                <>
                  {copilotHealth.data?.url ?? cliUrl.data ?? '...'}{' '}
                  <button
                    onClick={() => {
                      setUrlDraft(cliUrl.data ?? '');
                      setEditing(true);
                    }}
                    className="text-amber hover:underline"
                  >
                    edit
                  </button>
                </>
              )}
            </div>
          </div>
          <Pill ok={copilotHealth.isLoading ? undefined : ok} label={state} />
        </div>
        {!ok && !copilotHealth.isLoading && (
          <div className="rounded-lg border border-ink-700/40 bg-ink-950/80 px-4 py-3 font-mono text-ui-xs text-ink-300">
            <div className="mb-1 text-amber">Copilot CLI not reachable.</div>
            Start the server with <code className="text-amber">copilot --stdio=false</code>, then
            check the URL above matches the port.
            <div className="mt-2">
              <button
                type="button"
                onClick={() => retryCopilot.mutate()}
                disabled={retryCopilot.isPending}
                className="rounded-md border border-ink-700/50 px-2 py-1 font-mono text-ui-xs uppercase tracking-widest2 text-amber transition-colors hover:border-amber/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {retryCopilot.isPending ? 'retrying...' : 'retry now'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-ink-800/40 bg-ink-900/15 p-5">
        <div className="mb-4 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
          available models
        </div>
        {!ok ? (
          <div className="font-mono text-ui-xs text-ink-500">—</div>
        ) : modelList.length === 0 ? (
          <div className="font-mono text-ui-xs text-ink-500">
            no models returned — check authentication
          </div>
        ) : (
          <div className="space-y-4">
            <ModelDropdown
              label="main model"
              description="Primary model for tasks, planning, and chat"
              models={modelList}
              value={activeModel.data ?? ''}
              onChange={(name) => setActiveModel.mutate({ name })}
            />
            <ModelDropdown
              label="secondary model"
              description="Lighter model for sub-tasks and minor operations"
              models={modelList}
              value={secondary.data ?? ''}
              onChange={(name) => setSecondary.mutate({ name })}
            />
          </div>
        )}
      </div>
    </>
  );
}

function ModelDropdown({
  label,
  description,
  models,
  value,
  onChange,
}: {
  label: string;
  description: string;
  models: { name: string; sizeBytes?: number }[];
  value: string;
  onChange: (name: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 font-mono text-ui-xs font-medium text-ink-200">{label}</div>
      <div className="mb-2 font-mono text-ui-2xs text-ink-500">{description}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-md border border-ink-700/50 bg-ink-950/80 px-3 py-2 font-mono text-ui-sm text-ink-100 transition-colors focus:border-amber/30 focus:outline-none"
      >
        {models.map((m) => (
          <option key={m.name} value={m.name}>
            {m.name}
            {m.sizeBytes ? ` (${formatBytes(m.sizeBytes)})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

function Pill({ ok, label }: { ok?: boolean; label: string }) {
  const color =
    ok === undefined
      ? 'border-ink-700 text-ink-400'
      : ok
        ? 'border-signal-ok text-signal-ok'
        : 'border-signal-err text-signal-err';
  return (
    <span
      className={`rounded border px-2 py-0.5 font-mono text-ui-xs uppercase tracking-widest2 ${color}`}
    >
      {label}
    </span>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
