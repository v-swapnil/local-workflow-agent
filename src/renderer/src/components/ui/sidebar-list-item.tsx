import { cn } from '@renderer/lib/utils';

export interface SidebarListItemTag {
  label: string;
  /** Optional accent. Defaults to a muted neutral tag. */
  tone?: 'neutral' | 'amber' | 'ok' | 'err';
}

export interface SidebarListItemProps {
  title: string;
  isActive?: boolean;
  onSelect?: () => void;
  /**
   * Active/inactive status dot shown before the title.
   * Omit when an item has no on/off concept.
   */
  status?: { active: boolean; title?: string };
  /** Compact inline tags shown after the title (keep these short, e.g. "builtin"). */
  tags?: SidebarListItemTag[];
  /** Muted secondary line below the title (e.g. role, description). */
  subtitle?: string;
  /** Right-aligned meta on the second row (e.g. relative time). */
  meta?: string;
  /** Hover-revealed action buttons (e.g. delete). */
  actions?: React.ReactNode;
}

const TAG_TONE: Record<NonNullable<SidebarListItemTag['tone']>, string> = {
  neutral: 'border-ink-700/40 text-ink-500',
  amber: 'border-amber/25 text-amber',
  ok: 'border-emerald-500/25 text-emerald-400',
  err: 'border-signal-err/30 text-signal-err',
};

/**
 * Shared compact sidebar row used across Skills, Agents, and Workflows.
 * Two-row layout: status dot + title + tags on top, optional subtitle and
 * right-aligned meta below. Selection is shown via the row border/background.
 */
export function SidebarListItem({
  title,
  isActive = false,
  onSelect,
  status,
  tags,
  subtitle,
  meta,
  actions,
}: SidebarListItemProps) {
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
            'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
            status.active ? 'bg-emerald-400' : 'bg-ink-600',
          )}
        />
      )}

      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'truncate font-mono text-ui-sm font-medium',
              isActive ? 'text-ink-50' : 'text-ink-200',
            )}
          >
            {title}
          </span>
          {tags?.map((tag) => (
            <span
              key={tag.label}
              className={cn(
                'max-w-[7rem] shrink-0 truncate rounded border px-1 py-px font-mono text-ui-2xs uppercase tracking-widest2',
                TAG_TONE[tag.tone ?? 'neutral'],
              )}
            >
              {tag.label}
            </span>
          ))}
        </div>
        {(subtitle || meta) && (
          <div className="mt-0.5 flex items-center gap-2">
            {subtitle && (
              <span className="min-w-0 flex-1 truncate font-mono text-ui-2xs text-ink-500">
                {subtitle}
              </span>
            )}
            {meta && (
              <span className="shrink-0 font-mono text-ui-2xs text-ink-600">{meta}</span>
            )}
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
}
