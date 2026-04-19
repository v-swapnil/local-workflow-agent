import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils';
import { trpc } from '../trpc';

const NAV: { to: string; label: string; hint: string }[] = [
  { to: '/sessions', label: 'sessions', hint: '01' },
  { to: '/editor', label: 'editor', hint: '02' },
  { to: '/skills', label: 'skills', hint: '03' },
  { to: '/agents', label: 'agents', hint: '04' },
  { to: '/schedules', label: 'schedules', hint: '05' },
  { to: '/tools', label: 'tools', hint: '06' },
  { to: '/settings', label: 'settings', hint: '07' },
];

export function Sidebar() {
  const ping = trpc.ping.useQuery('hello');

  return (
    <aside className="relative flex w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-950">
      <div className="px-5 pb-4 pt-6">
        <div className="font-serif text-2xl leading-none text-amber">[ASE]</div>
        <p className="mt-3 max-w-[180px] font-mono text-[10px] uppercase leading-relaxed tracking-widest2 text-ink-400">
          plan · write · run · test · <span className="text-ink-200">iterate</span>
        </p>
      </div>

      <div className="hair mx-5 h-px" />

      <nav className="flex flex-col gap-px px-3 py-4">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'group flex items-center justify-between rounded-sm px-2 py-1.5 font-mono text-[12px] tracking-wide transition-colors',
                isActive
                  ? 'bg-ink-800/80 text-ink-50'
                  : 'text-ink-300 hover:bg-ink-900 hover:text-ink-100',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className="flex items-center gap-2">
                  <span className={cn('text-[10px]', isActive ? 'text-amber' : 'text-ink-500')}>
                    {isActive ? '▸' : '·'}
                  </span>
                  <span>/{item.label}</span>
                </span>
                <span className="text-[10px] text-ink-500">{item.hint}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto px-5 pb-5">
        <div className="hair mb-4 h-px" />
        <div className="font-mono text-[10px] uppercase tracking-widest2 text-ink-500">ipc</div>
        <div className="mt-1 font-mono text-[11px] text-ink-300">
          {ping.isLoading ? '…' : ping.data ? `${ping.data.pong} · ok` : 'offline'}
        </div>
      </div>
    </aside>
  );
}
