import { SidebarListItem } from '../ui/sidebar-list-item';

type Skill = {
  name: string;
  description: string;
  enabled: boolean;
  source: 'user' | 'workspace';
};

type SkillSidebarProps = {
  skills: Skill[];
  focusedName: string | null;
  onSelect: (name: string) => void;
};

export function SkillSidebar({ skills, focusedName, onSelect }: SkillSidebarProps) {
  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex-1 space-y-px overflow-y-auto pr-1">
        {skills.map((skill) => (
          <SidebarListItem
            key={skill.name}
            title={skill.name}
            isActive={focusedName === skill.name}
            onSelect={() => onSelect(skill.name)}
            status={{ active: skill.enabled }}
            subtitle={skill.description?.trim() || undefined}
            tags={[{ label: skill.source }]}
          />
        ))}
        {skills.length === 0 && (
          <div className="font-mono text-ui-sm text-ink-500">
            no skills found — add a skill folder under skills/, .claude/skills, .github/skills, or
            userData/skills
          </div>
        )}
      </div>
    </aside>
  );
}
