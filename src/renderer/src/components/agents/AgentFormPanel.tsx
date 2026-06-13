import { FormField } from './AgentFormPrimitives';
import type { AgentFormState } from './agentTypes';
import { Input } from '../ui/input';
import { Slider } from '../ui/slider';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';

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
            <Button variant="danger" size="sm" onClick={onDelete} disabled={isDeleting}>
              delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        {TEXT_FIELDS.map(({ key, label, placeholder }) => (
          <FormField key={key} label={label}>
            <Input
              value={form[key] as string}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
            />
          </FormField>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4">
        <FormField label="temperature">
          <div className="flex items-center gap-3">
            <Slider
              min={0}
              max={2}
              step={0.05}
              value={[form.temperature]}
              onValueChange={(vals) =>
                setForm((f) => ({ ...f, temperature: (vals[0] ?? f.temperature) as number }))
              }
              className="flex-1"
            />
            <span className="w-10 text-right font-mono text-ui-sm text-ink-200">
              {form.temperature.toFixed(2)}
            </span>
          </div>
        </FormField>
        <FormField label="max iterations">
          <Input
            type="number"
            min={1}
            max={50}
            value={form.maxIterations}
            onChange={(e) =>
              setForm((f) => ({ ...f, maxIterations: parseInt(e.target.value, 10) || 10 }))
            }
          />
        </FormField>
      </div>

      <div className="mt-5">
        <FormField label="system prompt *">
          <Textarea
            value={form.systemPrompt}
            onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
            rows={7}
            placeholder="You are a skilled backend engineer..."
            className="resize-y leading-relaxed font-mono text-ui-sm"
          />
        </FormField>
      </div>

      <div className="mt-4">
        <FormField label="allowed tools (empty = all)">
          <Input
            type="text"
            value={form.tools.join(', ')}
            placeholder="Comma separated values"
            onChange={(e) => setForm((f) => ({ ...f, tools: e.target.value.split(',') }))}
          />
          <p className="mb-2 font-mono text-ui-2xs text-ink-500">
            tool restrictions only apply to local (Ollama) provider — Copilot uses its own tool set
          </p>
        </FormField>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button variant="default" size="sm" onClick={onSave} disabled={!canSave}>
          {isSaving ? 'saving…' : 'save agent'}
        </Button>
        {saveError && <span className="font-mono text-ui-xs text-signal-err">{saveError}</span>}
      </div>
      {children}
    </div>
  );
}
