import { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { FormField, inputClass } from './AgentFormPrimitives';
import type { AgentFormState } from './agentTypes';

interface ToolDef {
  name: string;
  description: string;
}

interface AgentFormPanelProps {
  form: AgentFormState;
  setForm: React.Dispatch<React.SetStateAction<AgentFormState>>;
  availableTools: ToolDef[];
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
  availableTools,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
  saveError,
  children,
}: AgentFormPanelProps) {
  const canSave = !isSaving && !!form.name && !!form.role && !!form.systemPrompt;

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
        <FormField label="allowed tools (empty = all)">
          <p className="mb-2 font-mono text-ui-2xs text-ink-500">
            tool restrictions only apply to local (Ollama) provider — Copilot uses its own tool set
          </p>
          <MultiSelectDropdown
            options={availableTools.map((t) => t.name)}
            selected={form.tools}
            onChange={(tools) => setForm((f) => ({ ...f, tools }))}
            placeholder="all tools enabled"
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

/* ── Multi-select dropdown ─────────────────────────────── */

function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (name: string) => {
    onChange(
      selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name],
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          inputClass,
          'flex w-full items-center justify-between gap-2 text-left',
        )}
      >
        <span className={cn('truncate', selected.length === 0 && 'text-ink-500')}>
          {selected.length === 0
            ? placeholder
            : `${selected.length} tool${selected.length > 1 ? 's' : ''} selected`}
        </span>
        <svg
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={cn('h-3 w-3 shrink-0 text-ink-500 transition-transform', open && 'rotate-180')}
        >
          <path d="M3 4.5l3 3 3-3" />
        </svg>
      </button>

      {selected.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selected.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded bg-amber/10 px-1.5 py-0.5 font-mono text-ui-2xs text-amber"
            >
              {name}
              <button
                type="button"
                onClick={() => toggle(name)}
                className="text-amber/60 hover:text-amber"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-ink-700/80 bg-ink-900 shadow-lg">
          {options.map((name) => {
            const isSelected = selected.includes(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggle(name)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-ui-xs transition-colors',
                  isSelected
                    ? 'bg-amber/8 text-ink-100'
                    : 'text-ink-400 hover:bg-ink-800/60 hover:text-ink-200',
                )}
              >
                <span
                  className={cn(
                    'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                    isSelected
                      ? 'border-amber/40 bg-amber/20 text-amber'
                      : 'border-ink-600',
                  )}
                >
                  {isSelected && (
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" className="h-2.5 w-2.5">
                      <path d="M2.5 6l2.5 2.5 4.5-5" />
                    </svg>
                  )}
                </span>
                {name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
