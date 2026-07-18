import { cn, relativeTime } from '../../lib/utils';
import { trpc } from '../../trpc';
import { Button } from '../../components/ui/button';
import { TreeNode, TreeLeaf, TreeStatusDot } from '../../components/ui/tree-node';
import type { TreeDotTone } from '../../components/ui/tree-node';
import { X } from 'lucide-react';

const TASK_DOT_TONE: Record<string, TreeDotTone> = {
  running: 'active',
  succeeded: 'ok',
  failed: 'err',
  cancelled: 'muted',
};

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
      <TreeNode
        isActive={isActive}
        isExpanded={isExpanded}
        onExpandedChange={onToggle}
        onSelect={onSelect}
        content={
          <>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-ui-sm font-medium tracking-tight',
                  isActive ? 'text-ink-50' : 'text-ink-200',
                )}
              >
                {session.title}
              </span>
              {runningCount > 0 && <TreeStatusDot tone="active" pulse />}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-ui-2xs text-ink-500">
              <span>{relativeTime(session.updatedAt)}</span>
              {taskCount > 0 && (
                <>
                  <span className="text-ink-400">·</span>
                  <span>
                    {taskCount} task{taskCount !== 1 ? 's' : ''}
                  </span>
                </>
              )}
            </div>
          </>
        }
        actions={
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
        }
      >
        {tasks.data && tasks.data.length > 0 ? (
          tasks.data.map((t, i) => {
            const isLast = i === tasks.data!.length - 1;
            const isFocused = focusedTaskId === t.id;

            return (
              <TreeLeaf
                key={t.id}
                isActive={isFocused}
                isLast={isLast}
                onSelect={() => onTaskSelect(t.id)}
                content={
                  <>
                    <TreeStatusDot
                      tone={TASK_DOT_TONE[t.status] ?? 'idle'}
                      pulse={t.status === 'running'}
                    />
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
                  </>
                }
              />
            );
          })
        ) : (
          <div className="relative">
            <div className="absolute left-0 top-[12px] h-px w-3 bg-ink-800" />
            <div className="absolute left-0 top-[12px] bottom-0 w-px bg-ink-950" />
            <div className="ml-4 py-2 font-mono text-ui-2xs text-ink-600">no tasks yet</div>
          </div>
        )}
      </TreeNode>
    </div>
  );
}
