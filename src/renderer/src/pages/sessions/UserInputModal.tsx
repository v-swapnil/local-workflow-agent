import { useState } from 'react';
import type { UserInputReq } from './types';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { cn } from '../../lib/utils';

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
    <Dialog open onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <DialogContent className="w-[560px] max-w-[90vw] border-sky-500/20 bg-ink-900 p-0 text-ink-50">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-800/60 px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-sky-500/20 bg-sky-500/10 font-mono text-ui-2xs uppercase tracking-widest2 text-sky-400">
                input requested
              </Badge>
              {isAllowMultiple && (
                <Badge variant="outline" className="border-violet-500/20 bg-violet-500/10 font-mono text-ui-2xs uppercase tracking-widest2 text-violet-400">
                  multi-select
                </Badge>
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
              {isAllowMultiple ? (
                /* Multi-select with Checkbox */
                req.choices!.map((choice) => {
                  const isChecked = selected.has(choice);
                  return (
                    <Label
                      key={choice}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 font-mono text-ui-xs font-normal transition-colors',
                        isChecked
                          ? 'border-sky-500/30 bg-sky-500/8 text-sky-200'
                          : 'border-ink-700/50 bg-ink-900/30 text-ink-200 hover:border-ink-600 hover:bg-ink-800/30',
                      )}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleChoice(choice)}
                        className="border-ink-600 data-[state=checked]:border-sky-500 data-[state=checked]:bg-sky-500"
                      />
                      <span>{choice}</span>
                    </Label>
                  );
                })
              ) : (
                /* Single-select with RadioGroup */
                <RadioGroup value={answer} onValueChange={setAnswer} className="space-y-1.5">
                  {req.choices!.map((choice) => (
                    <Label
                      key={choice}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 font-mono text-ui-xs font-normal transition-colors',
                        answer === choice
                          ? 'border-sky-500/30 bg-sky-500/8 text-sky-200'
                          : 'border-ink-700/50 bg-ink-900/30 text-ink-200 hover:border-ink-600 hover:bg-ink-800/30',
                      )}
                    >
                      <RadioGroupItem
                        value={choice}
                        className="border-ink-600 text-sky-500 data-[state=checked]:border-sky-500"
                      />
                      <span>{choice}</span>
                    </Label>
                  ))}
                </RadioGroup>
              )}

              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  setMode('freeform');
                  setAnswer('');
                  setSelected(new Set());
                }}
                className="mt-1 font-mono text-ink-500 hover:text-ink-300 hover:bg-transparent"
              >
                or type a custom response…
              </Button>
            </div>
          ) : (
            <div>
              <Textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="type your response…"
                rows={3}
                autoFocus
                className="resize-none font-mono text-ui-xs placeholder:text-ink-600"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              {hasChoices && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setMode('choices');
                    setAnswer('');
                    setSelected(new Set());
                  }}
                  className="mt-1 font-mono text-ink-500 hover:text-ink-300 hover:bg-transparent"
                >
                  ← back to choices
                </Button>
              )}
            </div>
          )}
        </form>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-ink-800/60 px-5 py-3">
          <Button variant="outline" size="sm" onClick={onDismiss}>
            skip
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="border-sky-500/40 bg-sky-500/10 font-mono uppercase tracking-widest2 text-sky-300 hover:bg-sky-500/20"
          >
            send
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
