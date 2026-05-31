import { useState } from 'react';
import { trpc } from '../../trpc';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Plus, Minus } from 'lucide-react';

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
        <Button
          variant="outline"
          size="xs"
          onClick={() => stageAll.mutate({ workspaceId, worktreeId })}
          disabled={stageAll.isPending}
          className="flex items-center gap-1 font-mono hover:border-emerald-500/30 hover:text-signal-ok"
        >
          <Plus className="h-2.5 w-2.5" strokeWidth={1.5} />
          stage all
        </Button>
        <Button
          variant="outline"
          size="xs"
          onClick={() => unstageAll.mutate({ workspaceId, worktreeId })}
          disabled={unstageAll.isPending}
          className="flex items-center gap-1 font-mono hover:border-rose-500/30 hover:text-signal-err"
        >
          <Minus className="h-2.5 w-2.5" strokeWidth={1.5} />
          unstage all
        </Button>
      </div>
      <Input
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        placeholder="commit message…"
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
        <Button
          variant="default"
          size="sm"
          onClick={() => commit.mutate({ workspaceId, worktreeId, message: msg.trim() })}
          disabled={commit.isPending || !msg.trim()}
        >
          {commit.isPending ? '…' : 'commit'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => push.mutate({ workspaceId, worktreeId })}
          disabled={push.isPending}
        >
          {push.isPending ? '…' : 'push'}
        </Button>
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
