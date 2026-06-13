import { useState } from 'react';
import { trpc } from '../../trpc';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';

interface PrSectionProps {
  workspaceId: string;
  worktreeId?: string;
  currentBranch: string | null;
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-signal-warn/20 bg-signal-warn/5 px-3 py-2 font-mono text-ui-2xs text-signal-warn">
      {children}
    </div>
  );
}

function PrBadge({ url, state, title }: { url?: string; state?: string; title?: string }) {
  const color =
    state === 'OPEN'
      ? 'text-signal-ok border-signal-ok/20 bg-signal-ok/5'
      : state === 'MERGED'
        ? 'text-purple-400 border-purple-400/20 bg-purple-400/5'
        : 'text-signal-err border-signal-err/20 bg-signal-err/5';
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-ui-2xs ${color}`}
    >
      <span className="uppercase tracking-widest2 font-medium">{state ?? 'PR'}</span>
      {title && <span className="max-w-xs truncate text-ink-200">{title}</span>}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-ink-400 underline hover:text-ink-100"
          onClick={(e) => e.stopPropagation()}
        >
          open ↗
        </a>
      )}
    </div>
  );
}

export function PrSection({ workspaceId, worktreeId, currentBranch }: PrSectionProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const [draft, setDraft] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [prError, setPrError] = useState<string | null>(null);

  const ghAuth = trpc.git.ghAuthStatus.useQuery({ workspaceId, worktreeId });
  const prStatus = trpc.git.prStatus.useQuery({ workspaceId, worktreeId });
  const createPr = trpc.git.createPr.useMutation({
    onSuccess: (data) => {
      if (data.ok) {
        setPrUrl(data.url ?? null);
        setPrError(null);
        setShowForm(false);
        prStatus.refetch();
      } else {
        setPrError(data.error ?? 'unknown error');
      }
    },
    onError: (err) => setPrError(err.message),
  });

  if (!currentBranch || currentBranch === 'main' || currentBranch === 'master') return null;

  return (
    <div className="border-t border-ink-800/40 p-3">
      <div className="mb-2 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
        pull request
      </div>

      {!ghAuth.data?.installed && <Banner>gh CLI not installed — brew install gh</Banner>}
      {ghAuth.data?.installed && !ghAuth.data?.authenticated && (
        <Banner>not authenticated — run: gh auth login</Banner>
      )}

      {ghAuth.data?.authenticated && (
        <>
          {prStatus.data?.hasPr ? (
            <PrBadge
              url={prStatus.data.url}
              state={prStatus.data.state}
              title={prStatus.data.title}
            />
          ) : (
            <>
              {prUrl && !prStatus.data?.hasPr && (
                <div className="mb-2 font-mono text-ui-2xs text-signal-ok">
                  PR created:{' '}
                  <a href={prUrl} target="_blank" rel="noreferrer" className="underline">
                    {prUrl}
                  </a>
                </div>
              )}
              {!showForm ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowForm(true);
                    setTitle(currentBranch.replace(/[/-]/g, ' ').replace(/^ase /, ''));
                  }}
                >
                  create pull request
                </Button>
              ) : (
                <div className="space-y-2">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="PR title"
                  />
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Description (optional)"
                    rows={3}
                    className="resize-none font-mono text-ui-xs"
                  />
                  <div className="flex gap-2">
                    <Input
                      value={baseBranch}
                      onChange={(e) => setBaseBranch(e.target.value)}
                      placeholder="base branch (default: main)"
                      className="flex-1"
                    />
                    <Label className="flex items-center gap-1.5 font-mono text-ui-2xs text-ink-400">
                      <Checkbox checked={draft} onCheckedChange={(v) => setDraft(v === true)} />
                      draft
                    </Label>
                  </div>
                  {prError && (
                    <div className="font-mono text-ui-2xs text-signal-err">{prError}</div>
                  )}
                  <div className="flex gap-1.5">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() =>
                        createPr.mutate({
                          workspaceId,
                          worktreeId,
                          title,
                          body: body || undefined,
                          baseBranch: baseBranch || undefined,
                          draft,
                        })
                      }
                      disabled={createPr.isPending || !title.trim()}
                    >
                      {createPr.isPending ? '...' : 'create PR'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
                      cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
