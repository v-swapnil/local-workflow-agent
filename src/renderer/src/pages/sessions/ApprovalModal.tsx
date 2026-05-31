import { useMemo } from 'react';
import type { ApprovalReq } from './types';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import { ScrollArea } from '../../components/ui/scroll-area';

export function ApprovalModal({
  req,
  remaining,
  onDecide,
}: {
  req: ApprovalReq;
  remaining: number;
  onDecide: (d: 'approve' | 'approve_session' | 'deny') => void;
}) {
  const argsPretty = useMemo(() => {
    try {
      return JSON.stringify(req.args, null, 2);
    } catch {
      return String(req.args);
    }
  }, [req.args]);

  const isShell = req.tool === 'run_shell';
  const shellArgs = isShell
    ? (req.args as { command?: string; description?: string; workdir?: string } | null)
    : null;

  return (
    <Dialog open>
      <DialogContent className="w-[560px] max-w-[90vw] border-amber/20 bg-ink-900 p-0 text-ink-50">
        <div className="flex items-center justify-between border-b border-ink-800/60 px-5 py-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-amber/20 bg-amber/10 font-mono text-ui-2xs uppercase tracking-widest2 text-amber">
                approval required
              </Badge>
              {remaining > 0 && (
                <Badge variant="outline" className="border-ink-700/40 font-mono text-ui-2xs text-ink-500">+{remaining} more</Badge>
              )}
            </div>
            <div className="mt-1 font-mono text-ui-sm font-medium text-ink-50">{req.tool}</div>
          </div>
          <div className="font-mono text-ui-2xs tabular-nums text-ink-600">
            {new Date(req.ts).toLocaleTimeString([], { hour12: false })}
          </div>
        </div>

        {isShell && shellArgs ? (
          <div className="space-y-3 px-5 py-3">
            {shellArgs.description && (
              <div>
                <div className="mb-1 font-mono text-ui-2xs uppercase text-ink-500">intent</div>
                <div className="text-ui-sm text-ink-200">{shellArgs.description}</div>
              </div>
            )}
            {shellArgs.command && (
              <div>
                <div className="mb-1 font-mono text-ui-2xs uppercase text-ink-500">command</div>
                <ScrollArea className="max-h-[30vh] rounded-lg bg-ink-950">
                  <pre className="px-3 py-2 font-mono text-ui-xs leading-relaxed text-ink-100">
                    {shellArgs.command}
                  </pre>
                </ScrollArea>
              </div>
            )}
            {shellArgs.workdir && shellArgs.workdir !== '.' && (
              <div>
                <div className="mb-1 font-mono text-ui-2xs uppercase text-ink-500">directory</div>
                <code className="text-ui-xs text-ink-300">{shellArgs.workdir}</code>
              </div>
            )}
          </div>
        ) : (
          <ScrollArea className="max-h-[40vh]">
            <pre className="px-5 py-3 font-mono text-ui-xs leading-relaxed text-ink-200">
              {argsPretty}
            </pre>
          </ScrollArea>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-ink-800/60 px-5 py-3">
          <Button variant="danger" size="sm" onClick={() => onDecide('deny')}>
            deny
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDecide('approve_session')}>
            allow this task
          </Button>
          <Button variant="default" size="sm" onClick={() => onDecide('approve')}>
            approve once
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
