import { cn } from '../../lib/utils';
import type { TaskEvent } from './types';

export function EventRow({ ev }: { ev: TaskEvent }) {
  const t = new Date(ev.ts).toLocaleTimeString([], { hour12: false });

  switch (ev.type) {
    case 'task.started':
      return (
        <Line ts={t} tone="amber">
          ▶ task started
        </Line>
      );
    case 'task.finished':
      return (
        <Line
          ts={t}
          tone={ev.status === 'succeeded' ? 'emerald' : ev.status === 'cancelled' ? 'ink' : 'rose'}
        >
          ■ task {ev.status}
          {ev.error ? ` · ${ev.error.slice(0, 200)}` : ''}
        </Line>
      );
    case 'plan':
      return (
        <div className="my-1 rounded border border-ink-800 bg-ink-900/30 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-ui-xs text-ink-600">{t}</span>
            <span className="font-mono text-ui-xs uppercase tracking-widest2 text-amber-400">
              ▣ plan
            </span>
          </div>
          <div className="mt-1 font-serif text-ui-sm italic text-ink-200">{ev.plan.summary}</div>
          {ev.plan.selectedSkills && ev.plan.selectedSkills.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {ev.plan.selectedSkills.map((s) => (
                <span
                  key={s}
                  className="rounded border border-amber-700/60 bg-amber-950/20 px-1.5 py-0.5 font-mono text-ui-2xs uppercase tracking-widest2 text-amber-300"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
          <ol className="mt-1 space-y-0.5 font-mono text-ui-xs">
            {ev.plan.steps.map((s, i) => (
              <li key={s.id} className="text-ink-300">
                <span className="text-ink-500">{i + 1}.</span> {s.goal}
              </li>
            ))}
          </ol>
        </div>
      );
    case 'step.started':
      return (
        <Line ts={t} tone="ink">
          → {ev.agent}
          {ev.tool ? `:${ev.tool}` : ''}
        </Line>
      );
    case 'step.finished':
      return (
        <Line ts={t} tone={ev.ok ? 'ink' : 'rose'}>
          ← step {ev.ok ? 'ok' : `fail · ${(ev.error ?? '').slice(0, 200)}`}
        </Line>
      );
    case 'log':
      return (
        <Line ts={t} tone={ev.stream === 'stderr' ? 'rose' : 'ink'} dim>
          {ev.text.replace(/\n+$/, '')}
        </Line>
      );
    case 'critic':
      return (
        <div className="my-1 rounded border border-ink-800 bg-ink-900/30 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-ui-xs text-ink-600">{t}</span>
            <span
              className={cn(
                'font-mono text-ui-xs uppercase tracking-widest2',
                ev.verdict.done ? 'text-emerald-400' : 'text-amber-400',
              )}
            >
              ⚖ {ev.verdict.done ? 'done' : 'continue'}
            </span>
          </div>
          <div className="mt-1 font-mono text-ui-xs text-ink-300">{ev.verdict.reason}</div>
          {ev.verdict.nextHint && (
            <div className="mt-0.5 font-mono text-ui-xs text-ink-500">
              hint: {ev.verdict.nextHint}
            </div>
          )}
        </div>
      );
    case 'approval.requested':
      return (
        <Line ts={t} tone="amber">
          ⚑ approval requested · {ev.tool}
        </Line>
      );
    case 'approval.decided':
      return (
        <Line ts={t} tone={ev.decision === 'deny' ? 'rose' : 'emerald'}>
          ⚐ approval {ev.decision}
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
          💭 {ev.content}
        </Line>
      );
    case 'task.iteration':
      return (
        <Line ts={t} tone="amber">
          ↻ iteration {ev.iteration}
        </Line>
      );
    case 'user_input.requested':
      return (
        <Line ts={t} tone="sky">
          ✋ question: {ev.question}
        </Line>
      );
    case 'user_input.responded':
      return (
        <Line ts={t} tone="sky">
          ✓ answered: {ev.answer || '(skipped)'}
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
    amber: 'text-amber-300',
    emerald: 'text-emerald-300',
    rose: 'text-rose-300',
    purple: dim ? 'text-purple-400' : 'text-purple-300',
    ink: dim ? 'text-ink-400' : 'text-ink-200',
    sky: 'text-sky-300',
  }[tone];
  return (
    <div className="grid grid-cols-[auto_1fr] gap-3">
      <span className="shrink-0 select-none font-mono text-ui-xs text-ink-600">{ts}</span>
      <span className={cn('min-w-0 whitespace-pre-wrap break-words', colour)}>{children}</span>
    </div>
  );
}
