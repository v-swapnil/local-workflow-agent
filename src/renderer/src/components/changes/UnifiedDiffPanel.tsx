import { CodeViewItem, CodeViewOptions, parsePatchFiles } from '@pierre/diffs';
import { CodeView, CodeViewHandle } from '@pierre/diffs/react';
import { trpc } from '@renderer/trpc';
import { ChevronDown, Square, SquareCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

interface UnifiedDiffPanelProps {
  workspaceId: string;
  worktreeId?: string;
  staged?: boolean;
  activePath: string;
}

function HeaderPrefix({
  collapsed,
  toggleCollapsed,
}: {
  collapsed: boolean;
  toggleCollapsed(): unknown;
}) {
  return (
    <button
      type="button"
      onClick={toggleCollapsed}
      aria-label={collapsed ? 'Expand file' : 'Collapse file'}
      aria-pressed={collapsed}
      style={{ marginLeft: -5 }}
      className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-white/65 transition hover:bg-white/10 hover:text-white"
    >
      <ChevronDown size={16} className={`transition-transform ${collapsed ? '-rotate-90' : ''}`} />
    </button>
  );
}

function ViewedButton({
  isViewed,
  onClick,
  className,
}: {
  isViewed: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isViewed}
      className={`flex cursor-pointer items-center gap-1.5 rounded-md border py-1 pr-2 pl-1 text-xs transition ${
        isViewed
          ? 'border-blue-400/50 bg-blue-500/25 text-blue-200'
          : 'border-white/20 bg-transparent text-white/70 hover:border-white/35 hover:bg-white/5 hover:text-white/85'
      } ${className ?? ''}`}
    >
      {isViewed ? (
        <SquareCheck size={16} className="text-blue-400" />
      ) : (
        <Square size={16} className="text-white/50" />
      )}
      Viewed
    </button>
  );
}

export function UnifiedDiffPanel({
  workspaceId,
  worktreeId,
  staged,
  activePath,
}: UnifiedDiffPanelProps) {
  const diff = trpc.git.diff.useQuery({ workspaceId, worktreeId, staged });

  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());
  const [viewedItems, setViewedItems] = useState<Set<string>>(new Set());

  const codeViewRef = useRef<CodeViewHandle<unknown> | null>(null);
  const currentVersionRef = useRef(0);

  const markCollapsed = (itemId: string) => {
    setCollapsedItems((current) => {
      const next = new Set(current);
      next.add(itemId);
      return next;
    });
  };

  const toggleCollapsed = (itemId: string) => {
    setCollapsedItems((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const toggleViewed = (itemId: string) => {
    setViewedItems((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
        markCollapsed(itemId);
      }
      return next;
    });
  };

  const items = useMemo<CodeViewItem[]>(() => {
    const parsed = diff.data ? parsePatchFiles(diff.data.unifiedDiff) : null;
    const parsedItems = parsed?.flatMap((patch) => patch.files) ?? [];
    const nextVersion = currentVersionRef.current++;
    return parsedItems.map((item) => ({
      id: item.name,
      type: 'diff',
      fileDiff: item,
      version: nextVersion,
      collapsed: collapsedItems.has(item.name),
    }));
  }, [diff.data, collapsedItems]);

  const options = useMemo<CodeViewOptions<unknown>>(
    () => ({
      theme: { dark: 'pierre-dark', light: 'pierre-light' },
      stickyHeaders: true,
      diffStyle: 'split',
      overflow: 'wrap',
    }),
    [],
  );

  useEffect(() => {
    codeViewRef.current?.scrollTo({ type: 'item', id: activePath });
  }, [activePath]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {diff.data ? (
        <CodeView
          ref={codeViewRef}
          items={items}
          style={{ height: '100%', overflow: 'auto' }}
          options={options}
          renderHeaderPrefix={(item) => (
            <HeaderPrefix
              toggleCollapsed={() => toggleCollapsed(item.id)}
              collapsed={collapsedItems.has(item.id)}
            />
          )}
          renderHeaderMetadata={(item) => (
            <ViewedButton
              isViewed={viewedItems.has(item.id)}
              onClick={() => toggleViewed(item.id)}
              className="mr-[-8px]"
            />
          )}
        />
      ) : (
        <div className="p-6 font-mono text-ui-sm text-ink-500">
          {diff.isLoading ? '...' : 'no diff available'}
        </div>
      )}
    </div>
  );
}
