import type { Node, Edge } from '@xyflow/react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { Label } from '../ui/label';

const OPERATORS = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'exists'] as const;

interface PropertiesPanelProps {
  selectedNode: Node | null;
  selectedEdge: Edge | null;
  agents: { id: string; name: string; role: string }[];
  onUpdateNode: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}

export function PropertiesPanel({ selectedNode, selectedEdge, agents, onUpdateNode, onDelete }: PropertiesPanelProps) {
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
        <Button
          variant="ghost"
          className="h-auto p-0 font-mono text-ui-xs text-signal-err"
          onClick={onDelete}
          title="Delete"
        >
          delete
        </Button>
      </div>

      {selectedNode?.type === 'agent' && (
        <div className="space-y-3">
          <Label className="flex flex-col gap-1 font-normal leading-normal">
            <span className="font-mono text-ui-xs text-ink-400">agent</span>
            <Select
              value={(selectedNode.data.agentId as string) || '__none__'}
              onValueChange={(v) => {
                const val = v === '__none__' ? '' : v;
                const agent = agents.find((a) => a.id === val);
                onUpdateNode({ agentId: val, agentName: agent?.name ?? '' });
              }}
            >
              <SelectTrigger className="font-mono text-ui-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— pick agent —</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>
          <Label className="flex flex-col gap-1 font-normal leading-normal">
            <span className="font-mono text-ui-xs text-ink-400">label</span>
            <Input
              value={(selectedNode.data.label as string) ?? ''}
              onChange={(e) => onUpdateNode({ label: e.target.value })}
              placeholder="optional label"
              className="font-mono text-ui-xs"
            />
          </Label>
        </div>
      )}

      {selectedNode?.type === 'condition' && (
        <div className="space-y-3">
          <Label className="flex flex-col gap-1 font-normal leading-normal">
            <span className="font-mono text-ui-xs text-ink-400">field</span>
            <Input
              value={(selectedNode.data.field as string) ?? ''}
              onChange={(e) => onUpdateNode({ field: e.target.value })}
              placeholder="agentOutputs.nodeId.ok"
              className="font-mono text-ui-xs"
            />
          </Label>
          <Label className="flex flex-col gap-1 font-normal leading-normal">
            <span className="font-mono text-ui-xs text-ink-400">operator</span>
            <Select
              value={(selectedNode.data.operator as string) ?? 'eq'}
              onValueChange={(v) => onUpdateNode({ operator: v })}
            >
              <SelectTrigger className="font-mono text-ui-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATORS.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>
          <Label className="flex flex-col gap-1 font-normal leading-normal">
            <span className="font-mono text-ui-xs text-ink-400">value</span>
            <Input
              value={String((selectedNode.data.value as unknown) ?? '')}
              onChange={(e) => onUpdateNode({ value: e.target.value })}
              placeholder="true"
              className="font-mono text-ui-xs"
            />
          </Label>
        </div>
      )}

      {selectedNode?.type === 'approval' && (
        <div className="space-y-3">
          <Label className="flex flex-col gap-1 font-normal leading-normal">
            <span className="font-mono text-ui-xs text-ink-400">question</span>
            <Textarea
              value={(selectedNode.data.question as string) ?? ''}
              onChange={(e) => onUpdateNode({ question: e.target.value })}
              rows={3}
              placeholder="Approve continuing?"
              className="resize-none font-mono text-ui-xs"
            />
          </Label>
        </div>
      )}

      {selectedEdge && (
        <div className="space-y-3">
          <Label className="flex flex-col gap-1 font-normal leading-normal">
            <span className="font-mono text-ui-xs text-ink-400">label</span>
            <Input
              value={(selectedEdge.label as string) ?? ''}
              placeholder="edge label"
              readOnly
              className="font-mono text-ui-xs text-ink-500"
            />
          </Label>
          <Label className="flex flex-col gap-1 font-normal leading-normal">
            <span className="font-mono text-ui-xs text-ink-400">max iterations (loops)</span>
            <Input
              type="number"
              min={1}
              max={20}
              value={(selectedEdge.data as { maxIterations?: number })?.maxIterations ?? 6}
              readOnly
              className="font-mono text-ui-xs text-ink-500"
            />
          </Label>
          <div className="font-mono text-ui-xs text-ink-600">
            edge id: {selectedEdge.id}
          </div>
        </div>
      )}
    </aside>
  );
}
