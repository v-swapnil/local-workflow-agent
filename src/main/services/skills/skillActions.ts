import { shell } from 'electron';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { skills as skillsTable } from '../../db/schema.js';
import { getSkillByName } from './skillDisk.js';
import type { SkillRecord } from '@shared/schema.js';

export async function setSkillEnabled(name: string, enabled: boolean): Promise<void> {
  getDb().update(skillsTable).set({ enabled }).where(eq(skillsTable.name, name)).run();
}

export async function revealSkillInOS(name: string): Promise<void> {
  const skill = await getSkillByName(name);
  if (!skill) throw new Error(`skill not found: ${name}`);
  shell.openPath(skill.path);
}
