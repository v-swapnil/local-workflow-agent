import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils';
import { trpc } from '../trpc';

/* ─── Inline SVG icons (16×16 viewBox) ─── */
const ICONS: Record<string, JSX.Element> = {
  sessions: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <rect x="2" y="3" width="12" height="9" rx="1.5" />
      <path d="M5 7.5h6M5 9.5h3" />
    </svg>
  ),
  board: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" className="h-3.5 w-3.5">
      <rect x="1.5" y="2" width="3.5" height="12" rx="1" />
      <rect x="6.25" y="2" width="3.5" height="8" rx="1" />
      <rect x="11" y="2" width="3.5" height="10" rx="1" />
    </svg>
  ),
  changes: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" className="h-3.5 w-3.5">
      <path d="M4 3v10M12 3v10" />
      <path d="M7 5.5h5M7 8h3M7 10.5h5" strokeOpacity="0.5" />
      <circle cx="4" cy="5.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="10.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  worktrees: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M8 2v5M8 7l-4 4M8 7l4 4" />
      <circle cx="8" cy="2" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  editor: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M5.5 4L3 8l2.5 4M10.5 4L13 8l-2.5 4" />
      <path d="M9 3L7 13" strokeOpacity="0.4" />
    </svg>
  ),
  skills: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M8 1.5l1.8 4.2L14.5 6l-3.5 3.2.9 4.8L8 11.5 4.1 14l.9-4.8L1.5 6l4.7-.3z" />
    </svg>
  ),
  agents: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <rect x="3" y="3" width="10" height="8" rx="2" />
      <circle cx="6" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="7" r="1" fill="currentColor" stroke="none" />
      <path d="M5 13h6" />
      <path d="M6 11v2M10 11v2" />
    </svg>
  ),
  workflows: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" className="h-3.5 w-3.5">
      <circle cx="4" cy="4" r="1.5" />
      <circle cx="12" cy="4" r="1.5" />
      <circle cx="8" cy="12" r="1.5" />
      <path d="M5.2 5.2L7 10.5M10.8 5.2L9 10.5" />
    </svg>
  ),
  schedules: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 4.5V8l2.5 1.5" />
    </svg>
  ),
  tools: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M9.5 2.5a3 3 0 00-3.8 3.8L2.5 9.5l2 2 3.2-3.2a3 3 0 003.8-3.8L9.5 6.5 8 5z" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" />
    </svg>
  ),
};

const BASE_NAV: { to: string; label: string; icon: string; hint: string }[] = [
  { to: '/sessions', label: 'sessions', icon: 'sessions', hint: '⌘1' },
  { to: '/board', label: 'board', icon: 'board', hint: '⌘2' },
  { to: '/changes', label: 'changes', icon: 'changes', hint: '⌘3' },
  { to: '/worktrees', label: 'worktrees', icon: 'worktrees', hint: '' },
  { to: '/editor', label: 'editor', icon: 'editor', hint: '⌘4' },
  { to: '/skills', label: 'skills', icon: 'skills', hint: '⌘5' },
  { to: '/agents', label: 'agents', icon: 'agents', hint: '⌘6' },
  { to: '/workflows', label: 'workflows', icon: 'workflows', hint: '' },
  { to: '/schedules', label: 'schedules', icon: 'schedules', hint: '⌘7' },
  { to: '/tools', label: 'tools', icon: 'tools', hint: '⌘8' },
  { to: '/settings', label: 'settings', icon: 'settings', hint: '⌘,' },
];

export function Sidebar() {
  const ping = trpc.ping.useQuery('hello');
  const useWorktrees = trpc.settings.useWorktrees.useQuery();

  const nav = BASE_NAV.filter((item) => item.to !== '/worktrees' || useWorktrees.data === true);

  return (
    <aside className="relative flex w-56 shrink-0 flex-col border-r border-ink-800/50 bg-ink-900/20">
      {/* Brand */}
      <div className="px-4 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber/10">
            <span className="font-mono text-ui-xs font-bold text-amber">A</span>
          </div>
          <span className="font-serif text-lg italic text-ink-100">ase</span>
        </div>
      </div>

      <div className="divider-h mx-4 mb-1 mt-2" />

      <nav className="flex flex-col gap-0.5 px-2 py-2">
        {nav.map((item, i) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] font-mono text-ui-base tracking-wide transition-all duration-150 animate-slide-in-left',
                `stagger-${Math.min(i + 1, 10)}`,
                isActive
                  ? 'bg-ink-800/50 text-ink-50'
                  : 'text-ink-400 hover:bg-ink-800/30 hover:text-ink-200',
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-amber animate-fade-in" />
                )}
                <span className={cn(
                  'flex-shrink-0 transition-colors',
                  isActive ? 'text-amber' : 'text-ink-500 group-hover:text-ink-300',
                )}>
                  {ICONS[item.icon]}
                </span>
                <span className="flex-1">{item.label}</span>
                {item.hint && (
                  <span className="text-ui-2xs text-ink-600 opacity-0 transition-opacity group-hover:opacity-100">
                    {item.hint}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto px-4 pb-4">
        <div className="divider-h mb-3" />
        <div className="flex items-center gap-2">
          <span className={cn(
            'h-1.5 w-1.5 rounded-full',
            ping.isLoading ? 'bg-ink-500 animate-pulse' : ping.data ? 'bg-signal-ok' : 'bg-signal-err',
          )} />
          <span className="font-mono text-ui-xs text-ink-500">
            {ping.isLoading ? 'connecting…' : ping.data ? 'ipc connected' : 'offline'}
          </span>
        </div>
      </div>
    </aside>
  );
}
