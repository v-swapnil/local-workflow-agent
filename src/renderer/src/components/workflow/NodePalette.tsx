import { Bot, ShieldCheck, type LucideIcon } from 'lucide-react';

const PALETTE_NODES: {
  type: string;
  label: string;
  icon: LucideIcon;
  color: string;
}[] = [
  { type: 'agent', label: 'Agent', icon: Bot, color: 'text-amber-400 border-amber-700/50' },
  {
    type: 'approval',
    label: 'Approval',
    icon: ShieldCheck,
    color: 'text-signal-warn border-signal-warn/50',
  },
];

export function NodePalette() {
  function onDragStart(event: React.DragEvent, nodeType: string) {
    event.dataTransfer.setData('nodeType', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div className="w-40 rounded-md border border-ink-800 bg-ink-950/90 p-2 shadow-lg backdrop-blur-sm">
      <div className="mb-2 px-1 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
        palette
      </div>
      <div className="flex flex-col gap-1.5">
        {PALETTE_NODES.map(({ type, label, icon: Icon, color }) => (
          <div
            key={type}
            draggable
            onDragStart={(e) => onDragStart(e, type)}
            className={`flex cursor-grab items-center gap-2 rounded border px-2.5 py-1.5 font-mono text-ui-xs font-medium select-none ${color} bg-ink-900 transition-colors hover:bg-ink-800 active:cursor-grabbing`}
          >
            <Icon className="size-3.5 shrink-0" />
            {label}
          </div>
        ))}
      </div>
      <div className="mt-2 px-1 font-mono text-ui-2xs text-ink-600">drag onto canvas</div>
    </div>
  );
}
