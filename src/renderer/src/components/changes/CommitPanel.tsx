import { useState } from 'react';
import { trpc } from '../../trpc';

interface Props {
  workspaceId: string;
  worktreeId?: string;
  onDone?: () => void;
}

export function CommitPanel({ workspaceId, worktreeId, onDone }: Props) {
  const [msg, setMsg] = useState('');
  const utils = trpc.useUtils();

  const invalidate = () => {
    utils.git.status.invalidate({ workspaceId, worktreeId });
    onDone?.();
  };

  const stageAll = trpc.git.stageAll.useMutation({ onSuccess: invalidate });
  const unstageAll = trpc.git.unstageAll.useMutation({ onSuccess: invalidate });
  const commit = trpc.git.commit.useMutation({
    onSuccess: () => {
      setMsg('');
      invalidate();
    },
  });
  const push = trpc.git.push.useMutation({ onSuccess: invalidate });

  return (
    <div className="border-t border-ink-800/40 p-3">
      <div className="mb-2 flex gap-1.5">
        <button
          onClick={() => stageAll.mutate({ workspaceId, worktreeId })}
          disabled={stageAll.isPending}
          className="flex items-center gap-1 rounded-md border border-ink-700/50 px-2 py-1 font-mono text-ui-2xs text-ink-400 transition-colors hover:border-emerald-500/30 hover:text-signal-ok disabled:opacity-40"
        >
          <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-2.5 w-2.5"><path d="M5 1v8M1 5h8" /></svg>
          stage all
        </button>
        <button
          onClick={() => unstageAll.mutate({ workspaceId, worktreeId })}
          disabled={unstageAll.isPending}
          className="flex items-center gap-1 rounded-md border border-ink-700/50 px-2 py-1 font-mono text-ui-2xs text-ink-400 transition-colors hover:border-rose-500/30 hover:text-signal-err disabled:opacity-40"
        >
          <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-2.5 w-2.5"><path d="M1 5h8" /></svg>
          unstage all
        </button>
      </div>
      <input
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        placeholder="commit message…"
        className="w-full rounded-md border border-ink-700/50 bg-ink-950/80 px-3 py-1.5 font-mono text-ui-xs text-ink-100 placeholder:text-ink-600 transition-colors focus:border-amber/30 focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && msg.trim()) {
            commit.mutate({ workspaceId, worktreeId, message: msg.trim() });
          }
        }}
      />
      {commit.error && (
        <div className="mt-1 font-mono text-ui-2xs text-signal-err">{commit.error.message}</div>
      )}
      {commit.data && !commit.data.ok && (
        <div className="mt-1 font-mono text-ui-2xs text-signal-err">{commit.data.error}</div>
      )}
      <div className="mt-2 flex gap-1.5">
        <button
          onClick={() => commit.mutate({ workspaceId, worktreeId, message: msg.trim() })}
          disabled={commit.isPending || !msg.trim()}
          className="btn-primary !py-1 !px-3"
        >
          {commit.isPending ? '…' : 'commit'}
        </button>
        <button
          onClick={() => push.mutate({ workspaceId, worktreeId })}
          disabled={push.isPending}
          className="btn-secondary !py-1 !px-3"
        >
          {push.isPending ? '…' : 'push'}
        </button>
        {push.error && (
          <span className="font-mono text-ui-2xs text-signal-err self-center">{push.error.message}</span>
        )}
        {push.data && !push.data.ok && (
          <span className="font-mono text-ui-2xs text-signal-err self-center">{push.data.error}</span>
        )}
      </div>
    </div>
  );
}
