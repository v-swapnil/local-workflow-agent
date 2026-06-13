import { useEffect, useState } from 'react';
import { trpc } from '../../trpc';
import { cn } from '../../lib/utils';
import { TaskView } from './TaskView';
import { AdvancedOptions } from '../../components/sessions/AdvancedOptions';
import { Button } from '../../components/ui/button';
import { Separator } from '../../components/ui/separator';
import { GitBranch, BarChart3 } from 'lucide-react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@renderer/components/ui/input-group';

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

  const handleCreateTask = () => {
    if (!prompt.trim()) return;
    create.mutate({
      sessionId,
      prompt: prompt.trim(),
      model: modelOverride || undefined,
      agentId: agentId || undefined,
      workflowId: workflowId || undefined,
    });
  };

  useEffect(() => {
    if (!focusedTaskId && tasks.data?.length) onTaskFocus(tasks.data[0]!.id);
  }, [focusedTaskId, tasks.data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="shrink-0 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-medium leading-tight tracking-tight text-ink-50">
            {session.data?.title ?? '...'}
          </h1>
          <div className="mt-1 flex items-center gap-2 font-mono text-ui-2xs text-ink-500">
            <span>{session.data?.id.slice(0, 8)}</span>
            <span className="text-ink-400">·</span>
            <span>{tasks.data?.length ?? 0} tasks</span>
          </div>
        </div>
        {worktree.data && (
          <div className="flex items-center gap-2 rounded-md border border-ink-800/50 bg-ink-900/30 px-3 py-1.5">
            <GitBranch className="h-3.5 w-3.5 text-ink-500" strokeWidth={1.2} />
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
      <Separator className="mb-4 shrink-0 bg-ink-800/60" />

      {/* Task view */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {focusedTaskId ? (
          <TaskView taskId={focusedTaskId} key={focusedTaskId} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <BarChart3 className="h-8 w-8 text-ink-700" strokeWidth={1} />
            <div className="font-mono text-ui-xs text-ink-500">submit a prompt to begin</div>
          </div>
        )}
      </div>

      {/* Prompt form */}
      <form
        className="shrink-0 mt-4 border-t border-ink-800/40 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleCreateTask();
        }}
      >
        <InputGroup className="rounded-lg border-ink-700/60 bg-ink-900/30 transition-all hover:border-ink-600">
          <InputGroupTextarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="describe the task… (⌘↩ to submit)"
            rows={3}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleCreateTask();
              }
            }}
          />
          <InputGroupAddon align="block-end" className="border-t border-ink-800/30">
            <AdvancedOptions
              modelOverride={modelOverride}
              agentId={agentId}
              workflowId={workflowId}
              onModelOverride={setModelOverride}
              onAgentId={setAgentId}
              onWorkflowId={setWorkflowId}
            />
            <InputGroupButton
              type="submit"
              size="sm"
              variant="default"
              className="ml-auto"
              disabled={!prompt.trim() || create.isPending}
            >
              {create.isPending ? 'submitting…' : 'submit'}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}
