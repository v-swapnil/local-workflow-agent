import { useState } from 'react';
import { trpc } from '../../trpc';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { cn } from '../../lib/utils';

interface UserInputModalProps {
  id: number;
  onSubmit: (answer: string) => void;
  onDismiss: () => void;
}

export function UserInputModal({ id, onSubmit, onDismiss }: UserInputModalProps) {
  const userInput = trpc.approval.getUserInput.useQuery({ id });
  const choices = userInput.data?.choices ?? [];
  const hasChoices = choices.length > 0;

  const [answer, setAnswer] = useState('');
  const [mode, setMode] = useState<'choices' | 'freeform'>(hasChoices ? 'choices' : 'freeform');

  const canSubmit = answer.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(answer);
  };

  if (!userInput.data) return null;

  return (
    <Dialog open onOpenChange={() => onDismiss()}>
      <DialogContent className="w-[560px] max-w-[90vw] border-transparent bg-ink-900 p-0 text-ink-50">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-800/60 px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="border-sky-500/20 bg-sky-500/10 font-mono text-ui-2xs uppercase tracking-widest2 text-sky-400"
              >
                input requested
              </Badge>
            </div>
            <div className="mt-1 font-mono text-ui-base font-medium text-ink-50">
              {userInput.data.question}
            </div>
          </div>
          <div className="shrink-0 font-mono text-ui-2xs tabular-nums text-ink-600">
            {new Date(userInput.data.createdAt).toLocaleTimeString([], { hour12: false })}
          </div>
        </div>

        {/* Context */}
        {userInput.data.description && (
          <div className="border-b border-ink-800/60 px-5 py-2 font-mono text-ui-xs text-ink-400">
            {userInput.data.description}
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
              <RadioGroup value={answer} onValueChange={setAnswer} className="space-y-1.5">
                {choices.map((choice) => (
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

              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  setMode('freeform');
                  setAnswer('');
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
