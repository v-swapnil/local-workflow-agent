import { useEffect, useState } from 'react';
import { trpc } from '../../trpc';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';

type SearchMode = 'files' | 'content';

export function UniversalSearch({ workspaceId }: { workspaceId: string }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [mode, setMode] = useState<SearchMode>('content');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const fileResults = trpc.workspace.searchFiles.useQuery(
    { workspaceId, query: debounced },
    { enabled: mode === 'files' && debounced.length > 0 },
  );
  const contentResults = trpc.workspace.searchContent.useQuery(
    { workspaceId, query: debounced },
    { enabled: mode === 'content' && debounced.length > 0 },
  );

  const isLoading = mode === 'files' ? fileResults.isFetching : contentResults.isFetching;

  return (
    <section className="rounded-lg border border-ink-800/60 bg-ink-900/20 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">search</h2>
        <div className="flex items-center gap-1 rounded-md border border-ink-800/60 p-0.5">
          {(['content', 'files'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'rounded px-2 py-0.5 font-mono text-ui-2xs uppercase tracking-widest2 transition-colors',
                mode === m ? 'bg-ink-800/60 text-amber' : 'text-ink-500 hover:text-ink-300',
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={mode === 'files' ? 'search file names...' : 'search file contents...'}
        className="font-mono text-ui-sm"
      />

      <div className="mt-3 max-h-96 overflow-y-auto">
        {!debounced && (
          <div className="py-4 font-mono text-ui-sm text-ink-600">
            start typing to search the workspace.
          </div>
        )}

        {debounced && isLoading && (
          <div className="py-4 font-mono text-ui-sm text-ink-500">searching...</div>
        )}

        {debounced && !isLoading && mode === 'files' && (
          <FileResults files={fileResults.data?.files ?? []} truncated={fileResults.data?.truncated} />
        )}

        {debounced && !isLoading && mode === 'content' && (
          <ContentResults
            hits={contentResults.data?.hits ?? []}
            truncated={contentResults.data?.truncated}
          />
        )}
      </div>
    </section>
  );
}

function FileResults({ files, truncated }: { files: string[]; truncated?: boolean }) {
  if (files.length === 0) {
    return <div className="py-4 font-mono text-ui-sm text-ink-600">no files found.</div>;
  }
  return (
    <div className="space-y-0.5">
      {files.map((path) => (
        <div
          key={path}
          className="truncate rounded px-2 py-1 font-mono text-ui-xs text-ink-300 hover:bg-ink-800/30"
          title={path}
        >
          {path}
        </div>
      ))}
      {truncated && (
        <div className="px-2 py-1 font-mono text-ui-2xs text-ink-600">
          results truncated — refine your query
        </div>
      )}
    </div>
  );
}

function ContentResults({
  hits,
  truncated,
}: {
  hits: { path: string; line: number; text: string }[];
  truncated?: boolean;
}) {
  if (hits.length === 0) {
    return <div className="py-4 font-mono text-ui-sm text-ink-600">no matches found.</div>;
  }
  return (
    <div className="space-y-0.5">
      {hits.map((hit, i) => (
        <div
          key={`${hit.path}:${hit.line}:${i}`}
          className="rounded px-2 py-1 hover:bg-ink-800/30"
        >
          <div className="truncate font-mono text-ui-xs text-amber" title={hit.path}>
            {hit.path}
            <span className="ml-2 text-ink-600">:{hit.line}</span>
          </div>
          <div className="truncate font-mono text-ui-xs text-ink-400">{hit.text.trim()}</div>
        </div>
      ))}
      {truncated && (
        <div className="px-2 py-1 font-mono text-ui-2xs text-ink-600">
          results truncated — refine your query
        </div>
      )}
    </div>
  );
}
