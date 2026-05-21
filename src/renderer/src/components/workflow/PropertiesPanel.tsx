import type { Node, Edge } from '@xyflow/react';

const OPERATORS = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'exists'] as const;

interface Props {
  selectedNode: Node | null;
  selectedEdge: Edge | null;
  agents: { id: string; name: string; role: string }[];
  onUpdateNode: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}

export function PropertiesPanel({ selectedNode, selectedEdge, agents, onUpdateNode, onDelete }: Props) {
  if (!selectedNode && !selectedEdge) {
    return (
      <aside className="flex w-56 shrink-0 flex-col border-l border-ink-800 bg-ink-950 p-4">
        <div className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">properties</div>
        <div className="mt-4 font-mono text-ui-xs text-ink-600">select a node or edge</div>
      </aside>
    );
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-l border-ink-800 bg-ink-950 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
          {selectedNode ? selectedNode.type : 'edge'}
        </div>
        <button
          onClick={onDelete}
          className="font-mono text-ui-xs text-signal-err hover:underline"
          title="Delete"
        >
          delete
        </button>
      </div>

      {selectedNode?.type === 'agent' && (
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-ui-xs text-ink-400">agent</span>
            <select
              value={(selectedNode.data.agentId as string) ?? ''}
              onChange={(e) => {
                const agent = agents.find((a) => a.id === e.target.value);
                onUpdateNode({ agentId: e.target.value, agentName: agent?.name ?? '' });
              }}
              className="rounded border border-ink-700 bg-ink-950 px-2 py-1 font-mono text-ui-xs text-ink-200 focus:border-amber-700/60 focus:outline-none"
            >
              <option value="">— pick agent —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-ui-xs text-ink-400">label</span>
            <input
              value={(selectedNode.data.label as string) ?? ''}
              onChange={(e) => onUpdateNode({ label: e.target.value })}
              placeholder="optional label"
              className="rounded border border-ink-700 bg-ink-950 px-2 py-1 font-mono text-ui-xs text-ink-200 focus:border-amber-700/60 focus:outline-none"
            />
          </label>
        </div>
      )}

      {selectedNode?.type === 'condition' && (
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-ui-xs text-ink-400">field</span>
            <input
              value={(selectedNode.data.field as string) ?? ''}
              onChange={(e) => onUpdateNode({ field: e.target.value })}
              placeholder="agentOutputs.nodeId.ok"
              className="rounded border border-ink-700 bg-ink-950 px-2 py-1 font-mono text-ui-xs text-ink-200 focus:border-amber-700/60 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-ui-xs text-ink-400">operator</span>
            <select
              value={(selectedNode.data.operator as string) ?? 'eq'}
              onChange={(e) => onUpdateNode({ operator: e.target.value })}
              className="rounded border border-ink-700 bg-ink-950 px-2 py-1 font-mono text-ui-xs text-ink-200 focus:border-amber-700/60 focus:outline-none"
            >
              {OPERATORS.map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-ui-xs text-ink-400">value</span>
            <input
              value={String((selectedNode.data.value as unknown) ?? '')}
              onChange={(e) => onUpdateNode({ value: e.target.value })}
              placeholder="true"
              className="rounded border border-ink-700 bg-ink-950 px-2 py-1 font-mono text-ui-xs text-ink-200 focus:border-amber-700/60 focus:outline-none"
            />
          </label>
        </div>
      )}

      {selectedNode?.type === 'approval' && (
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-ui-xs text-ink-400">question</span>
            <textarea
              value={(selectedNode.data.question as string) ?? ''}
              onChange={(e) => onUpdateNode({ question: e.target.value })}
              rows={3}
              placeholder="Approve continuing?"
              className="resize-none rounded border border-ink-700 bg-ink-950 px-2 py-1 font-mono text-ui-xs text-ink-200 focus:border-amber-700/60 focus:outline-none"
            />
          </label>
        </div>
      )}

      {selectedEdge && (
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-ui-xs text-ink-400">label</span>
            <input
              value={(selectedEdge.label as string) ?? ''}
              placeholder="edge label"
              readOnly
              className="rounded border border-ink-700 bg-ink-950 px-2 py-1 font-mono text-ui-xs text-ink-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-ui-xs text-ink-400">max iterations (loops)</span>
            <input
              type="number"
              min={1}
              max={20}
              value={(selectedEdge.data as { maxIterations?: number })?.maxIterations ?? 6}
              readOnly
              className="rounded border border-ink-700 bg-ink-950 px-2 py-1 font-mono text-ui-xs text-ink-500"
            />
          </label>
          <div className="font-mono text-ui-xs text-ink-600">
            edge id: {selectedEdge.id}
          </div>
        </div>
      )}
    </aside>
  );
}
