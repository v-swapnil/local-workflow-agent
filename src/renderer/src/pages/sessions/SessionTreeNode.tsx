import { cn } from '../../lib/utils';
import { trpc } from '../../trpc';
import { Button } from '../../components/ui/button';
import { ChevronRight, X } from 'lucide-react';

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
          'group flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-all',
          isActive
            ? 'border-amber/20 bg-amber/6 shadow-sm'
            : 'border-transparent hover:border-ink-800/60 hover:bg-ink-800/20',
        )}
      >
        <Button
          variant="ghost"
          size="xs"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-500 hover:bg-ink-800 hover:text-ink-300"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <ChevronRight
            className={cn('h-3 w-3 transition-transform duration-150', isExpanded && 'rotate-90')}
            strokeWidth={1.5}
          />
        </Button>

        <Button
          variant="ghost"
          className="min-w-0 h-auto flex-1 justify-start p-0 text-left font-normal hover:bg-transparent"
          onClick={onSelect}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-ui-sm font-medium tracking-tight',
                isActive ? 'text-ink-50' : 'text-ink-200',
              )}
            >
              {session.title}
            </span>
            {runningCount > 0 && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber" />
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-ui-2xs text-ink-500">
            <span>
              {new Date(session.updatedAt).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {taskCount > 0 && (
              <>
                <span className="text-ink-400">·</span>
                <span>
                  {taskCount} task{taskCount !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        </Button>

        <Button
          variant="ghost"
          size="xs"
          className="invisible shrink-0 rounded p-1 text-ink-600 hover:bg-rose-950/40 hover:text-rose-400 group-hover:visible"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete session"
        >
          <X className="h-3 w-3" strokeWidth={1.2} />
        </Button>
      </div>

      {/* Task tree */}
      {isExpanded && (
        <div className="relative ml-5 mt-0.5 pb-0.5">
          {/* Vertical connector line */}
          <div className="absolute left-0 top-0 bottom-0 w-px bg-ink-800/60" />

          {tasks.data && tasks.data.length > 0 ? (
            tasks.data.map((t, i) => {
              const isLast = i === tasks.data!.length - 1;
              const isFocused = focusedTaskId === t.id;

              return (
                <div key={t.id} className="relative">
                  {/* Horizontal connector */}
                  <div className="absolute left-0 top-[14px] h-px w-3 bg-ink-800/60" />
                  {/* Clip vertical line at last item */}
                  {isLast && (
                    <div
                      className="absolute left-0 top-[14px] bottom-0 w-px bg-ink-900/20"
                      style={{ backgroundColor: 'inherit' }}
                    />
                  )}

                  <Button
                    variant="ghost"
                    onClick={() => onTaskSelect(t.id)}
                    className={cn(
                      'ml-4 mt-0.5 h-auto w-[calc(100%-16px)] justify-start gap-2 rounded-md border px-2.5 py-1.5 text-left font-normal',
                      isFocused
                        ? 'border-amber/15 bg-amber/5 hover:bg-amber/8'
                        : 'border-transparent hover:border-ink-800/40 hover:bg-ink-800/15',
                    )}
                  >
                    {/* Status dot */}
                    <span className="relative flex h-2 w-2 shrink-0">
                      {t.status === 'running' && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber opacity-40" />
                      )}
                      <span
                        className={cn(
                          'relative inline-flex h-2 w-2 rounded-full',
                          t.status === 'running'
                            ? 'bg-amber'
                            : t.status === 'succeeded'
                              ? 'bg-emerald-400'
                              : t.status === 'failed'
                                ? 'bg-rose-400'
                                : t.status === 'cancelled'
                                  ? 'bg-ink-600'
                                  : 'bg-ink-500',
                        )}
                      />
                    </span>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate font-mono text-ui-xs',
                        t.status === 'failed'
                          ? 'text-rose-300/80'
                          : t.status === 'cancelled'
                            ? 'text-ink-500'
                            : isFocused
                              ? 'text-ink-100'
                              : 'text-ink-300',
                      )}
                    >
                      {t.prompt}
                    </span>
                    <span className="shrink-0 font-mono text-ui-2xs text-ink-600">
                      {t.finishedAt
                        ? new Date(t.finishedAt).toLocaleTimeString([], {
                            hour12: false,
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : t.startedAt
                          ? '...'
                          : ''}
                    </span>
                  </Button>
                </div>
              );
            })
          ) : (
            <div className="relative">
              <div className="absolute left-0 top-[12px] h-px w-3 bg-ink-800" />
              <div className="absolute left-0 top-[12px] bottom-0 w-px bg-ink-950" />
              <div className="ml-4 py-2 font-mono text-ui-2xs text-ink-600">no tasks yet</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
