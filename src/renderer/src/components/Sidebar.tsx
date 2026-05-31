import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils';
import { trpc } from '../trpc';
import { Separator } from './ui/separator';
import { LayoutList, Columns3, GitCompareArrows, GitFork, Code, Star, Bot, Network, Clock, Wrench, Settings } from 'lucide-react';

const ICON_CLASS = 'h-3.5 w-3.5';
const ICONS: Record<string, JSX.Element> = {
  sessions: <LayoutList className={ICON_CLASS} strokeWidth={1.3} />,
  board: <Columns3 className={ICON_CLASS} strokeWidth={1.3} />,
  changes: <GitCompareArrows className={ICON_CLASS} strokeWidth={1.3} />,
  worktrees: <GitFork className={ICON_CLASS} strokeWidth={1.3} />,
  files: <Code className={ICON_CLASS} strokeWidth={1.3} />,
  skills: <Star className={ICON_CLASS} strokeWidth={1.3} />,
  agents: <Bot className={ICON_CLASS} strokeWidth={1.3} />,
  workflows: <Network className={ICON_CLASS} strokeWidth={1.3} />,
  schedules: <Clock className={ICON_CLASS} strokeWidth={1.3} />,
  tools: <Wrench className={ICON_CLASS} strokeWidth={1.3} />,
  settings: <Settings className={ICON_CLASS} strokeWidth={1.3} />,
};

const BASE_NAV: { to: string; label: string; icon: string; hint: string }[] = [
  { to: '/sessions', label: 'sessions', icon: 'sessions', hint: '⌘1' },
  { to: '/board', label: 'board', icon: 'board', hint: '⌘2' },
  { to: '/changes', label: 'changes', icon: 'changes', hint: '⌘3' },
  { to: '/worktrees', label: 'worktrees', icon: 'worktrees', hint: '' },
  { to: '/files', label: 'files', icon: 'files', hint: '⌘4' },
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

      <Separator className="mx-4 mb-1 mt-2 bg-ink-800/60" />

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
        <Separator className="mb-3 bg-ink-800/60" />
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
