import { shell } from 'electron';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { skills as skillsTable } from '../../db/schema.js';
import { getSkillById } from './skillDisk.js';
import type { SkillRecord } from '@shared/schema.js';

export async function setSkillEnabled(id: number, enabled: boolean): Promise<void> {
  getDb().update(skillsTable).set({ enabled }).where(eq(skillsTable.id, id)).run();
}

export async function revealSkillInOS(id: number): Promise<void> {
  const skill = await getSkillById(id);
  if (!skill) throw new Error(`skill not found: ${id}`);
  shell.openPath(skill.path);
}
