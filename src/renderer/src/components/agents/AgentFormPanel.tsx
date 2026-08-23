import { FormField } from './AgentFormPrimitives';
import type { AgentFormState } from './agentTypes';
import { Input } from '../ui/input';
import { Slider } from '../ui/slider';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { MultiSelect } from '../ui/multi-select';
import { Separator } from '../ui/separator';

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
  isSaving,
  saveError,
}: AgentFormPanelProps) {
  const canSave = !isSaving && !!form.name && !!form.role && !!form.systemPrompt;

  return (
    <div className="p-4 flex flex-col w-full">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
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
          <FormField label="temperature">
            <div className="flex items-center gap-3 h-10">
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
        </div>

        <div className="mt-5">
          <FormField label="system prompt *">
            <Textarea
              value={form.systemPrompt}
              onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
              rows={12}
              placeholder="You are a skilled backend engineer..."
              className="resize-y leading-relaxed font-mono text-ui-sm"
            />
          </FormField>
        </div>

        <div className="mt-5">
          <FormField label="allowed tools">
            <MultiSelect
              options={availableTools.map((t) => ({ value: t.name, label: t.name }))}
              value={form.tools.filter(Boolean)}
              onChange={(tools) => setForm((f) => ({ ...f, tools }))}
              placeholder="all tools enabled"
            />
          </FormField>
        </div>
      </div>
      <Separator />
      <div className="mt-4 flex items-center justify-end gap-3">
        <Button variant="default" size="sm" onClick={onSave} disabled={!canSave}>
          {isSaving ? 'saving…' : 'save agent'}
        </Button>
      </div>
    </div>
  );
}
