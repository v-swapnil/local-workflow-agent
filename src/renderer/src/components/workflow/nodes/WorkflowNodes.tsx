import { type NodeProps } from '@xyflow/react';

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
      className={`min-w-[140px] rounded border px-3 py-2 font-mono text-ui-xs shadow-sm ${
        selected ? 'border-amber-500 bg-amber-950/30' : 'border-ink-600 bg-ink-900'
      }`}
    >
      <div className="mb-1 text-ui-xs uppercase tracking-widest2 text-ink-500">agent</div>
      <div className="font-medium text-ink-100">{d.label || d.agentName || d.agentId || '…'}</div>
    </div>
  );
}

export function ConditionNode({ data, selected }: NodeProps) {
  const d = data as ConditionNodeData;
  return (
    <div
      className={`min-w-[140px] rotate-45 rounded border px-3 py-2 font-mono text-ui-xs shadow-sm ${
        selected ? 'border-purple-500 bg-purple-950/30' : 'border-ink-600 bg-ink-900'
      }`}
      style={{ transform: 'none' }}
    >
      <div className="mb-1 text-ui-xs uppercase tracking-widest2 text-purple-400">condition</div>
      <div className="text-ink-200">
        {d.field || '—'} {d.operator || 'eq'} {String(d.value ?? '—')}
      </div>
    </div>
  );
}

export function ApprovalNode({ data, selected }: NodeProps) {
  const d = data as ApprovalNodeData;
  return (
    <div
      className={`min-w-[140px] rounded border px-3 py-2 font-mono text-ui-xs shadow-sm ${
        selected ? 'border-signal-warn/70 bg-signal-warn/10' : 'border-ink-600 bg-ink-900'
      }`}
    >
      <div className="mb-1 text-ui-xs uppercase tracking-widest2 text-signal-warn">approval</div>
      <div className="text-ink-200">{d.question || 'awaiting approval'}</div>
    </div>
  );
}

export function StartNode({ selected }: NodeProps) {
  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 font-mono text-ui-xs font-bold ${
        selected ? 'border-signal-ok bg-signal-ok/20 text-signal-ok' : 'border-ink-500 bg-ink-900 text-ink-400'
      }`}
    >
      S
    </div>
  );
}

export function EndNode({ selected }: NodeProps) {
  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 font-mono text-ui-xs font-bold ${
        selected ? 'border-signal-err bg-signal-err/20 text-signal-err' : 'border-ink-500 bg-ink-900 text-ink-400'
      }`}
    >
      E
    </div>
  );
}
