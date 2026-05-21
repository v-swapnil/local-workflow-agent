const PALETTE_NODES = [
  { type: 'agent', label: 'Agent', color: 'text-amber-400 border-amber-700/50' },
  { type: 'condition', label: 'Condition', color: 'text-purple-400 border-purple-700/50' },
  { type: 'approval', label: 'Approval', color: 'text-signal-warn border-signal-warn/50' },
  { type: 'end', label: 'End', color: 'text-signal-err border-signal-err/50' },
];

export function NodePalette() {
  function onDragStart(event: React.DragEvent, nodeType: string) {
    event.dataTransfer.setData('nodeType', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }

  return (
    <aside className="flex w-36 shrink-0 flex-col border-r border-ink-800 bg-ink-950 p-3">
      <div className="mb-3 font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
        palette
      </div>
      <div className="flex flex-col gap-2">
        {PALETTE_NODES.map(({ type, label, color }) => (
          <div
            key={type}
            draggable
            onDragStart={(e) => onDragStart(e, type)}
            className={`cursor-grab rounded border px-3 py-2 font-mono text-ui-xs font-medium select-none ${color} bg-ink-900 hover:bg-ink-800 active:cursor-grabbing`}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="mt-4 font-mono text-ui-xs text-ink-600">
        drag onto canvas
      </div>
    </aside>
  );
}
