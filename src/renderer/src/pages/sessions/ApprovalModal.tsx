import { useMemo } from 'react';
import type { ApprovalReq } from './types';
import { Badge } from '../../components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { buttonVariants } from '../../components/ui/button';
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
    <AlertDialog open>
      <AlertDialogContent className="w-[560px] max-w-[90vw] border-amber/20 bg-ink-900 p-0 text-ink-50">
        <AlertDialogHeader className="flex-row items-center justify-between border-b border-ink-800/60 px-5 py-3 space-y-0">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-amber/20 bg-amber/10 font-mono text-ui-2xs uppercase tracking-widest2 text-amber">
                approval required
              </Badge>
              {remaining > 0 && (
                <Badge variant="outline" className="border-ink-700/40 font-mono text-ui-2xs text-ink-500">+{remaining} more</Badge>
              )}
            </div>
            <AlertDialogTitle className="mt-1 font-mono text-ui-sm font-medium text-ink-50">{req.tool}</AlertDialogTitle>
          </div>
          <div className="font-mono text-ui-2xs tabular-nums text-ink-600">
            {new Date(req.ts).toLocaleTimeString([], { hour12: false })}
          </div>
        </AlertDialogHeader>

        <AlertDialogDescription className="sr-only">
          Approval required for tool: {req.tool}
        </AlertDialogDescription>

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

        <AlertDialogFooter className="border-t border-ink-800/60 px-5 py-3">
          <AlertDialogCancel
            className={buttonVariants({ variant: 'danger', size: 'sm' })}
            onClick={() => onDecide('deny')}
          >
            deny
          </AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
            onClick={() => onDecide('approve_session')}
          >
            allow this task
          </AlertDialogAction>
          <AlertDialogAction
            className={buttonVariants({ size: 'sm' })}
            onClick={() => onDecide('approve')}
          >
            approve once
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
