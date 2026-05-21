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
    <div className="border-t border-ink-800 p-3">
      <div className="mb-2 flex gap-2">
        <button
          onClick={() => stageAll.mutate({ workspaceId, worktreeId })}
          disabled={stageAll.isPending}
          className="rounded border border-ink-700 px-2 py-1 font-mono text-ui-xs text-ink-400 hover:border-signal-ok/40 hover:text-signal-ok disabled:opacity-40"
        >
          + stage all
        </button>
        <button
          onClick={() => unstageAll.mutate({ workspaceId, worktreeId })}
          disabled={unstageAll.isPending}
          className="rounded border border-ink-700 px-2 py-1 font-mono text-ui-xs text-ink-400 hover:border-signal-err/40 hover:text-signal-err disabled:opacity-40"
        >
          − unstage all
        </button>
      </div>
      <input
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        placeholder="commit message…"
        className="w-full rounded border border-ink-700 bg-ink-950 px-3 py-1.5 font-mono text-ui-sm text-ink-100 placeholder:text-ink-600 focus:border-amber-700/60 focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && msg.trim()) {
            commit.mutate({ workspaceId, worktreeId, message: msg.trim() });
          }
        }}
      />
      {commit.error && (
        <div className="mt-1 font-mono text-ui-xs text-signal-err">{commit.error.message}</div>
      )}
      {commit.data && !commit.data.ok && (
        <div className="mt-1 font-mono text-ui-xs text-signal-err">{commit.data.error}</div>
      )}
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => commit.mutate({ workspaceId, worktreeId, message: msg.trim() })}
          disabled={commit.isPending || !msg.trim()}
          className="rounded border border-amber-700/60 bg-amber-950/30 px-3 py-1 font-mono text-ui-xs uppercase tracking-widest2 text-amber-300 hover:bg-amber-950/60 disabled:opacity-40"
        >
          {commit.isPending ? '…' : 'commit'}
        </button>
        <button
          onClick={() => push.mutate({ workspaceId, worktreeId })}
          disabled={push.isPending}
          className="rounded border border-ink-700 px-3 py-1 font-mono text-ui-xs uppercase tracking-widest2 text-ink-300 hover:border-amber-700/40 hover:text-amber-300 disabled:opacity-40"
        >
          {push.isPending ? '…' : 'push'}
        </button>
        {push.error && (
          <span className="font-mono text-ui-xs text-signal-err">{push.error.message}</span>
        )}
        {push.data && !push.data.ok && (
          <span className="font-mono text-ui-xs text-signal-err">{push.data.error}</span>
        )}
      </div>
    </div>
  );
}
