import * as React from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@renderer/lib/utils';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './dropdown-menu';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  /** Minimum number of items that must remain selected. Default 0. */
  minSelected?: number;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  className,
  minSelected = 0,
}: MultiSelectProps) {
  function toggle(optionValue: string) {
    const isSelected = value.includes(optionValue);
    if (isSelected) {
      if (value.length <= minSelected) return;
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  }

  function removeChip(optionValue: string | undefined, evt: React.MouseEvent) {
    evt.stopPropagation();
    if (value.length <= minSelected) return;
    onChange(value.filter((v) => v !== optionValue));
  }

  const selectedOptions = value.map((v) => options.find((o) => o.value === v));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-ink-700/60 bg-ink-900/40 px-3 py-1.5 text-sm transition-colors hover:border-ink-600 focus:outline-none focus:border-amber/50 focus:ring-1 focus:ring-amber/20',
            className,
          )}
        >
          <span className="flex flex-1 flex-wrap gap-1">
            {selectedOptions.length === 0 ? (
              <span className="text-ink-500">{placeholder}</span>
            ) : (
              selectedOptions.map((option, i) => (
                <span
                  key={option?.value}
                  className="inline-flex items-center gap-0.5 rounded-sm bg-ink-700/60 px-1.5 py-0.5 font-mono text-ui-2xs text-ink-200"
                >
                  {option?.label}
                  {selectedOptions.length > minSelected && (
                    <X
                      className="h-4 w-4 cursor-pointer text-ink-400 hover:text-ink-100"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => removeChip(option?.value, e)}
                    />
                  )}
                </span>
              ))
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-500" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="max-h-60 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto border-ink-700/60 bg-ink-900 text-ink-100"
      >
        {options.map((option) => {
          const isSelected = value.includes(option.value);
          const isDisabled = isSelected && value.length <= minSelected;
          return (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={isSelected}
              disabled={isDisabled}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => toggle(option.value)}
              className="font-mono text-ui-xs text-ink-200 focus:bg-ink-700/50 focus:text-ink-50"
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
