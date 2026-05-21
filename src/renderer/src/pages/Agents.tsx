import { useState } from 'react';
import { trpc } from '../trpc';

interface AgentFormState {
  id?: string;
  name: string;
  role: string;
  model: string;
  systemPrompt: string;
  toolsJson: string;
  temperature: number;
  graphMode: 'full' | 'direct';
  maxIterations: number;
  description: string;
  provider: 'ollama' | 'copilot';
}

const BLANK: AgentFormState = {
  name: '',
  role: '',
  model: '',
  systemPrompt: '',
  toolsJson: '',
  temperature: 0.2,
  graphMode: 'full',
  maxIterations: 10,
  description: '',
  provider: 'ollama',
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="rounded bg-amber-950/40 px-1.5 py-0.5 font-mono text-ui-xs uppercase tracking-widest2 text-amber-400">
      {role || '—'}
    </span>
  );
}

function ModelTag({ model, provider }: { model: string; provider: string }) {
  return (
    <span className="font-mono text-ui-xs text-ink-500">
      {provider}/{model || '…'}
    </span>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-ui-xs text-ink-400">
        {label}: <span className="text-ink-100">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={2}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-amber-500"
      />
    </label>
  );
}

export function Agents() {
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<AgentFormState>(BLANK);

  const { data: agents = [] } = trpc.agent.list.useQuery();
  const { data: modelsData } = trpc.llm.listModelsByProvider.useQuery({ provider: form.provider });
  const models = modelsData ?? [];
  const [testPrompt, setTestPrompt] = useState('');
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const upsert = trpc.agent.upsert.useMutation({
    onSuccess: async () => {
      await utils.agent.list.invalidate();
      setTestResponse(null);
    },
  });
  const del = trpc.agent.delete.useMutation({
    onSuccess: async () => {
      await utils.agent.list.invalidate();
      setSelected(null);
      setForm(BLANK);
    },
  });
  const test = trpc.agent.test.useMutation({
    onSuccess: (data) => {
      setTestResponse(data.response);
      setTestError(null);
    },
    onError: (err) => setTestError(err.message),
  });

  function selectAgent(id: string) {
    const a = agents.find((x) => x.id === id);
    if (!a) return;
    setSelected(id);
    setTestResponse(null);
    setTestError(null);
    setForm({
      id: a.id,
      name: a.name,
      role: a.role,
      model: a.model,
      systemPrompt: a.systemPrompt,
      toolsJson: a.toolsJson ?? '',
      temperature: a.temperature,
      graphMode: (a.graphMode as 'full' | 'direct') ?? 'full',
      maxIterations: (a as { maxIterations?: number }).maxIterations ?? 10,
      description: (a as { description?: string }).description ?? '',
      provider: ((a as { provider?: string }).provider as 'ollama' | 'copilot') ?? 'ollama',
    });
  }

  function newAgent() {
    setSelected(null);
    setForm(BLANK);
    setTestResponse(null);
    setTestError(null);
  }

  function save() {
    upsert.mutate({
      id: form.id,
      name: form.name,
      role: form.role,
      model: form.model,
      systemPrompt: form.systemPrompt,
      toolsJson: form.toolsJson || null,
      temperature: form.temperature,
      graphMode: form.graphMode,
      maxIterations: form.maxIterations,
      description: form.description || undefined,
      provider: form.provider,
    });
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Left panel */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-ink-800">
        <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
          <span className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">agents</span>
          <button
            onClick={newAgent}
            className="rounded border border-ink-700 px-2 py-0.5 font-mono text-ui-xs text-ink-300 hover:border-amber-700/60 hover:text-amber-300"
          >
            + new
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {agents.length === 0 ? (
            <div className="px-4 py-8 text-center font-mono text-ui-xs text-ink-500">no agents yet</div>
          ) : (
            <ul className="space-y-0.5 px-2 py-2">
              {agents.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => selectAgent(a.id)}
                    className={`flex w-full flex-col gap-1 rounded px-3 py-2 text-left transition-colors ${
                      selected === a.id
                        ? 'bg-ink-800 text-ink-100 shadow-inset-hair'
                        : 'text-ink-300 hover:bg-ink-800/60 hover:text-ink-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-ui-sm font-medium">{a.name}</span>
                      <RoleBadge role={a.role} />
                    </div>
                    <ModelTag model={a.model} provider={(a as { provider?: string }).provider ?? 'ollama'} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Right panel — form */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-6 py-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl text-ink-100">{form.id ? 'edit agent' : 'new agent'}</h2>
          {form.id && (
            <button
              onClick={() => del.mutate({ id: form.id! })}
              disabled={del.isPending}
              className="rounded border border-signal-err/40 px-3 py-1 font-mono text-ui-xs text-signal-err hover:bg-signal-err/10 disabled:opacity-40"
            >
              delete
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {(
            [
              { key: 'name', label: 'name *', placeholder: 'my-agent' },
              { key: 'role', label: 'role *', placeholder: 'backend-engineer' },
              { key: 'description', label: 'description', placeholder: 'optional description' },
            ] as { key: keyof AgentFormState; label: string; placeholder: string }[]
          ).map(({ key, label, placeholder }) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="font-mono text-ui-xs text-ink-400">{label}</span>
              <input
                value={form[key] as string}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="rounded border border-ink-700 bg-ink-950 px-3 py-1.5 font-mono text-ui-sm text-ink-100 focus:border-amber-700/60 focus:outline-none"
              />
            </label>
          ))}

          <label className="flex flex-col gap-1">
            <span className="font-mono text-ui-xs text-ink-400">provider</span>
            <select
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value as 'ollama' | 'copilot', model: '' }))}
              className="rounded border border-ink-700 bg-ink-950 px-3 py-1.5 font-mono text-ui-sm text-ink-100 focus:border-amber-700/60 focus:outline-none"
            >
              <option value="ollama">ollama</option>
              <option value="copilot">copilot</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-ui-xs text-ink-400">model *</span>
            {models.length > 0 ? (
              <select
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                className="rounded border border-ink-700 bg-ink-950 px-3 py-1.5 font-mono text-ui-sm text-ink-100 focus:border-amber-700/60 focus:outline-none"
              >
                <option value="">— pick model —</option>
                {models.map((m) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            ) : (
              <input
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                placeholder="qwen2.5-coder:7b"
                className="rounded border border-ink-700 bg-ink-950 px-3 py-1.5 font-mono text-ui-sm text-ink-100 focus:border-amber-700/60 focus:outline-none"
              />
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-ui-xs text-ink-400">graph mode</span>
            <div className="flex gap-2">
              {(['full', 'direct'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, graphMode: m }))}
                  className={`flex-1 rounded border px-3 py-1.5 font-mono text-ui-xs uppercase tracking-widest2 transition-colors ${
                    form.graphMode === m
                      ? 'border-amber-700/60 bg-amber-950/30 text-amber-300'
                      : 'border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-200'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </label>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <Slider
            label="temperature"
            value={form.temperature}
            onChange={(v) => setForm((f) => ({ ...f, temperature: v }))}
          />
          <label className="flex flex-col gap-1">
            <span className="font-mono text-ui-xs text-ink-400">max iterations</span>
            <input
              type="number"
              min={1}
              max={50}
              value={form.maxIterations}
              onChange={(e) => setForm((f) => ({ ...f, maxIterations: parseInt(e.target.value, 10) || 10 }))}
              className="rounded border border-ink-700 bg-ink-950 px-3 py-1.5 font-mono text-ui-sm text-ink-100 focus:border-amber-700/60 focus:outline-none"
            />
          </label>
        </div>

        <label className="mt-4 flex flex-col gap-1">
          <span className="font-mono text-ui-xs text-ink-400">system prompt *</span>
          <textarea
            value={form.systemPrompt}
            onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
            rows={8}
            placeholder="You are a skilled backend engineer…"
            className="resize-y rounded border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-ui-sm text-ink-100 placeholder:text-ink-600 focus:border-amber-700/60 focus:outline-none"
          />
        </label>

        <label className="mt-4 flex flex-col gap-1">
          <span className="font-mono text-ui-xs text-ink-400">
            allowed tools (JSON array, empty = all)
          </span>
          <input
            value={form.toolsJson}
            onChange={(e) => setForm((f) => ({ ...f, toolsJson: e.target.value }))}
            placeholder='["read_file","write_file","run_shell"]'
            className="rounded border border-ink-700 bg-ink-950 px-3 py-1.5 font-mono text-ui-sm text-ink-100 focus:border-amber-700/60 focus:outline-none"
          />
        </label>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={save}
            disabled={upsert.isPending || !form.name || !form.role || !form.model || !form.systemPrompt}
            className="rounded border border-amber-700/60 bg-amber-950/30 px-5 py-1.5 font-mono text-ui-sm uppercase tracking-widest2 text-amber-300 hover:bg-amber-950/60 disabled:opacity-40"
          >
            {upsert.isPending ? 'saving…' : 'save agent'}
          </button>
          {upsert.error && (
            <span className="font-mono text-ui-xs text-signal-err">{upsert.error.message}</span>
          )}
        </div>

        {/* Test agent */}
        {form.id && (
          <div className="mt-6 border-t border-ink-800 pt-4">
            <div className="mb-2 font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
              test agent
            </div>
            <div className="flex gap-2">
              <input
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                placeholder="say hello…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && testPrompt.trim() && form.id)
                    test.mutate({ id: form.id, prompt: testPrompt.trim() });
                }}
                className="flex-1 rounded border border-ink-700 bg-ink-950 px-3 py-1.5 font-mono text-ui-sm text-ink-100 focus:border-amber-700/60 focus:outline-none"
              />
              <button
                onClick={() => form.id && test.mutate({ id: form.id, prompt: testPrompt.trim() })}
                disabled={test.isPending || !testPrompt.trim()}
                className="rounded border border-ink-700 px-3 py-1.5 font-mono text-ui-xs text-ink-300 hover:border-amber-700/60 hover:text-amber-300 disabled:opacity-40"
              >
                {test.isPending ? '…' : 'run'}
              </button>
            </div>
            {testError && (
              <div className="mt-2 rounded border border-signal-err/30 bg-signal-err/10 px-3 py-2 font-mono text-ui-xs text-signal-err">
                {testError}
              </div>
            )}
            {testResponse && (
              <div className="mt-2 max-h-60 overflow-y-auto rounded border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-ui-sm text-ink-200 whitespace-pre-wrap">
                {testResponse}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
