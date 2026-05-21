import { useState } from 'react';
import { trpc } from '../trpc';
import { cn } from '../lib/utils';

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
    <span className="inline-flex items-center rounded-full bg-amber/8 px-2 py-0.5 font-mono text-ui-2xs uppercase tracking-widest2 text-amber">
      {role || '—'}
    </span>
  );
}

function ModelTag({ model, provider }: { model: string; provider: string }) {
  return (
    <span className="flex items-center gap-1 font-mono text-ui-2xs text-ink-500">
      <span className="text-ink-600">{provider}</span>
      <span className="text-ink-700">/</span>
      <span>{model || '…'}</span>
    </span>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'rounded-md border border-ink-700/80 bg-ink-900/50 px-3 py-2 font-mono text-ui-sm text-ink-100 placeholder:text-ink-600 transition-all hover:border-ink-600 focus:border-amber/40 focus:outline-none focus:bg-ink-900/80';

const selectClass =
  'rounded-md border border-ink-700/80 bg-ink-900/50 px-3 py-2 font-mono text-ui-sm text-ink-100 transition-all hover:border-ink-600 focus:border-amber/40 focus:outline-none cursor-pointer';

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
    <div className="flex h-full min-h-0 animate-fade-in">
      {/* Left panel — agent list */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-ink-800/60 bg-ink-950">
        <div className="flex items-center justify-between border-b border-ink-800/60 px-4 py-3">
          <span className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">agents</span>
          <button
            onClick={newAgent}
            className="flex items-center gap-1 rounded-md border border-ink-700/60 bg-ink-800/30 px-2 py-1 font-mono text-ui-xs text-ink-300 transition-all hover:border-amber/30 hover:bg-amber/5 hover:text-amber"
          >
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-2.5 w-2.5">
              <path d="M6 2v8M2 6h8" />
            </svg>
            new
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {agents.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-800/40">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" className="h-4 w-4 text-ink-500">
                  <rect x="3" y="3" width="10" height="8" rx="2" />
                  <circle cx="6" cy="7" r="1" fill="currentColor" stroke="none" />
                  <circle cx="10" cy="7" r="1" fill="currentColor" stroke="none" />
                  <path d="M5 13h6M6 11v2M10 11v2" />
                </svg>
              </div>
              <span className="font-mono text-ui-xs text-ink-500">no agents yet</span>
            </div>
          ) : (
            <ul className="space-y-0.5 px-2 py-2">
              {agents.map((a, i) => (
                <li key={a.id} className={`animate-slide-up stagger-${Math.min(i + 1, 10)}`}>
                  <button
                    onClick={() => selectAgent(a.id)}
                    className={cn(
                      'group relative flex w-full flex-col gap-1.5 rounded-md border px-3 py-2.5 text-left transition-all',
                      selected === a.id
                        ? 'border-amber/20 bg-ink-800/60 text-ink-100 shadow-sm shadow-amber/5'
                        : 'border-transparent text-ink-300 hover:border-ink-700/60 hover:bg-ink-800/30 hover:text-ink-100',
                    )}
                  >
                    {selected === a.id && (
                      <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-amber" />
                    )}
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
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 py-5">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-ui-lg font-medium tracking-tight text-ink-50">
              {form.id ? 'Edit Agent' : 'New Agent'}
            </h2>
            {form.id && (
              <span className="mt-0.5 block font-mono text-ui-2xs text-ink-600">{form.id}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {form.id && (
              <button
                onClick={() => del.mutate({ id: form.id! })}
                disabled={del.isPending}
                className="rounded-md border border-signal-err/20 px-3 py-1.5 font-mono text-ui-xs text-signal-err/80 transition-all hover:border-signal-err/40 hover:bg-signal-err/5 hover:text-signal-err disabled:opacity-40"
              >
                delete
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-4">
          {(
            [
              { key: 'name', label: 'name *', placeholder: 'my-agent' },
              { key: 'role', label: 'role *', placeholder: 'backend-engineer' },
              { key: 'description', label: 'description', placeholder: 'what does this agent do?' },
            ] as { key: keyof AgentFormState; label: string; placeholder: string }[]
          ).map(({ key, label, placeholder }) => (
            <FormField key={key} label={label}>
              <input
                value={form[key] as string}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className={inputClass}
              />
            </FormField>
          ))}

          <FormField label="provider">
            <select
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value as 'ollama' | 'copilot', model: '' }))}
              className={selectClass}
            >
              <option value="ollama">Ollama (local)</option>
              <option value="copilot">Copilot CLI</option>
            </select>
          </FormField>

          <FormField label="model *">
            {models.length > 0 ? (
              <select
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                className={selectClass}
              >
                <option value="">— select model —</option>
                {models.map((m) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            ) : (
              <input
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                placeholder="qwen2.5-coder:7b"
                className={inputClass}
              />
            )}
          </FormField>

          <FormField label="graph mode">
            <div className="flex gap-1.5">
              {(['full', 'direct'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, graphMode: m }))}
                  className={cn(
                    'flex-1 rounded-md border py-2 font-mono text-ui-xs uppercase tracking-widest2 transition-all',
                    form.graphMode === m
                      ? 'border-amber/30 bg-amber/8 text-amber shadow-sm shadow-amber/5'
                      : 'border-ink-700/60 text-ink-400 hover:border-ink-600 hover:text-ink-200',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </FormField>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4">
          <FormField label="temperature">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={form.temperature}
                onChange={(e) => setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) }))}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-700 accent-amber [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber [&::-webkit-slider-thumb]:shadow-glow-sm"
              />
              <span className="w-10 text-right font-mono text-ui-sm text-ink-200">{form.temperature.toFixed(2)}</span>
            </div>
          </FormField>
          <FormField label="max iterations">
            <input
              type="number"
              min={1}
              max={50}
              value={form.maxIterations}
              onChange={(e) => setForm((f) => ({ ...f, maxIterations: parseInt(e.target.value, 10) || 10 }))}
              className={inputClass}
            />
          </FormField>
        </div>

        <div className="mt-5">
          <FormField label="system prompt *">
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
              rows={7}
              placeholder="You are a skilled backend engineer…"
              className={cn(inputClass, 'resize-y leading-relaxed')}
            />
          </FormField>
        </div>

        <div className="mt-4">
          <FormField label="allowed tools (JSON array, empty = all)">
            <input
              value={form.toolsJson}
              onChange={(e) => setForm((f) => ({ ...f, toolsJson: e.target.value }))}
              placeholder='["read_file","write_file","run_shell"]'
              className={inputClass}
            />
          </FormField>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={save}
            disabled={upsert.isPending || !form.name || !form.role || !form.model || !form.systemPrompt}
            className="rounded-md bg-amber/90 px-5 py-2 font-mono text-ui-sm font-medium uppercase tracking-widest2 text-ink-950 shadow-glow-sm transition-all hover:bg-amber hover:shadow-glow disabled:opacity-40 disabled:shadow-none"
          >
            {upsert.isPending ? 'saving…' : 'save agent'}
          </button>
          {upsert.error && (
            <span className="font-mono text-ui-xs text-signal-err">{upsert.error.message}</span>
          )}
        </div>

        {/* Test agent */}
        {form.id && (
          <div className="mt-8 animate-slide-up rounded-lg border border-ink-800/60 bg-ink-900/20 p-5">
            <div className="mb-3 font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
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
                className={cn(inputClass, 'flex-1')}
              />
              <button
                onClick={() => form.id && test.mutate({ id: form.id, prompt: testPrompt.trim() })}
                disabled={test.isPending || !testPrompt.trim()}
                className="rounded-md border border-ink-700/60 px-4 py-2 font-mono text-ui-xs uppercase tracking-widest2 text-ink-300 transition-all hover:border-amber/30 hover:text-amber disabled:opacity-40"
              >
                {test.isPending ? (
                  <span className="animate-pulse">running…</span>
                ) : 'run'}
              </button>
            </div>
            {testError && (
              <div className="mt-3 rounded-md border border-signal-err/20 bg-signal-err/5 px-3 py-2.5 font-mono text-ui-xs text-signal-err">
                {testError}
              </div>
            )}
            {testResponse && (
              <div className="mt-3 max-h-60 overflow-y-auto rounded-md border border-ink-700/40 bg-ink-900/50 px-4 py-3 font-mono text-ui-sm leading-relaxed text-ink-200 whitespace-pre-wrap">
                {testResponse}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
