import type { ReactNode } from 'react';
import { Separator } from './ui/separator';
import { FileText } from 'lucide-react';

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
      <header className="mb-6 flex items-center justify-between gap-6">
        <div>
          <div className="font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
            <span className="text-ink-600">~/ase</span>
            <span className="mx-1 text-ink-700">/</span>
            <span className="text-amber">{path}</span>
          </div>
          <h1 className="mt-2 text-xl font-medium leading-tight tracking-tight text-ink-50">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-ui-sm leading-relaxed text-ink-400">{subtitle}</p>
          )}
        </div>
        {actions && <div className="animate-fade-in">{actions}</div>}
      </header>
      <Separator className="mb-5 bg-ink-800/60" />
      <div className="min-h-0 flex-1 animate-slide-up">{children}</div>
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-ink-700/60 bg-ink-900/20 px-8 py-14 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink-800/60">
        <FileText className="h-4 w-4 text-ink-500" strokeWidth={1.2} />
      </div>
      <div className="font-mono text-ui-xs uppercase tracking-widest2 text-ink-500">
        coming soon
      </div>
      <div className="mt-1 font-mono text-ui-sm text-ink-400">{children}</div>
    </div>
  );
}
