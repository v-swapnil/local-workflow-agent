import { useEffect, useMemo, useRef, useState } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import { trpc } from '../trpc';
import { useUI, dirtyKey } from '../store/ui';

// Self-host Monaco from the bundled package (no CDN, satisfies CSP).
loader.config({
  paths: {
    vs: new URL('../../../../node_modules/monaco-editor/min/vs', import.meta.url).href,
  },
});

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown', mdx: 'markdown', css: 'css', html: 'html',
  py: 'python', rs: 'rust', go: 'go', java: 'java', sh: 'shell',
  yaml: 'yaml', yml: 'yaml', toml: 'ini', sql: 'sql',
};

export function langFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_LANG[ext] ?? 'plaintext';
}

interface Props {
  workspaceId: string;
  path: string;
}

export function MonacoPane({ workspaceId, path }: Props) {
  const utils = trpc.useUtils();
  const file = trpc.file.read.useQuery({ workspaceId, path });
  const write = trpc.file.write.useMutation();
  const dirty = useUI((s) => s.dirty);
  const theme = useUI((s) => s.theme);
  const setDirty = useUI((s) => s.setDirty);
  const clearDirty = useUI((s) => s.clearDirty);

  const key = dirtyKey(workspaceId, path);
  const baseValue = file.data?.content ?? '';
  const value = dirty[key] ?? baseValue;
  const isDirty = dirty[key] !== undefined && dirty[key] !== baseValue;
  const language = useMemo(() => langFor(path), [path]);

  const [savedAt, setSavedAt] = useState<number | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Cmd/Ctrl+S to save
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (!isDirty) return;
        const content = valueRef.current;
        await write.mutateAsync({ workspaceId, path, content });
        clearDirty(key);
        setSavedAt(Date.now());
        utils.file.read.invalidate({ workspaceId, path });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isDirty, workspaceId, path, key, write, clearDirty, utils]);

  if (file.isLoading) {
    return <div className="p-6 font-mono text-ui-base text-ink-400">loading…</div>;
  }
  if (file.error) {
    return <div className="p-6 font-mono text-ui-base text-signal-err">{file.error.message}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-ink-800 bg-ink-900/60 px-4 py-2">
        <div className="flex items-center gap-2 font-mono text-ui-sm">
          <span className="text-ink-500">~/</span>
          <span className="text-ink-100">{path}</span>
          {isDirty && <span className="ml-1 text-amber">●</span>}
        </div>
        <div className="flex items-center gap-3 font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
          <span>{language}</span>
          {file.data?.truncated && <span className="text-signal-warn">truncated</span>}
          {savedAt && !isDirty && <span className="text-signal-ok">saved</span>}
          <button
            onClick={async () => {
              const content = valueRef.current;
              await write.mutateAsync({ workspaceId, path, content });
              clearDirty(key);
              setSavedAt(Date.now());
              utils.file.read.invalidate({ workspaceId, path });
            }}
            disabled={!isDirty}
            className="rounded border border-ink-700 px-2 py-0.5 text-amber disabled:cursor-not-allowed disabled:text-ink-600"
          >
            save · ⌘S
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          theme={theme === 'dark' ? 'vs-dark' : 'vs'}
          language={language}
          value={value}
          onChange={(v) => setDirty(key, v ?? '')}
          options={{
            fontFamily: 'JetBrains Mono, ui-monospace, Menlo, monospace',
            fontSize: 13,
            fontLigatures: true,
            minimap: { enabled: false },
            smoothScrolling: true,
            renderWhitespace: 'selection',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 16, bottom: 16 },
          }}
        />
      </div>
    </div>
  );
}
