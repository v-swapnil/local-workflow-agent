import { shell } from 'electron';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { skills as skillsTable } from '../../db/schema.js';
import { syncSkills, getSkillByName } from './skillDisk.js';
import type { SkillRecord } from '@shared/schema.js';

export async function setSkillEnabled(name: string, enabled: boolean): Promise<void> {
  getDb().update(skillsTable).set({ enabled }).where(eq(skillsTable.name, name)).run();
}

export async function revealSkillInOS(name: string): Promise<void> {
  const skill = await getSkillByName(name);
  if (!skill) throw new Error(`skill not found: ${name}`);
  shell.openPath(skill.path);
}

export interface SkillCatalogEntry {
  name: string;
  description: string;
  when_to_use: string;
  allowed_tools: string[];
  location: string; // absolute path to the skill folder
}

/** Compact catalog handed to the planner. Only enabled skills are listed. */
export async function skillCatalog(): Promise<SkillCatalogEntry[]> {
  const all = await syncSkills();
  return all
    .filter((skill) => skill.enabled)
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      when_to_use: skill.whenToUse,
      allowed_tools: skill.allowedTools,
      location: skill.path,
    }));
}

/** Resolve selected skill names to their bodies (skipping unknown ones). */
export async function resolveSkillBodies(
  names: string[],
): Promise<{ name: string; body: string }[]> {
  if (!names?.length) return [];
  const all = await syncSkills();
  const out: { name: string; body: string }[] = [];
  for (const skillName of names) {
    const skill = all.find((s) => s.name === skillName && s.enabled);
    if (skill) out.push({ name: skill.name, body: skill.body });
  }
  return out;
}
