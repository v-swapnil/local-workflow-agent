import { useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Bot, ShieldCheck, Play, Square, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { cn } from '@renderer/lib/utils';
import { useWorkflowEditor } from '../WorkflowEditorContext';

export interface AgentNodeData {
  agentId?: string;
  agentName?: string;
  label?: string;
  [key: string]: unknown;
}

export interface ApprovalNodeData {
  question?: string;
  choices?: string[];
  [key: string]: unknown;
}

type Accent = 'amber' | 'blue' | 'purple' | 'green' | 'red' | 'warn';

const ACCENT: Record<
  Accent,
  { bar: string; icon: string; badge: string; ring: string; handle: string }
> = {
  // amber — warm gold (primary brand color)
  amber: {
    bar: 'bg-amber-500',
    icon: 'text-amber-400',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    ring: 'ring-amber-500/40',
    handle: '!bg-amber-400 !border-amber-600',
  },
  // blue — cool accent-blue
  blue: {
    bar: 'bg-accent-blue',
    icon: 'text-accent-blue',
    badge: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20',
    ring: 'ring-accent-blue/40',
    handle: '!bg-accent-blue !border-accent-blue/60',
  },
  // purple — accent-purple
  purple: {
    bar: 'bg-accent-purple',
    icon: 'text-accent-purple',
    badge: 'bg-accent-purple/10 text-accent-purple border-accent-purple/20',
    ring: 'ring-accent-purple/40',
    handle: '!bg-accent-purple !border-accent-purple/60',
  },
  // green — signal-ok
  green: {
    bar: 'bg-signal-ok',
    icon: 'text-signal-ok',
    badge: 'bg-signal-ok/10 text-signal-ok border-signal-ok/20',
    ring: 'ring-signal-ok/40',
    handle: '!bg-signal-ok !border-signal-ok/60',
  },
  // red — signal-err
  red: {
    bar: 'bg-signal-err',
    icon: 'text-signal-err',
    badge: 'bg-signal-err/10 text-signal-err border-signal-err/20',
    ring: 'ring-signal-err/40',
    handle: '!bg-signal-err !border-signal-err/60',
  },
  // warn — signal-warn (orange, similar to amber but slightly different)
  warn: {
    bar: 'bg-signal-warn',
    icon: 'text-signal-warn',
    badge: 'bg-signal-warn/10 text-signal-warn border-signal-warn/20',
    ring: 'ring-signal-warn/40',
    handle: '!bg-signal-warn !border-signal-warn/60',
  },
};

/** Shared node chrome with left accent bar and always-visible edit fields. */
function NodeShell({
  nodeId,
  accent,
  icon,
  title,
  selected,
  children,
}: {
  nodeId: string;
  accent: Accent;
  icon: React.ReactNode;
  title: string;
  selected: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const { deleteNode } = useWorkflowEditor();
  const a = ACCENT[accent];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'relative w-[220px] overflow-hidden rounded-lg border bg-ink-900 font-mono text-ui-xs shadow-lifted transition-all duration-150',
        selected
          ? `border-transparent ring-2 ${a.ring} shadow-float`
          : 'border-ink-700 hover:border-ink-500',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 pl-4">
        <span className={cn('shrink-0', a.icon)}>{icon}</span>
        <span className={cn('py-0.5 text-ui-2xs tracking-widest2')}>{title}</span>
        <button
          type="button"
          onClick={() => deleteNode(nodeId)}
          className={cn(
            'nodrag ml-auto rounded p-0.5 text-ink-600 transition-colors hover:bg-signal-err/15 hover:text-signal-err',
            !hovered && 'opacity-0',
          )}
          title="Delete"
        >
          <X className="size-3" />
        </button>
      </div>

      {/* Body */}
      <div className="nodrag nowheel space-y-2.5 border-t border-ink-800 bg-ink-950/40 px-3 py-2.5 pl-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-ui-2xs text-ink-500">{label}</span>
      {children}
    </label>
  );
}

export function AgentNode({ id, data, selected }: NodeProps) {
  const d = data as AgentNodeData;
  const { agents, updateNodeData } = useWorkflowEditor();

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className={cn('!h-2 !w-2 !rounded-full !border-2', ACCENT.purple.handle)}
      />
      <NodeShell
        nodeId={id}
        accent="purple"
        icon={<Bot className="size-3.5" />}
        title="agent"
        selected={selected}
      >
        <Field label="agent">
          <Select
            value={d.agentId || '__none__'}
            onValueChange={(v) => {
              const val = v === '__none__' ? '' : v;
              const agent = agents.find((x) => x.id === val);
              updateNodeData(id, { agentId: val, agentName: agent?.name ?? '' });
            }}
          >
            <SelectTrigger className="nodrag h-7 font-mono text-ui-xs text-left">
              <SelectValue placeholder="pick agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— pick agent —</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                  <span className="ml-1 text-ink-500">({agent.role})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="label">
          <Input
            value={d.label ?? ''}
            onChange={(e) => updateNodeData(id, { label: e.target.value })}
            placeholder="optional label"
            className="nodrag h-7 font-mono text-ui-xs"
          />
        </Field>
      </NodeShell>
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn('!h-2 !w-2 !rounded-full !border-2', ACCENT.purple.handle)}
      />
    </>
  );
}

export function ApprovalNode({ id, data, selected }: NodeProps) {
  const d = data as ApprovalNodeData;
  const { updateNodeData } = useWorkflowEditor();

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className={cn('!h-2 !w-2 !rounded-full !border-2', ACCENT.blue.handle)}
      />
      <NodeShell
        nodeId={id}
        accent="blue"
        icon={<ShieldCheck className="size-3.5" />}
        title="approval"
        selected={selected}
      >
        <Field label="question">
          <Textarea
            value={d.question ?? ''}
            onChange={(e) => updateNodeData(id, { question: e.target.value })}
            rows={3}
            placeholder="Approve continuing?"
            className="nodrag resize-none font-mono text-ui-xs"
          />
        </Field>
      </NodeShell>
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn('!h-2 !w-2 !rounded-full !border-2', ACCENT.blue.handle)}
      />
    </>
  );
}

export function StartNode({ selected }: NodeProps) {
  return (
    <div
      className={cn(
        'relative flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-ui-2xs font-medium uppercase tracking-widest2 shadow-sm transition-all',
        selected
          ? 'border-signal-ok/50 bg-signal-ok/10 text-signal-ok ring-2 ring-signal-ok/20'
          : 'border-ink-600 bg-ink-900 text-ink-400 hover:border-ink-500',
      )}
    >
      <Play className="size-2.5 fill-current" />
      start
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !rounded-full !border-2 !bg-signal-ok !border-signal-ok/50"
      />
    </div>
  );
}

export function EndNode({ selected }: NodeProps) {
  return (
    <div
      className={cn(
        'relative flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-ui-2xs font-medium uppercase tracking-widest2 shadow-sm transition-all',
        selected
          ? 'border-signal-err/50 bg-signal-err/10 text-signal-err ring-2 ring-signal-err/20'
          : 'border-ink-600 bg-ink-900 text-ink-400 hover:border-ink-500',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !rounded-full !border-2 !bg-signal-err !border-signal-err/50"
      />
      <Square className="size-2.5 fill-current" />
      end
    </div>
  );
}
