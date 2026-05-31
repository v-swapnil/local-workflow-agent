import { formatBytes } from './modelManagerUtils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

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
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="— none —" />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.name} value={m.name}>
              {m.name}{m.sizeBytes ? ` (${formatBytes(m.sizeBytes)})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
