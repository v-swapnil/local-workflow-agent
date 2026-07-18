import matter from 'gray-matter';

export interface SkillFrontmatter {
  name: string;
  description: string;
  when_to_use?: string;
  allowedTools?: string[];
}

function parseAllowedTools(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const list = value.map((v) => String(v).trim()).filter(Boolean);
    return list.length ? list : undefined;
  }
  if (typeof value === 'string') {
    const list = value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    return list.length ? list : undefined;
  }
  return undefined;
}

export function parseSkill(raw: string): { meta: SkillFrontmatter; body: string } {
  const fm = matter(raw);
  const data = (fm.data ?? {}) as Record<string, unknown>;
  if (!data.name) {
    throw new Error('SKILL.md frontmatter requires `name`');
  }
  if (!data.description) {
    throw new Error('SKILL.md frontmatter requires `description`');
  }
  const meta: SkillFrontmatter = {
    name: String(data.name),
    description: String(data.description),
    when_to_use: data.when_to_use ? String(data.when_to_use) : undefined,
    allowedTools:
      parseAllowedTools(data['allowed-tools']) ??
      parseAllowedTools(data.allowedTools) ??
      parseAllowedTools(data.allowed_tools),
  };
  return { meta, body: fm.content.trim() };
}
