import { useMemo } from 'react';
import type { ApprovalReq } from './types';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-[560px] max-w-[90vw] rounded-xl border border-amber/20 bg-ink-900 shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between border-b border-ink-800/60 px-5 py-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-amber/10 px-2 py-0.5 font-mono text-ui-2xs uppercase tracking-widest2 text-amber">
                approval required
              </span>
              {remaining > 0 && (
                <span className="font-mono text-ui-2xs text-ink-500">+{remaining} more</span>
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
                <pre className="max-h-[30vh] overflow-y-auto rounded-lg bg-ink-950 px-3 py-2 font-mono text-ui-xs leading-relaxed text-ink-100">
                  {shellArgs.command}
                </pre>
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
          <pre className="max-h-[40vh] overflow-y-auto px-5 py-3 font-mono text-ui-xs leading-relaxed text-ink-200">
            {argsPretty}
          </pre>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-ink-800/60 px-5 py-3">
          <button
            onClick={() => onDecide('deny')}
            className="btn-danger"
          >
            deny
          </button>
          <button
            onClick={() => onDecide('approve_session')}
            className="btn-secondary"
          >
            allow this task
          </button>
          <button
            onClick={() => onDecide('approve')}
            className="btn-primary"
          >
            approve once
          </button>
        </div>
      </div>
    </div>
  );
}
