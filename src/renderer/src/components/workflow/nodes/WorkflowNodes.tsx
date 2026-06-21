import { useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ChevronDown, Settings2, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { cn } from '@renderer/lib/utils';
import { useWorkflowEditor } from '../WorkflowEditorContext';

const OPERATORS = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'exists'] as const;

export interface AgentNodeData {
  agentId?: string;
  agentName?: string;
  label?: string;
  [key: string]: unknown;
}

export interface ConditionNodeData {
  field?: string;
  operator?: string;
  value?: unknown;
  label?: string;
  [key: string]: unknown;
}

export interface ApprovalNodeData {
  question?: string;
  choices?: string[];
  [key: string]: unknown;
}

/** Visual accent per node type so the header + handles read consistently. */
type Accent = 'amber' | 'purple' | 'warn';

const ACCENT: Record<Accent, { selected: string; label: string; handle: string }> = {
  amber: {
    selected: 'border-amber-500 bg-amber-950/30',
    label: 'text-amber-400',
    handle: '!bg-amber-400',
  },
  purple: {
    selected: 'border-purple-500 bg-purple-950/30',
    label: 'text-purple-400',
    handle: '!bg-purple-400',
  },
  warn: {
    selected: 'border-signal-warn/70 bg-signal-warn/10',
    label: 'text-signal-warn',
    handle: '!bg-signal-warn',
  },
};

/** Shared chrome: header (type label, expand toggle, delete) + selection styling. */
function NodeShell({
  nodeId,
  accent,
  title,
  selected,
  summary,
  children,
}: {
  nodeId: string;
  accent: Accent;
  title: string;
  selected: boolean;
  summary: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { deleteNode } = useWorkflowEditor();
  const a = ACCENT[accent];

  return (
    <div
      className={cn(
        'relative min-w-[170px] max-w-[240px] rounded-md border font-mono text-ui-xs shadow-sm transition-colors',
        selected ? a.selected : 'border-ink-600 bg-ink-900 hover:border-ink-500',
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-2">
        <span className={cn('text-ui-2xs uppercase tracking-widest2', a.label)}>{title}</span>
        <div className="flex items-center gap-0.5">
          {children && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="nodrag rounded p-0.5 text-ink-500 hover:bg-ink-800 hover:text-ink-200"
              title={open ? 'Collapse' : 'Edit'}
            >
              {open ? <ChevronDown className="size-3" /> : <Settings2 className="size-3" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => deleteNode(nodeId)}
            className="nodrag rounded p-0.5 text-ink-500 hover:bg-signal-err/15 hover:text-signal-err"
            title="Delete node"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      <div className="px-3 pb-2 pt-1">{summary}</div>

      {open && children && (
        <div className="nodrag nowheel space-y-2 border-t border-ink-800 px-3 py-2">{children}</div>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-ui-2xs text-ink-400">{children}</span>;
}

export function AgentNode({ id, data, selected }: NodeProps) {
  const d = data as AgentNodeData;
  const { agents, updateNodeData } = useWorkflowEditor();

  return (
    <>
      <Handle type="target" position={Position.Top} className={ACCENT.amber.handle} />
      <NodeShell
        nodeId={id}
        accent="amber"
        title="agent"
        selected={selected}
        summary={
          <div className="truncate font-medium text-ink-100">
            {d.label || d.agentName || d.agentId || 'unassigned'}
          </div>
        }
      >
        <label className="flex flex-col gap-1">
          <FieldLabel>agent</FieldLabel>
          <Select
            value={d.agentId || '__none__'}
            onValueChange={(v) => {
              const val = v === '__none__' ? '' : v;
              const agent = agents.find((x) => x.id === val);
              updateNodeData(id, { agentId: val, agentName: agent?.name ?? '' });
            }}
          >
            <SelectTrigger className="nodrag h-7 font-mono text-ui-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— pick agent —</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name} ({agent.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <FieldLabel>label</FieldLabel>
          <Input
            value={d.label ?? ''}
            onChange={(e) => updateNodeData(id, { label: e.target.value })}
            placeholder="optional label"
            className="nodrag h-7 font-mono text-ui-xs"
          />
        </label>
      </NodeShell>
      <Handle type="source" position={Position.Bottom} className={ACCENT.amber.handle} />
    </>
  );
}

export function ConditionNode({ id, data, selected }: NodeProps) {
  const d = data as ConditionNodeData;
  const { updateNodeData } = useWorkflowEditor();

  return (
    <>
      <Handle type="target" position={Position.Top} className={ACCENT.purple.handle} />
      <NodeShell
        nodeId={id}
        accent="purple"
        title="condition"
        selected={selected}
        summary={
          <>
            <div className="truncate text-ink-200">
              {d.field || '—'} {d.operator || 'eq'} {String(d.value ?? '—')}
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-ink-500">
              <span className="text-signal-ok">true</span>
              <span className="text-signal-err">false</span>
            </div>
          </>
        }
      >
        <label className="flex flex-col gap-1">
          <FieldLabel>field</FieldLabel>
          <Input
            value={d.field ?? ''}
            onChange={(e) => updateNodeData(id, { field: e.target.value })}
            placeholder="agentOutputs.nodeId.ok"
            className="nodrag h-7 font-mono text-ui-xs"
          />
        </label>
        <label className="flex flex-col gap-1">
          <FieldLabel>operator</FieldLabel>
          <Select
            value={d.operator ?? 'eq'}
            onValueChange={(v) => updateNodeData(id, { operator: v })}
          >
            <SelectTrigger className="nodrag h-7 font-mono text-ui-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATORS.map((op) => (
                <SelectItem key={op} value={op}>
                  {op}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <FieldLabel>value</FieldLabel>
          <Input
            value={String((d.value as unknown) ?? '')}
            onChange={(e) => updateNodeData(id, { value: e.target.value })}
            placeholder="true"
            className="nodrag h-7 font-mono text-ui-xs"
          />
        </label>
      </NodeShell>
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="!bg-signal-ok"
        style={{ left: '30%' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="!bg-signal-err"
        style={{ left: '70%' }}
      />
    </>
  );
}

export function ApprovalNode({ id, data, selected }: NodeProps) {
  const d = data as ApprovalNodeData;
  const { updateNodeData } = useWorkflowEditor();

  return (
    <>
      <Handle type="target" position={Position.Top} className={ACCENT.warn.handle} />
      <NodeShell
        nodeId={id}
        accent="warn"
        title="approval"
        selected={selected}
        summary={<div className="truncate text-ink-200">{d.question || 'awaiting approval'}</div>}
      >
        <label className="flex flex-col gap-1">
          <FieldLabel>question</FieldLabel>
          <Textarea
            value={d.question ?? ''}
            onChange={(e) => updateNodeData(id, { question: e.target.value })}
            rows={3}
            placeholder="Approve continuing?"
            className="nodrag resize-none font-mono text-ui-xs"
          />
        </label>
      </NodeShell>
      <Handle type="source" position={Position.Bottom} className={ACCENT.warn.handle} />
    </>
  );
}

export function StartNode({ selected }: NodeProps) {
  return (
    <div
      className={cn(
        'relative flex h-10 w-10 items-center justify-center rounded-full border-2 font-mono text-ui-xs font-bold',
        selected
          ? 'border-signal-ok bg-signal-ok/20 text-signal-ok'
          : 'border-ink-500 bg-ink-900 text-ink-400',
      )}
    >
      S
      <Handle type="source" position={Position.Bottom} className="!bg-signal-ok" />
    </div>
  );
}

export function EndNode({ selected }: NodeProps) {
  return (
    <div
      className={cn(
        'relative flex h-10 w-10 items-center justify-center rounded-full border-2 font-mono text-ui-xs font-bold',
        selected
          ? 'border-signal-err bg-signal-err/20 text-signal-err'
          : 'border-ink-500 bg-ink-900 text-ink-400',
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-signal-err" />
      E
    </div>
  );
}
