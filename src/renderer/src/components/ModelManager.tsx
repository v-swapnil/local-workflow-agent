import { useState } from 'react';
import { trpc } from '../trpc';
import { OLLAMA_URL } from '@shared/constants';
import type { ProviderId } from '@shared/constants';

interface PullState {
  status: string;
  completed?: number;
  total?: number;
  error?: string;
  done?: boolean;
}

export function ModelManager() {
  const utils = trpc.useUtils();
  const activeProvider = trpc.llm.activeProvider.useQuery();
  const setActiveProvider = trpc.llm.setActiveProvider.useMutation({
    onSuccess: () => {
      utils.llm.activeProvider.invalidate();
    },
  });

  const provider: ProviderId = activeProvider.data ?? 'ollama';

  return (
    <div className="space-y-6">
      {/* Provider toggle */}
      <div className="rounded border border-ink-800 bg-ink-900/40 p-5">
        <div className="mb-3 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
          active provider
        </div>
        <div className="flex items-center gap-2">
          {(['ollama', 'copilot'] as const).map((id) => (
            <button
              key={id}
              className={`rounded border px-4 py-2 font-mono text-ui-sm uppercase tracking-widest2 transition-colors ${
                provider === id
                  ? 'border-amber-700/60 bg-amber-950/30 text-amber'
                  : 'border-ink-700 text-ink-300 hover:border-ink-600'
              }`}
              onClick={() => setActiveProvider.mutate({ provider: id })}
              disabled={setActiveProvider.isPending}
            >
              {id === 'ollama' ? 'Ollama (local)' : 'Copilot CLI'}
            </button>
          ))}
        </div>
      </div>

      {provider === 'ollama' ? <OllamaPanel /> : <CopilotPanel />}
    </div>
  );
}

/* ---------- Ollama Panel ---------- */

function OllamaPanel() {
  const utils = trpc.useUtils();
  const health = trpc.llm.health.useQuery(undefined, { refetchInterval: 5000 });
  const models = trpc.llm.listModels.useQuery(undefined, { refetchInterval: 8000 });
  const active = trpc.llm.activeModel.useQuery();
  const setActive = trpc.llm.setActiveModel.useMutation({
    onSuccess: () => utils.llm.activeModel.invalidate(),
  });
  const del = trpc.llm.deleteModel.useMutation({
    onSuccess: () => utils.llm.listModels.invalidate(),
  });

  const [pullName, setPullName] = useState('qwen2.5-coder:7b');
  const [pullState, setPullState] = useState<PullState | null>(null);

  trpc.llm.pullModel.useSubscription(
    { name: pullName },
    {
      enabled: pullState?.status === 'starting',
      onData: (msg) => {
        if ('error' in msg) {
          setPullState({ status: 'error', error: msg.error });
          return;
        }
        if (msg.status === 'done') {
          setPullState({ status: 'done', done: true });
          utils.llm.listModels.invalidate();
          return;
        }
        setPullState({
          status: msg.status,
          completed: 'completed' in msg ? msg.completed : undefined,
          total: 'total' in msg ? msg.total : undefined,
        });
      },
      onError: (err) => setPullState({ status: 'error', error: err.message }),
    },
  );

  const ollamaOk = health.data?.ok === true;
  const ollamaState = health.isLoading ? 'checking' : ollamaOk ? 'online' : 'offline';

  return (
    <>
      <div className="rounded border border-ink-800 bg-ink-900/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
              provider
            </div>
            <div className="mt-1 font-serif text-lg text-ink-50">Ollama</div>
            <div className="font-mono text-ui-xs text-ink-500">
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

      <div className="rounded border border-ink-800 bg-ink-900/40">
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-3">
          <div className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
            installed models
          </div>
          <div className="font-mono text-ui-xs text-ink-500">
            active: <span className="text-amber">{active.data ?? '—'}</span>
          </div>
        </div>
        {!ollamaOk ? (
          <div className="px-5 py-6 font-mono text-ui-sm text-ink-500">—</div>
        ) : models.data && models.data.length === 0 ? (
          <div className="px-5 py-6 font-mono text-ui-sm text-ink-500">
            no models installed yet. pull one below.
          </div>
        ) : (
          <ul>
            {models.data?.map((m) => {
              const isActive = m.name === active.data;
              return (
                <li
                  key={m.name}
                  className="flex items-center justify-between border-b border-ink-800/60 px-5 py-2.5 last:border-b-0"
                >
                  <div>
                    <div className="font-mono text-ui-base text-ink-100">
                      {m.name}
                      {isActive && <span className="ml-2 text-amber">●</span>}
                    </div>
                    <div className="font-mono text-ui-xs text-ink-500">
                      {m.sizeBytes ? formatBytes(m.sizeBytes) : ''}
                      {m.modifiedAt ? `  ·  ${new Date(m.modifiedAt).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isActive && (
                      <button
                        onClick={() => setActive.mutate({ name: m.name })}
                        className="rounded border border-ink-700 px-2 py-1 font-mono text-ui-xs uppercase tracking-widest2 text-amber hover:border-amber"
                      >
                        use
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete ${m.name}?`)) del.mutate({ name: m.name });
                      }}
                      className="rounded border border-ink-700 px-2 py-1 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400 hover:border-signal-err hover:text-signal-err"
                    >
                      remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded border border-ink-800 bg-ink-900/40 p-5">
        <div className="mb-3 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
          pull a model
        </div>
        <div className="flex gap-2">
          <input
            value={pullName}
            onChange={(e) => setPullName(e.target.value)}
            disabled={
              !ollamaOk ||
              pullState?.status === 'starting' ||
              (pullState?.status !== undefined && !pullState.done && pullState.status !== 'error')
            }
            className="flex-1 rounded border border-ink-700 bg-ink-950 px-3 py-1.5 font-mono text-ui-base text-ink-100 placeholder:text-ink-500 focus:border-amber focus:outline-none disabled:opacity-50"
            placeholder="qwen2.5-coder:7b"
          />
          <button
            disabled={
              !ollamaOk ||
              !pullName ||
              (pullState !== null && !pullState.done && pullState.status !== 'error')
            }
            onClick={() => setPullState({ status: 'starting' })}
            className="rounded border border-amber bg-amber/10 px-4 py-1.5 font-mono text-ui-sm uppercase tracking-widest2 text-amber hover:bg-amber/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            pull →
          </button>
        </div>

        {pullState && <PullProgressBar state={pullState} />}
        <div className="mt-3 font-mono text-ui-xs text-ink-500">
          tip: try{' '}
          <button
            onClick={() => setPullName('qwen2.5-coder:7b')}
            className="text-amber underline-offset-2 hover:underline"
          >
            qwen2.5-coder:7b
          </button>
          {' · '}
          <button
            onClick={() => setPullName('llama3.1:8b')}
            className="text-amber underline-offset-2 hover:underline"
          >
            llama3.1:8b
          </button>
          {' · '}
          <button
            onClick={() => setPullName('phi3.5')}
            className="text-amber underline-offset-2 hover:underline"
          >
            phi3.5
          </button>
        </div>
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
  const activeModel = trpc.llm.activeCopilotModel.useQuery();
  const setActiveModel = trpc.llm.setActiveCopilotModel.useMutation({
    onSuccess: () => utils.llm.activeCopilotModel.invalidate(),
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

  return (
    <>
      <div className="rounded border border-ink-800 bg-ink-900/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
              provider
            </div>
            <div className="mt-1 font-serif text-lg text-ink-50">GitHub Copilot</div>
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
          <div className="rounded border border-ink-700 bg-ink-950 px-4 py-3 font-mono text-ui-sm text-ink-300">
            <div className="mb-1 text-amber">Copilot CLI not reachable.</div>
            Start the server with <code className="text-amber">copilot --stdio=false</code>, then
            check the URL above matches the port.
            <div className="mt-2">
              <button
                type="button"
                onClick={() => retryCopilot.mutate()}
                disabled={retryCopilot.isPending}
                className="rounded border border-ink-700 px-2 py-1 font-mono text-ui-xs uppercase tracking-widest2 text-amber hover:border-amber disabled:cursor-not-allowed disabled:opacity-60"
              >
                {retryCopilot.isPending ? 'retrying...' : 'retry now'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded border border-ink-800 bg-ink-900/40">
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-3">
          <div className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
            available models
          </div>
          <div className="font-mono text-ui-xs text-ink-500">
            active: <span className="text-amber">{activeModel.data ?? '—'}</span>
          </div>
        </div>
        {!ok ? (
          <div className="px-5 py-6 font-mono text-ui-sm text-ink-500">—</div>
        ) : copilotModels.data && copilotModels.data.length === 0 ? (
          <div className="px-5 py-6 font-mono text-ui-sm text-ink-500">
            no models returned — check authentication
          </div>
        ) : (
          <ul>
            {copilotModels.data?.map((m) => {
              const isActive = m.name === activeModel.data;
              return (
                <li
                  key={m.name}
                  className="flex items-center justify-between border-b border-ink-800/60 px-5 py-2.5 last:border-b-0"
                >
                  <div className="font-mono text-ui-base text-ink-100">
                    {m.name}
                    {isActive && <span className="ml-2 text-amber">●</span>}
                  </div>
                  {!isActive && (
                    <button
                      onClick={() => setActiveModel.mutate({ name: m.name })}
                      className="rounded border border-ink-700 px-2 py-1 font-mono text-ui-xs uppercase tracking-widest2 text-amber hover:border-amber"
                    >
                      use
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function PullProgressBar({ state }: { state: PullState }) {
  const pct =
    state.completed && state.total ? Math.min(100, (state.completed / state.total) * 100) : null;
  const bg = state.status === 'error' ? 'bg-signal-err' : state.done ? 'bg-signal-ok' : 'bg-amber';
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between font-mono text-ui-xs uppercase tracking-widest2">
        <span className={state.status === 'error' ? 'text-signal-err' : 'text-ink-300'}>
          {state.error ?? state.status}
        </span>
        <span className="text-ink-500">
          {state.completed && state.total
            ? `${formatBytes(state.completed)} / ${formatBytes(state.total)}`
            : ''}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-800">
        <div
          className={`h-full ${bg} transition-all`}
          style={{ width: `${pct ?? (state.done ? 100 : 8)}%` }}
        />
      </div>
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
