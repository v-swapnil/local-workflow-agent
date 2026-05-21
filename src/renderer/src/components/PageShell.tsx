import type { ReactNode } from 'react';

export function PageShell({
  path,
  title,
  subtitle,
  children,
  actions,
}: {
  path: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-full flex-col px-6 py-6 animate-fade-in">
      <header className="mb-6 flex items-end justify-between gap-6">
        <div>
          <div className="font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
            <span className="text-ink-600">~/ase</span>
            <span className="mx-1 text-ink-700">/</span>
            <span className="text-amber">{path}</span>
          </div>
          <h1 className="mt-2 text-xl font-medium leading-tight tracking-tight text-ink-50">{title}</h1>
          {subtitle && (
            <p className="mt-1 max-w-xl text-ui-sm leading-relaxed text-ink-400">{subtitle}</p>
          )}
        </div>
        {actions && <div className="animate-fade-in">{actions}</div>}
      </header>
      <div className="divider-h mb-5" />
      <div className="min-h-0 flex-1 animate-slide-up">{children}</div>
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-ink-700/60 bg-ink-900/20 px-8 py-14 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink-800/60">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="h-4 w-4 text-ink-500">
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <path d="M5 7.5h6M5 9.5h3" />
        </svg>
      </div>
      <div className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
        coming soon
      </div>
      <div className="mt-1 font-mono text-ui-sm text-ink-400">{children}</div>
    </div>
  );
}
