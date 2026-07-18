import { cn } from '@renderer/lib/utils';
import { ChevronRight } from 'lucide-react';
import { Button } from './button';
import { Collapsible, CollapsibleContent } from './collapsible';

export type TreeDotTone = 'active' | 'ok' | 'err' | 'muted' | 'idle';

const DOT_TONE: Record<TreeDotTone, string> = {
  active: 'bg-amber',
  ok: 'bg-emerald-400',
  err: 'bg-rose-400',
  muted: 'bg-ink-600',
  idle: 'bg-ink-500',
};

export function TreeStatusDot({
  tone,
  pulse = false,
  className,
}: {
  tone: TreeDotTone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('relative flex h-2 w-2 shrink-0', className)}>
      {pulse && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-40',
            DOT_TONE[tone],
          )}
        />
      )}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', DOT_TONE[tone])} />
    </span>
  );
}

export function TreeItem({
  isActive = false,
  isExpanded,
  onToggle,
  onSelect,
  content,
  actions,
}: {
  isActive?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
  content: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'group flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-all',
        isActive
          ? 'border-amber/20 bg-amber/6 shadow-sm'
          : 'border-transparent hover:border-ink-800/60 hover:bg-ink-800/20',
      )}
    >
      <Button
        variant="ghost"
        size="xs"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-500 hover:bg-ink-800 hover:text-ink-300"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <ChevronRight
          className={cn('h-3 w-3 transition-transform duration-150', isExpanded && 'rotate-90')}
          strokeWidth={1.5}
        />
      </Button>

      <Button
        variant="ghost"
        className="min-w-0 h-auto flex-1 justify-start p-0 text-left font-normal hover:bg-transparent"
        onClick={onSelect}
      >
        {content}
      </Button>

      {actions}
    </div>
  );
}

export function TreeNode({
  isActive,
  isExpanded,
  onExpandedChange,
  onSelect,
  content,
  actions,
  branchClassName,
  children,
}: {
  isActive?: boolean;
  isExpanded: boolean;
  onExpandedChange: (open: boolean) => void;
  onSelect: () => void;
  content: React.ReactNode;
  actions?: React.ReactNode;
  branchClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onExpandedChange}>
      <TreeItem
        isActive={isActive}
        isExpanded={isExpanded}
        onToggle={() => onExpandedChange(!isExpanded)}
        onSelect={onSelect}
        content={content}
        actions={actions}
      />
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <TreeBranch className={branchClassName}>{children}</TreeBranch>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function TreeBranch({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('relative ml-5 mt-0.5 pb-0.5', className)}>
      <div className="absolute left-0 top-0 bottom-0 w-px bg-ink-800/60" />
      {children}
    </div>
  );
}

export function TreeLeaf({
  isActive = false,
  isLast = false,
  onSelect,
  content,
  actions,
}: {
  isActive?: boolean;
  isLast?: boolean;
  onSelect: () => void;
  content: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="group/leaf relative">
      <div className="absolute left-0 top-[14px] h-px w-3 bg-ink-800/60" />
      {isLast && (
        <div
          className="absolute left-0 top-[14px] bottom-0 w-px bg-ink-900/20"
          style={{ backgroundColor: 'inherit' }}
        />
      )}

      <Button
        variant="ghost"
        onClick={onSelect}
        className={cn(
          'ml-4 mt-0.5 h-auto w-[calc(100%-16px)] justify-start gap-2 rounded-md border px-2.5 py-1.5 text-left font-normal',
          isActive
            ? 'border-amber/15 bg-amber/5 hover:bg-amber/8'
            : 'border-transparent hover:border-ink-800/40 hover:bg-ink-800/15',
        )}
      >
        {content}
      </Button>

      {actions && (
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/leaf:opacity-100">
          {actions}
        </div>
      )}
    </div>
  );
}
