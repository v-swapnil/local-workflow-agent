import type { TaskEventRecord } from '@shared/schema';
import { cn } from '../../lib/utils';
import { summarizeToolCall, summarizeToolResult } from './toolSummary';
import { Play, Square, StepForward } from 'lucide-react';

export function EventRow({ ev }: { ev: TaskEventRecord & { ts: number } }) {
  const t = new Date(ev.ts).toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  switch (ev.type) {
    case 'task.started':
      return (
        <Line ts={t} tone="ink">
          <span className="flex items-center gap-1.5 font-mono text-ui-2xs uppercase tracking-widest2 text-amber">
            <Play className="h-2 w-2" fill="currentColor" strokeWidth={0} />
            task started
          </span>
        </Line>
      );
    case 'task.finished':
      return (
        <Line ts={t} tone="ink">
          <span
            className={cn(
              'flex items-center gap-1.5 font-mono text-ui-2xs uppercase tracking-widest2',
              ev.status === 'succeeded'
                ? 'text-emerald-400'
                : ev.status === 'cancelled'
                  ? 'text-ink-500'
                  : 'text-rose-400',
            )}
          >
            <Square className="h-2 w-2" fill="currentColor" strokeWidth={0} />
            task {ev.status}
          </span>
        </Line>
      );
    case 'step.started':
      return (
        <Line ts={t} tone="ink">
          <span className="text-ink-500">→</span> <span className="text-ink-400">{ev.agentId}</span>
        </Line>
      );
    case 'step.finished':
      return (
        <Line ts={t} tone={ev.status === 'succeeded' ? 'ink' : 'rose'}>
          <span className="text-ink-500">←</span>{' '}
          {ev.status === 'succeeded' ? (
            <span className="text-emerald-400">✓ done</span>
          ) : (
            <span className="text-rose-400">✗ {ev.status}</span>
          )}
        </Line>
      );
    case 'tool_call.started':
      return (
        <Line ts={t} tone="ink">
          <span className="text-ink-500">→</span>{' '}
          <span className="text-ink-400">{ev.toolCallId}</span>
          <span className="text-ink-600"> · </span>
          <span className="text-ink-300">
            {summarizeToolCall(ev.tool, ev.input as Record<string, unknown>)}
          </span>
        </Line>
      );
    case 'tool_call.finished':
      return (
        <Line ts={t} tone={ev.status === 'success' ? 'ink' : 'rose'}>
          <span className="text-ink-500">←</span>{' '}
          {ev.status === 'success' ? (
            <span className="text-emerald-400">
              ✓ {summarizeToolResult(ev.tool, true, ev.output)}
            </span>
          ) : (
            <span className="text-rose-400">
              ✗ {summarizeToolResult(ev.tool, false, undefined, ev.error)}
            </span>
          )}
        </Line>
      );
    case 'log':
    case 'log.info':
    case 'log.error':
      return (
        <Line ts={t} tone={ev.type === 'log.error' ? 'rose' : 'ink'} dim>
          {ev.content}
        </Line>
      );
    case 'approval.requested':
      return (
        <Line ts={t} tone="amber">
          <span className="inline-flex items-center gap-1">
            <StepForward className="h-3 w-3" fill="currentColor" strokeWidth={0} />
            approval · <span className="text-ink-200">{summarizeToolCall(ev.tool, ev.args)}</span>
          </span>
        </Line>
      );
    case 'approval.decided':
      return (
        <Line ts={t} tone={ev.status === 'denied' ? 'rose' : 'emerald'}>
          approval {ev.status}
        </Line>
      );
    case 'llm.delta':
      return (
        <Line ts={t} tone="emerald" dim>
          {ev.content}
        </Line>
      );
    case 'llm.thinking_delta':
      return (
        <Line ts={t} tone="purple" dim>
          {ev.content}
        </Line>
      );
    case 'user_input.requested':
      return (
        <Line ts={t} tone="sky">
          ✋ {ev.content}
        </Line>
      );
    case 'user_input.responded':
      return (
        <Line ts={t} tone="sky">
          ✓ {ev.content || '(skipped)'}
        </Line>
      );
    default:
      return null;
  }
}

function Line({
  ts,
  tone,
  dim,
  children,
}: {
  ts: string;
  tone: 'amber' | 'emerald' | 'rose' | 'ink' | 'purple' | 'sky';
  dim?: boolean;
  children: React.ReactNode;
}) {
  const colour = {
    amber: 'text-amber',
    emerald: dim ? 'text-emerald-400/70' : 'text-emerald-400',
    rose: 'text-rose-400',
    purple: dim ? 'text-purple-400/70' : 'text-purple-400',
    ink: dim ? 'text-ink-500' : 'text-ink-200',
    sky: 'text-sky-400',
  }[tone];
  return (
    <div className="grid grid-cols-[auto_1fr] gap-3 py-px">
      <span className="shrink-0 select-none font-mono text-ui-2xs text-ink-600 tabular-nums">
        {ts}
      </span>
      <span className={cn('min-w-0 whitespace-pre-wrap break-words text-ui-xs', colour)}>
        {children}
      </span>
    </div>
  );
}
