import { cn } from '../../lib/utils';
import { PROVIDERS } from '@shared/constants';
import type { ProviderId } from '@shared/types';
import { FormField, inputClass, selectClass } from './AgentFormPrimitives';
import type { AgentFormState } from './agentTypes';

interface Model {
  name: string;
}

interface AgentFormPanelProps {
  form: AgentFormState;
  setForm: React.Dispatch<React.SetStateAction<AgentFormState>>;
  models: Model[];
  onSave: () => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
  saveError?: string | null;
  children?: React.ReactNode;
}

type TextField = { key: keyof AgentFormState; label: string; placeholder: string };

const TEXT_FIELDS: TextField[] = [
  { key: 'name', label: 'name *', placeholder: 'my-agent' },
  { key: 'role', label: 'role *', placeholder: 'backend-engineer' },
  { key: 'description', label: 'description', placeholder: 'what does this agent do?' },
];

export function AgentFormPanel({
  form,
  setForm,
  models,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
  saveError,
  children,
}: AgentFormPanelProps) {
  const canSave = !isSaving && !!form.name && !!form.role && !!form.model && !!form.systemPrompt;

  return (
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
              onClick={onDelete}
              disabled={isDeleting}
              className="rounded-md border border-signal-err/20 px-3 py-1.5 font-mono text-ui-xs text-signal-err/80 transition-all hover:border-signal-err/40 hover:bg-signal-err/5 hover:text-signal-err disabled:opacity-40"
            >
              delete
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        {TEXT_FIELDS.map(({ key, label, placeholder }) => (
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
            onChange={(e) =>
              setForm((f) => ({ ...f, provider: e.target.value as ProviderId, model: '' }))
            }
            className={selectClass}
          >
            <option value={PROVIDERS.OLLAMA}>Ollama (local)</option>
            <option value={PROVIDERS.COPILOT}>Copilot CLI</option>
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
              onChange={(e) =>
                setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) }))
              }
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-700 accent-amber [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber [&::-webkit-slider-thumb]:shadow-glow-sm"
            />
            <span className="w-10 text-right font-mono text-ui-sm text-ink-200">
              {form.temperature.toFixed(2)}
            </span>
          </div>
        </FormField>
        <FormField label="max iterations">
          <input
            type="number"
            min={1}
            max={50}
            value={form.maxIterations}
            onChange={(e) =>
              setForm((f) => ({ ...f, maxIterations: parseInt(e.target.value, 10) || 10 }))
            }
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
        <FormField label="allowed tools (comma-separated, empty = all)">
          <input
            value={form.tools}
            onChange={(e) => setForm((f) => ({ ...f, tools: e.target.value }))}
            placeholder="read_file,write_file,run_shell"
            className={inputClass}
          />
        </FormField>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={!canSave}
          className="rounded-md bg-amber/90 px-5 py-2 font-mono text-ui-sm font-medium uppercase tracking-widest2 text-ink-950 shadow-glow-sm transition-all hover:bg-amber hover:shadow-glow disabled:opacity-40 disabled:shadow-none"
        >
          {isSaving ? 'saving…' : 'save agent'}
        </button>
        {saveError && (
          <span className="font-mono text-ui-xs text-signal-err">{saveError}</span>
        )}
      </div>
      {children}
    </div>
  );
}
