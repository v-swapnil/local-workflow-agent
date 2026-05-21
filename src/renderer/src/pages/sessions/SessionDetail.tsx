import { useEffect, useState } from 'react';
import { trpc } from '../../trpc';
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
      <header className="mb-3 border-b border-ink-800 pb-3">
        <div className="font-serif text-2xl text-ink-50">{session.data?.title ?? '…'}</div>
        <div className="mt-1 font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
          {session.data?.id} · {tasks.data?.length ?? 0} tasks
        </div>
        {worktree.data && (
          <div className="mt-2 flex items-center gap-3 font-mono text-ui-xs">
            <span className="text-ink-500">⎇</span>
            <span className="text-amber-400">{worktree.data.branch}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-ui-xs uppercase tracking-widest2 ${
                worktree.data.status === 'active'
                  ? 'bg-emerald-950/50 text-emerald-400'
                  : 'bg-ink-800 text-ink-500'
              }`}
            >
              {worktree.data.status}
            </span>
            <button
              className="max-w-xs truncate text-ink-500 hover:text-ink-300 hover:underline"
              title={`${worktree.data.path} (click to open)`}
              onClick={() => openPath.mutate({ path: worktree.data!.path })}
            >
              {worktree.data.path}
            </button>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {focusedTaskId ? (
          <TaskView taskId={focusedTaskId} key={focusedTaskId} />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-ui-sm text-ink-500">
            submit a prompt to begin
          </div>
        )}
      </div>

      <form
        className="mt-3 border-t border-ink-800 pt-3"
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
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="describe the task… (⌘↩ to submit)"
          rows={3}
          className="w-full resize-none rounded border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-ui-base text-ink-100 placeholder:text-ink-600 focus:border-amber-700/60 focus:outline-none"
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
        <AdvancedOptions
          modelOverride={modelOverride}
          agentId={agentId}
          workflowId={workflowId}
          onModelOverride={setModelOverride}
          onAgentId={setAgentId}
          onWorkflowId={setWorkflowId}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
            planner → executor → tester → critic
          </span>
          <button
            type="submit"
            disabled={!prompt.trim() || create.isPending}
            className="rounded border border-amber-700/60 bg-amber-950/30 px-4 py-1.5 font-mono text-ui-sm uppercase tracking-widest2 text-amber-300 hover:bg-amber-950/60 disabled:opacity-40"
          >
            {create.isPending ? 'submitting…' : 'submit task'}
          </button>
        </div>
      </form>
    </div>
  );
}
