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
    <div className="mx-auto flex min-h-full max-w-5xl flex-col px-10 py-10">
      <header className="mb-10 flex items-end justify-between gap-6">
        <div>
          <div className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
            <span className="text-ink-500">~/ase</span>
            <span className="mx-1 text-ink-600">/</span>
            <span className="text-amber">{path}</span>
          </div>
          <h1 className="mt-3 font-serif text-4xl leading-tight text-ink-50">{title}</h1>
          {subtitle && (
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-300">{subtitle}</p>
          )}
        </div>
        {actions}
      </header>
      <div className="hair mb-8 h-px" />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded border border-dashed border-ink-700 bg-ink-900/40 px-6 py-10 font-mono text-ui-base text-ink-400">
      <div className="mb-2 text-ui-xs uppercase tracking-widest2 text-ink-500">
        // not implemented
      </div>
      {children}
    </div>
  );
}
