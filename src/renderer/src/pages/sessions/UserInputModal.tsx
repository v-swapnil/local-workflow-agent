import { useState } from 'react';
import type { UserInputReq } from './types';

export function UserInputModal({
  req,
  onSubmit,
  onDismiss,
}: {
  req: UserInputReq;
  onSubmit: (answer: string) => void;
  onDismiss: () => void;
}) {
  const hasChoices = req.choices && req.choices.length > 0;
  const isAllowMultiple = hasChoices && req.allowMultiple === true;
  const [answer, setAnswer] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'choices' | 'freeform'>(hasChoices ? 'choices' : 'freeform');

  const toggleChoice = (choice: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(choice)) next.delete(choice);
      else next.add(choice);
      return next;
    });
  };

  const canSubmit = mode === 'choices'
    ? isAllowMultiple ? selected.size > 0 : answer.trim().length > 0
    : answer.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (mode === 'choices' && isAllowMultiple) {
      onSubmit(Array.from(selected).join(', '));
    } else {
      onSubmit(answer);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-[560px] max-w-[90vw] rounded-xl border border-sky-500/20 bg-ink-900 shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-800/60 px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 font-mono text-ui-2xs uppercase tracking-widest2 text-sky-400">
                input requested
              </span>
              {isAllowMultiple && (
                <span className="rounded-full bg-violet-500/10 px-2 py-0.5 font-mono text-ui-2xs uppercase tracking-widest2 text-violet-400">
                  multi-select
                </span>
              )}
            </div>
            <div className="mt-1 font-mono text-ui-base font-medium text-ink-50">{req.question}</div>
          </div>
          <div className="shrink-0 font-mono text-ui-2xs tabular-nums text-ink-600">
            {new Date(req.ts).toLocaleTimeString([], { hour12: false })}
          </div>
        </div>

        {/* Context */}
        {req.description && (
          <div className="border-b border-ink-800/60 px-5 py-2 font-mono text-ui-xs text-ink-400">
            {req.description}
          </div>
        )}

        {/* Input area */}
        <form
          className="px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          {hasChoices && mode === 'choices' ? (
            <div className="space-y-1.5">
              {req.choices!.map((choice) => {
                const isChecked = isAllowMultiple ? selected.has(choice) : answer === choice;
                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => {
                      if (isAllowMultiple) toggleChoice(choice);
                      else setAnswer(choice);
                    }}
                    className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left font-mono text-ui-xs transition-colors ${
                      isChecked
                        ? 'border-sky-500/30 bg-sky-500/8 text-sky-200'
                        : 'border-ink-700/50 bg-ink-900/30 text-ink-200 hover:border-ink-600 hover:bg-ink-800/30'
                    }`}
                  >
                    {isAllowMultiple ? (
                      /* Checkbox indicator */
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          isChecked ? 'border-sky-500 bg-sky-500' : 'border-ink-600'
                        }`}
                      >
                        {isChecked && (
                          <svg className="h-2.5 w-2.5 text-ink-950" viewBox="0 0 10 10" fill="none">
                            <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                    ) : (
                      /* Radio indicator */
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                          isChecked ? 'border-sky-500 bg-sky-500' : 'border-ink-600'
                        }`}
                      >
                        {isChecked && (
                          <span className="h-1.5 w-1.5 rounded-full bg-ink-950" />
                        )}
                      </span>
                    )}
                    <span>{choice}</span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  setMode('freeform');
                  setAnswer('');
                  setSelected(new Set());
                }}
                className="mt-1 font-mono text-ui-xs text-ink-500 hover:text-ink-300 transition-colors"
              >
                or type a custom response…
              </button>
            </div>
          ) : (
            <div>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="type your response…"
                rows={3}
                autoFocus
                className="w-full resize-none rounded-md border border-ink-700/50 bg-ink-950/80 px-3 py-2 font-mono text-ui-xs text-ink-100 placeholder:text-ink-600 focus:border-sky-500/30 focus:outline-none"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              {hasChoices && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('choices');
                    setAnswer('');
                    setSelected(new Set());
                  }}
                  className="mt-1 font-mono text-ui-xs text-ink-500 hover:text-ink-300 transition-colors"
                >
                  ← back to choices
                </button>
              )}
            </div>
          )}
        </form>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-ink-800/60 px-5 py-3">
          <button
            onClick={onDismiss}
            className="btn-secondary"
          >
            skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1 font-mono text-ui-xs uppercase tracking-widest2 text-sky-300 transition-colors hover:bg-sky-500/20 disabled:opacity-40"
          >
            send
          </button>
        </div>
      </div>
    </div>
  );
}
