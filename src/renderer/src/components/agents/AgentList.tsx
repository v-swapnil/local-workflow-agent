import { Button } from '../ui/button';
import { Plus, Bot, X } from 'lucide-react';
import { SidebarListItem } from '../ui/sidebar-list-item';

interface Agent {
  id: string;
  name: string;
  role: string;
  description?: string | null;
}

interface AgentListProps {
  agents: Agent[];
  selected: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function AgentList({ agents, selected, onSelect, onNew, onDelete }: AgentListProps) {
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
          <ul className="min-w-0 space-y-px px-2 py-2">
            {agents.map((a, i) => (
              <li key={a.id} className={`animate-slide-up stagger-${Math.min(i + 1, 10)}`}>
                <SidebarListItem
                  title={a.name}
                  isActive={selected === a.id}
                  onSelect={() => onSelect(a.id)}
                  subtitle={[a.role, a.description?.trim()].filter(Boolean).join(' · ') || undefined}
                  actions={
                    <Button
                      variant="ghost"
                      size="xs"
                      className="shrink-0 rounded p-1 text-ink-600 hover:bg-rose-950/40 hover:text-rose-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(a.id);
                      }}
                      title="Delete agent"
                    >
                      <X className="h-3 w-3" strokeWidth={1.2} />
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
