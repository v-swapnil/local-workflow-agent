import { formatBytes } from './modelManagerUtils';

interface ModelDropdownProps {
  label: string;
  description: string;
  models: { name: string; sizeBytes?: number }[];
  value: string;
  onChange: (name: string) => void;
}

export function ModelDropdown({ label, description, models, value, onChange }: ModelDropdownProps) {
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
