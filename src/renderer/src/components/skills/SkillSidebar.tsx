import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

type Skill = {
  name: string;
  description: string;
  enabled: boolean;
  builtin: boolean;
};

type SkillSidebarProps = {
  skills: Skill[];
  focusedName: string | null;
  onSelect: (name: string) => void;
};

export function SkillSidebar({ skills, focusedName, onSelect }: SkillSidebarProps) {
  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="mb-2 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
        registry · {skills.length}
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto pr-1">
        {skills.map((skill) => (
          <Button
            key={skill.name}
            variant="ghost"
            onClick={() => onSelect(skill.name)}
            className={cn(
              'h-auto w-full flex-col items-start rounded-lg border px-3 py-2.5 text-left justify-start font-normal',
              focusedName === skill.name
                ? 'border-amber/20 bg-amber/5 shadow-sm shadow-amber/5 hover:bg-amber/8'
                : 'border-ink-800/40 bg-ink-900/20 hover:border-ink-700/60 hover:bg-ink-900/30',
            )}
          >
            <div className="flex w-full items-center justify-between">
              <span className="font-mono text-ui-sm font-medium text-ink-50">{skill.name}</span>
              <Badge
                variant="outline"
                className={cn(
                  'font-mono text-ui-2xs uppercase tracking-widest2',
                  skill.enabled
                    ? 'border-emerald-500/20 bg-emerald-500/8 text-emerald-400'
                    : 'border-ink-700/40 text-ink-500',
                )}
              >
                {skill.enabled ? 'on' : 'off'}
              </Badge>
            </div>
            <div className="mt-0.5 line-clamp-2 font-mono text-ui-xs text-ink-400">
              {skill.description}
            </div>
            {skill.builtin && (
              <Badge variant="outline" className="mt-1 border-ink-700/40 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
                builtin
              </Badge>
            )}
          </Button>
        ))}
        {skills.length === 0 && (
          <div className="font-mono text-ui-sm text-ink-500">
            no skills found — create one or add a folder under userData/skills
          </div>
        )}
      </div>
    </aside>
  );
}
