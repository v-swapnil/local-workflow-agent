import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Plus, Bot } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  role: string;
}

interface AgentListProps {
  agents: Agent[];
  selected: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function AgentList({ agents, selected, onSelect, onNew }: AgentListProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-ink-800/60 bg-ink-950">
      <div className="flex items-center justify-between border-b border-ink-800/60 px-4 py-3">
        <span className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">agents</span>
        <Button
          variant="outline"
          size="xs"
          onClick={onNew}
          className="flex items-center gap-1 font-mono hover:border-amber/30 hover:bg-amber/5 hover:text-amber"
        >
          <Plus className="h-2.5 w-2.5" strokeWidth={1.5} />
          new
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-800/40">
              <Bot className="h-4 w-4 text-ink-500" strokeWidth={1.3} />
            </div>
            <span className="font-mono text-ui-xs text-ink-500">no agents yet</span>
          </div>
        ) : (
          <ul className="min-w-0 space-y-0.5 px-2 py-2">
            {agents.map((a, i) => (
              <li key={a.id} className={`animate-slide-up stagger-${Math.min(i + 1, 10)}`}>
                <Button
                  variant="ghost"
                  onClick={() => onSelect(a.id)}
                  className={cn(
                    'group relative h-auto w-full flex-col gap-1.5 rounded-md border px-3 py-2.5 text-left justify-start items-start font-normal',
                    selected === a.id
                      ? 'border-amber/20 bg-ink-800/60 text-ink-100 shadow-sm shadow-amber/5 hover:bg-ink-800/60'
                      : 'border-transparent text-ink-300 hover:border-ink-700/60 hover:bg-ink-800/30 hover:text-ink-100',
                  )}
                >
                  {selected === a.id && (
                    <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-amber" />
                  )}
                  <div className="flex gap-2">
                    <span className="truncate font-mono text-ui-sm font-medium">{a.name}</span>
                  </div>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
