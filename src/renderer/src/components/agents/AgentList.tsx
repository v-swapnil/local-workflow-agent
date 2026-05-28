import { cn } from '../../lib/utils';
import { PROVIDERS } from '@shared/constants';
import { RoleBadge, ModelTag } from './AgentFormPrimitives';

interface Agent {
  id: string;
  name: string;
  role: string;
  model: string;
  provider?: string;
}

interface AgentListProps {
  agents: Agent[];
  selected: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function AgentList({ agents, selected, onSelect, onNew }: AgentListProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-ink-800/60 bg-ink-950">
      <div className="flex items-center justify-between border-b border-ink-800/60 px-4 py-3">
        <span className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">agents</span>
        <button
          onClick={onNew}
          className="flex items-center gap-1 rounded-md border border-ink-700/60 bg-ink-800/30 px-2 py-1 font-mono text-ui-xs text-ink-300 transition-all hover:border-amber/30 hover:bg-amber/5 hover:text-amber"
        >
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-2.5 w-2.5">
            <path d="M6 2v8M2 6h8" />
          </svg>
          new
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-800/40">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" className="h-4 w-4 text-ink-500">
                <rect x="3" y="3" width="10" height="8" rx="2" />
                <circle cx="6" cy="7" r="1" fill="currentColor" stroke="none" />
                <circle cx="10" cy="7" r="1" fill="currentColor" stroke="none" />
                <path d="M5 13h6M6 11v2M10 11v2" />
              </svg>
            </div>
            <span className="font-mono text-ui-xs text-ink-500">no agents yet</span>
          </div>
        ) : (
          <ul className="space-y-0.5 px-2 py-2">
            {agents.map((a, i) => (
              <li key={a.id} className={`animate-slide-up stagger-${Math.min(i + 1, 10)}`}>
                <button
                  onClick={() => onSelect(a.id)}
                  className={cn(
                    'group relative flex w-full flex-col gap-1.5 rounded-md border px-3 py-2.5 text-left transition-all',
                    selected === a.id
                      ? 'border-amber/20 bg-ink-800/60 text-ink-100 shadow-sm shadow-amber/5'
                      : 'border-transparent text-ink-300 hover:border-ink-700/60 hover:bg-ink-800/30 hover:text-ink-100',
                  )}
                >
                  {selected === a.id && (
                    <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-amber" />
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-ui-sm font-medium">{a.name}</span>
                    <RoleBadge role={a.role} />
                  </div>
                  <ModelTag model={a.model} provider={a.provider ?? PROVIDERS.OLLAMA} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
