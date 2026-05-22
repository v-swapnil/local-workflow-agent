import { useEffect, useState } from 'react';
import { trpc } from '../../trpc';
import { cn } from '../../lib/utils';
import { TaskView } from './TaskView';
import { AdvancedOptions } from '../../components/sessions/AdvancedOptions';

export function SessionDetail({
  sessionId,
  focusedTaskId,
  onTaskFocus,
}: {
  sessionId: string;
  focusedTaskId: string | null;
  onTaskFocus: (id: string | null) => void;
}) {
  const utils = trpc.useUtils();
  const session = trpc.session.get.useQuery({ id: sessionId });
  const tasks = trpc.task.list.useQuery({ sessionId }, { refetchInterval: 2000 });
  const worktree = trpc.worktree.getForSession.useQuery({ sessionId });
  const openPath = trpc.worktree.openPath.useMutation();
  const [prompt, setPrompt] = useState('');
  const [modelOverride, setModelOverride] = useState('');
  const [agentId, setAgentId] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const create = trpc.task.create.useMutation({
    onSuccess: async (t) => {
      await utils.task.list.invalidate({ sessionId });
      await utils.session.get.invalidate({ id: sessionId });
      onTaskFocus(t.id);
      setPrompt('');
    },
  });

  useEffect(() => {
    if (!focusedTaskId && tasks.data?.length) onTaskFocus(tasks.data[0]!.id);
  }, [focusedTaskId, tasks.data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="shrink-0 mb-4 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-ui-lg font-medium tracking-tight text-ink-50">
            {session.data?.title ?? '…'}
          </h1>
          <div className="mt-1 flex items-center gap-2 font-mono text-ui-2xs text-ink-500">
            <span>{session.data?.id.slice(0, 8)}</span>
            <span className="text-ink-700">·</span>
            <span>{tasks.data?.length ?? 0} tasks</span>
          </div>
        </div>
        {worktree.data && (
          <div className="flex items-center gap-2 rounded-md border border-ink-800/50 bg-ink-900/30 px-3 py-1.5">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              className="h-3.5 w-3.5 text-ink-500"
            >
              <path d="M6 3v10M10 3v10M6 8h4" />
              <circle cx="6" cy="3" r="1.5" />
              <circle cx="10" cy="3" r="1.5" />
              <circle cx="6" cy="13" r="1.5" />
              <circle cx="10" cy="13" r="1.5" />
            </svg>
            <span className="font-mono text-ui-xs text-amber">{worktree.data.branch}</span>
            <span
              className={cn(
                'rounded-full px-1.5 py-px text-ui-2xs font-mono uppercase tracking-widest2',
                worktree.data.status === 'active'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-ink-800/50 text-ink-500',
              )}
            >
              {worktree.data.status}
            </span>
          </div>
        )}
      </header>

      {/* Divider */}
      <div className="divider-h mb-4 shrink-0" />

      {/* Task view */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {focusedTaskId ? (
          <TaskView taskId={focusedTaskId} key={focusedTaskId} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              className="h-8 w-8 text-ink-700"
            >
              <path d="M12 20V10M18 20V4M6 20v-4" />
            </svg>
            <div className="font-mono text-ui-xs text-ink-500">submit a prompt to begin</div>
          </div>
        )}
      </div>

      {/* Prompt form */}
      <form
        className="shrink-0 mt-4 border-t border-ink-800/40 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!prompt.trim()) return;
          create.mutate({
            sessionId,
            prompt: prompt.trim(),
            modelOverride: modelOverride || undefined,
            agentId: agentId || undefined,
            workflowId: workflowId || undefined,
          });
        }}
      >
        <div className="rounded-lg border border-ink-700/60 bg-ink-900/30 transition-all focus-within:border-amber/30 focus-within:bg-ink-900/50">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="describe the task… (⌘↩ to submit)"
            rows={3}
            className="w-full resize-none rounded-t-lg bg-transparent px-3 py-2.5 font-mono text-ui-sm text-ink-100 placeholder:text-ink-600 focus:outline-none"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (prompt.trim()) {
                  create.mutate({
                    sessionId,
                    prompt: prompt.trim(),
                    modelOverride: modelOverride || undefined,
                    agentId: agentId || undefined,
                    workflowId: workflowId || undefined,
                  });
                }
              }
            }}
          />
          <div className="flex items-center justify-between border-t border-ink-800/30 px-3 py-2">
            <div className="flex items-center gap-2">
              <AdvancedOptions
                modelOverride={modelOverride}
                agentId={agentId}
                workflowId={workflowId}
                onModelOverride={setModelOverride}
                onAgentId={setAgentId}
                onWorkflowId={setWorkflowId}
              />
            </div>
            <button
              type="submit"
              disabled={!prompt.trim() || create.isPending}
              className="rounded-md bg-amber/90 px-4 py-1.5 font-mono text-ui-xs font-medium uppercase tracking-widest2 text-ink-950 transition-all hover:bg-amber disabled:opacity-40"
            >
              {create.isPending ? 'submitting…' : 'submit'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
