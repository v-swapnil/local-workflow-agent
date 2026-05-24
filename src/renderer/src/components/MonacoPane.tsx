import { useMemo } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import { trpc } from '../trpc';
import { useUI } from '../store/ui';

// Self-host Monaco from the bundled package (no CDN, satisfies CSP).
loader.config({
  paths: {
    vs: new URL('../../../../node_modules/monaco-editor/min/vs', import.meta.url).href,
  },
});

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  md: 'markdown',
  mdx: 'markdown',
  css: 'css',
  html: 'html',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  sh: 'shell',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  sql: 'sql',
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
  const file = trpc.file.read.useQuery({ workspaceId, path });
  const theme = useUI((s) => s.theme);
  const language = useMemo(() => langFor(path), [path]);

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
        </div>
        <div className="flex items-center gap-3 font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
          <span>{language}</span>
          {file.data?.truncated && <span className="text-signal-warn">truncated</span>}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          theme={theme === 'dark' ? 'vs-dark' : 'vs'}
          language={language}
          value={file.data?.content ?? ''}
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
            readOnly: true,
          }}
        />
      </div>
    </div>
  );
}
