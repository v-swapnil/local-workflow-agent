import { cn } from '@renderer/lib/utils';

export interface SidebarListItemProps {
  title: string;
  description?: string;
  isActive?: boolean;
  onSelect?: () => void;
  status?: { active: boolean; title?: string };
  actions?: React.ReactNode;
}

/**
 * Shared compact sidebar row used across Skills, Agents, and Workflows.
 * Two-row layout: status dot + title + tags on top, optional subtitle and
 * right-aligned meta below. Selection is shown via the row border/background.
 */
export const SidebarListItem = ({
  title,
  description,
  isActive = false,
  onSelect,
  status,
  actions,
}: SidebarListItemProps) => {
  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors',
        isActive
          ? 'border-amber/25 bg-ink-800/60 shadow-sm shadow-amber/5'
          : 'border-transparent hover:border-ink-700/60 hover:bg-ink-800/30',
      )}
    >
      {status && (
        <span
          title={status.title ?? (status.active ? 'enabled' : 'disabled')}
          className={cn(
            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
            status.active ? 'bg-emerald-400' : 'bg-ink-600',
          )}
        />
      )}

      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'truncate font-mono text-ui-sm font-medium',
              isActive ? 'text-ink-50' : 'text-ink-200',
            )}
          >
            {title}
          </span>
        </div>

        {description && (
          <div className="mt-0.5 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-ui-2xs text-ink-500">
              {description}
            </span>
          </div>
        )}
      </button>

      {actions && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {actions}
        </div>
      )}
    </div>
  );
};
