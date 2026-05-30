import { shell } from 'electron';
import { eq } from 'drizzle-orm';
import { join, resolve } from 'node:path';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { getDb } from '../../db/index.js';
import { skills as skillsTable } from '../../db/schema.js';
import { userSkillsDir, syncSkills, getSkillByName, ID_RE } from './skillDisk.js';
import { renderSkillMd } from './skillParser.js';
import type { SkillRecord } from '@shared/schema.js';

export async function setSkillEnabled(name: string, enabled: boolean): Promise<void> {
  getDb().update(skillsTable).set({ enabled }).where(eq(skillsTable.name, name)).run();
}

export async function createSkill(input: {
  id: string;
  name: string;
  description: string;
  whenToUse?: string;
  tags?: string[];
  body?: string;
}): Promise<SkillRecord> {
  if (!ID_RE.test(input.id)) {
    throw new Error('skill id must match /^[a-z0-9][a-z0-9-_]*$/i');
  }
  const dir = join(userSkillsDir(), input.id);
  if (existsSync(dir)) throw new Error(`skill folder already exists: ${input.id}`);
  await mkdir(dir, { recursive: true });
  const md = renderSkillMd(input);
  await writeFile(join(dir, 'SKILL.md'), md, 'utf8');
  const all = await syncSkills();
  const skill = all.find((s) => s.path === resolve(dir));
  if (!skill) throw new Error('skill created but not found after sync');
  return skill;
}

export async function deleteSkill(name: string): Promise<void> {
  const skill = await getSkillByName(name);
  if (!skill) return;
  if (skill.builtin) throw new Error('cannot delete a builtin skill (disable it instead)');
  await rm(skill.path, { recursive: true, force: true });
  await syncSkills();
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
