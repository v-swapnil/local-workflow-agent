import { Handle, Position, type NodeProps } from '@xyflow/react';

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

export function AgentNode({ data, selected }: NodeProps) {
  const d = data as AgentNodeData;
  return (
    <div
      className={`relative min-w-[140px] rounded border px-3 py-2 font-mono text-ui-xs shadow-sm ${
        selected ? 'border-amber-500 bg-amber-950/30' : 'border-ink-600 bg-ink-900'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-ink-400" />
      <div className="mb-1 text-ui-xs uppercase tracking-widest2 text-ink-500">agent</div>
      <div className="font-medium text-ink-100">{d.label || d.agentName || d.agentId || '…'}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-ink-400" />
    </div>
  );
}

export function ConditionNode({ data, selected }: NodeProps) {
  const d = data as ConditionNodeData;
  return (
    <div
      className={`relative min-w-[140px] rounded border px-3 py-2 font-mono text-ui-xs shadow-sm ${
        selected ? 'border-purple-500 bg-purple-950/30' : 'border-ink-600 bg-ink-900'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-purple-400" />
      <div className="mb-1 text-ui-xs uppercase tracking-widest2 text-purple-400">condition</div>
      <div className="text-ink-200">
        {d.field || '—'} {d.operator || 'eq'} {String(d.value ?? '—')}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-ink-500">
        <span>true</span>
        <span>false</span>
      </div>
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
    </div>
  );
}

export function ApprovalNode({ data, selected }: NodeProps) {
  const d = data as ApprovalNodeData;
  return (
    <div
      className={`relative min-w-[140px] rounded border px-3 py-2 font-mono text-ui-xs shadow-sm ${
        selected ? 'border-signal-warn/70 bg-signal-warn/10' : 'border-ink-600 bg-ink-900'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-signal-warn" />
      <div className="mb-1 text-ui-xs uppercase tracking-widest2 text-signal-warn">approval</div>
      <div className="text-ink-200">{d.question || 'awaiting approval'}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-signal-warn" />
    </div>
  );
}

export function StartNode({ selected }: NodeProps) {
  return (
    <div
      className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 font-mono text-ui-xs font-bold ${
        selected ? 'border-signal-ok bg-signal-ok/20 text-signal-ok' : 'border-ink-500 bg-ink-900 text-ink-400'
      }`}
    >
      S
      <Handle type="source" position={Position.Bottom} className="!bg-signal-ok" />
    </div>
  );
}

export function EndNode({ selected }: NodeProps) {
  return (
    <div
      className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 font-mono text-ui-xs font-bold ${
        selected ? 'border-signal-err bg-signal-err/20 text-signal-err' : 'border-ink-500 bg-ink-900 text-ink-400'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-signal-err" />
      E
    </div>
  );
}
