import { PageShell } from '../components/PageShell';
import { ToolPlayground } from '../components/ToolPlayground';

export function Tools() {
  return (
    <div className="mx-auto flex min-h-full flex-col p-4 animate-fade-in">
      <ToolPlayground />
    </div>
  );
}
