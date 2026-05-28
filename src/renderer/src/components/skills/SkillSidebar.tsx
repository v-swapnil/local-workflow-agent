import { cn } from '../../lib/utils';

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
    <aside className="flex min-h-0 flex-col">
      <div className="mb-2 font-mono text-ui-xs uppercase tracking-widest2 text-ink-400">
        registry · {skills.length}
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto">
        {skills.map((skill) => (
          <button
            key={skill.name}
            onClick={() => onSelect(skill.name)}
            className={cn(
              'flex w-full flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-all',
              focusedName === skill.name
                ? 'border-amber/20 bg-amber/5 shadow-sm shadow-amber/5'
                : 'border-ink-800/40 bg-ink-900/20 hover:border-ink-700/60 hover:bg-ink-900/30',
            )}
          >
            <div className="flex w-full items-center justify-between">
              <span className="font-mono text-ui-sm font-medium text-ink-50">{skill.name}</span>
              <span
                className={cn(
                  'font-mono text-ui-2xs uppercase tracking-widest2',
                  skill.enabled ? 'text-emerald-400' : 'text-ink-500',
                )}
              >
                {skill.enabled ? 'on' : 'off'}
              </span>
            </div>
            <div className="mt-0.5 line-clamp-2 font-mono text-ui-xs text-ink-400">
              {skill.description}
            </div>
            {skill.builtin && (
              <span className="mt-1 font-mono text-ui-2xs uppercase tracking-widest2 text-ink-500">
                builtin
              </span>
            )}
          </button>
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
