import matter from 'gray-matter';

export interface SkillFrontmatter {
  name: string;
  description: string;
  when_to_use?: string;
  tags?: string[];
}

export interface Skill {
  id: string;
  name: string;
  path: string; // absolute path to the skill folder
  description: string;
  whenToUse: string;
  tags: string[];
  body: string; // markdown body (without frontmatter)
  enabled: boolean;
  builtin: boolean;
  updatedAt: number;
}

export function parseSkill(raw: string): { meta: SkillFrontmatter; body: string } {
  const fm = matter(raw);
  const data = fm.data as Partial<SkillFrontmatter>;
  if (!data || !data.name) {
    throw new Error('SKILL.md frontmatter requires `name`');
  }
  if (!data.description) {
    throw new Error('SKILL.md frontmatter requires `description`');
  }
  const meta: SkillFrontmatter = {
    name: String(data.name),
    description: String(data.description),
    when_to_use: data.when_to_use ? String(data.when_to_use) : undefined,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : undefined,
  };
  return { meta, body: fm.content.trim() };
}

export function renderSkillMd(input: {
  name: string;
  description: string;
  whenToUse?: string;
  tags?: string[];
  body?: string;
}): string {
  const tagList = input.tags?.length ? `[${input.tags.join(', ')}]` : '[]';
  return `---
name: ${input.name}
description: ${input.description}
when_to_use: ${input.whenToUse ?? ''}
tags: ${tagList}
---

${input.body ?? `# ${input.name}\n\nWrite your skill instructions here.`}
`;
}
