import { cn } from '../../lib/utils';
import { trpc } from '../../trpc';
import { StatusPill } from './StatusPill';

export function SessionTreeNode({
  session,
  isActive,
  isExpanded,
  focusedTaskId,
  onSelect,
  onToggle,
  onDelete,
  onTaskSelect,
}: {
  session: { id: string; title: string; updatedAt: number };
  isActive: boolean;
  isExpanded: boolean;
  focusedTaskId: string | null;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onTaskSelect: (taskId: string) => void;
}) {
  const tasks = trpc.task.list.useQuery(
    { sessionId: session.id },
    { refetchInterval: isActive ? 2000 : false },
  );

  const taskCount = tasks.data?.length ?? 0;
  const runningCount = tasks.data?.filter((t) => t.status === 'running').length ?? 0;

  return (
    <div>
      {/* Session row */}
      <div
        className={cn(
          'group flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-all',
          isActive
            ? 'border-amber-700/50 bg-amber-950/20 shadow-sm shadow-amber-950/20'
            : 'border-transparent hover:border-ink-800 hover:bg-ink-900/30',
        )}
      >
        <button
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-300"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <svg
            className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-90')}
            viewBox="0 0 8 10"
            fill="currentColor"
          >
            <path d="M1 1l6 4-6 4V1z" />
          </svg>
        </button>

        <button className="min-w-0 flex-1 text-left" onClick={onSelect}>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-serif text-ui-base text-ink-50">
              {session.title}
            </span>
            {runningCount > 0 && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
              </span>
            )}
          </div>
          <div className="font-mono text-ui-xs text-ink-500">
            {new Date(session.updatedAt).toLocaleString()}
            {tasks.data ? ` · ${tasks.data.length} tasks` : ''}
          </div>
        </button>

        <span
          className="invisible shrink-0 cursor-pointer rounded p-1 font-mono text-ui-xs text-ink-500 transition-colors hover:bg-rose-950/30 hover:text-rose-400 group-hover:visible"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete session"
        >
          del
        </span>
      </div>

      {/* Task tree */}
      {isExpanded && (
        <div className="relative ml-[18px] mt-0.5 pb-0.5">
          {/* Vertical connector line */}
          <div className="absolute left-0 top-0 bottom-0 w-px bg-ink-800" />

          {tasks.data && tasks.data.length > 0 ? (
            tasks.data.map((t, i) => {
              const isLast = i === tasks.data!.length - 1;
              const isFocused = focusedTaskId === t.id;

              return (
                <div key={t.id} className="relative">
                  {/* Horizontal connector */}
                  <div className="absolute left-0 top-[16px] h-px w-3 bg-ink-800" />
                  {/* Clip vertical line at last item */}
                  {isLast && (
                    <div className="absolute left-0 top-[16px] bottom-0 w-px bg-ink-950" />
                  )}

                  <button
                    onClick={() => onTaskSelect(t.id)}
                    className={cn(
                      'ml-4 mt-0.5 flex w-[calc(100%-16px)] flex-col gap-1 rounded-md border px-2.5 py-2 text-left transition-all',
                      isFocused
                        ? 'border-amber-800/40 bg-amber-950/25 shadow-sm shadow-amber-950/10'
                        : 'border-transparent hover:border-ink-800 hover:bg-ink-900/30',
                    )}
                  >
                    {/* Task prompt */}
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-ui-xs text-ink-600">
                        #{tasks.data!.length - i}
                      </span>
                      <span
                        className={`text-ui-xs min-w-0 flex-1 truncate font-mono text-ink-200 ${isFocused ? 'text-ink-100' : ''}`}
                      >
                        {t.prompt}
                      </span>
                    </div>

                    {/* Task meta row */}
                    <div className="flex items-center gap-2 pl-5">
                      <StatusPill status={t.status} compact />
                      <span className="font-mono text-ui-2xs text-ink-600">
                        {t.finishedAt
                          ? new Date(t.finishedAt).toLocaleTimeString([], { hour12: false })
                          : t.startedAt
                            ? 'running…'
                            : 'queued'}
                      </span>
                      {t.iterations > 0 && (
                        <span className="font-mono text-ui-2xs text-ink-600">
                          {t.iterations}/{t.maxIterations} iter
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              );
            })
          ) : (
            <div className="relative">
              <div className="absolute left-0 top-[12px] h-px w-3 bg-ink-800" />
              <div className="absolute left-0 top-[12px] bottom-0 w-px bg-ink-950" />
              <div className="ml-4 py-2 font-mono text-ui-2xs text-ink-600 italic">
                no tasks yet
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
