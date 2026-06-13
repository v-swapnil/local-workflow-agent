import { app } from 'electron';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { join, basename } from 'node:path';
import { readdir, readFile, stat, mkdir, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { getDb } from '../../db/index.js';
import { skills as skillsTable } from '../../db/schema.js';
import { userDataDir } from '../../util/paths.js';
import { logger } from '../logger.js';
import { parseSkill } from './skillParser.js';
import type { SkillRecord } from '@shared/schema.js';

const log = logger.child({ mod: 'skills' });

export const ID_RE = /^[a-z0-9][a-z0-9-_]*$/i;

export function userSkillsDir(): string {
  return join(userDataDir(), 'skills');
}

/** Bundled skills folder. In dev: repo root /skills. In prod: resources/skills. */
export function bundledSkillsDir(): string {
  const candidates = [
    join(app.getAppPath(), 'skills'),
    join(process.resourcesPath ?? '', 'skills'),
    join(process.cwd(), 'skills'),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

/** Copy a folder (recursive) only if dest doesn't already exist. */
async function copyDirIfMissing(src: string, dest: string): Promise<void> {
  if (existsSync(dest)) return;
  await cp(src, dest, { recursive: true });
}

/** On first run, mirror bundled skills into userData so they're editable. */
export async function ensureBundledSkills(): Promise<void> {
  const userDir = userSkillsDir();
  await mkdir(userDir, { recursive: true });
  const bundled = bundledSkillsDir();
  if (!existsSync(bundled)) {
    log.warn({ bundled }, 'no bundled skills directory found');
    return;
  }
  for (const entry of await readdir(bundled, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!ID_RE.test(entry.name)) continue;
    await copyDirIfMissing(join(bundled, entry.name), join(userDir, entry.name));
  }
}

async function readSkillFolder(
  absDir: string,
  builtinIds: Set<string>,
): Promise<SkillRecord | null> {
  const id = basename(absDir);
  if (!ID_RE.test(id)) return null;
  const skillFile = join(absDir, 'SKILL.md');
  if (!existsSync(skillFile)) return null;
  let raw: string;
  try {
    raw = await readFile(skillFile, 'utf8');
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = parseSkill(raw);
  } catch (err) {
    log.warn({ id, err: (err as Error).message }, 'invalid SKILL.md');
    return null;
  }
  const fileStat = await stat(skillFile);
  return {
    id,
    name: parsed.meta.name,
    path: absDir,
    description: parsed.meta.description,
    whenToUse: parsed.meta.when_to_use ?? '',
    tags: parsed.meta.tags ?? [],
    body: parsed.body,
    enabled: true,
    builtin: builtinIds.has(id),
    updatedAt: fileStat.mtimeMs,
  };
}

/**
 * Read all skills from disk and reconcile with the DB.
 * Preserves the user's `enabled` toggle for skills that already had a row.
 */
export async function syncSkills(): Promise<SkillRecord[]> {
  await ensureBundledSkills();

  const userDir = userSkillsDir();
  const builtinIds = new Set<string>();
  const bundled = bundledSkillsDir();
  if (existsSync(bundled)) {
    for (const entry of await readdir(bundled, { withFileTypes: true })) {
      if (entry.isDirectory()) builtinIds.add(entry.name);
    }
  }

  const found: SkillRecord[] = [];
  for (const entry of await readdir(userDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skill = await readSkillFolder(join(userDir, entry.name), builtinIds);
    if (skill) found.push(skill);
  }

  const db = getDb();
  const existing = db.select().from(skillsTable).all();
  const existingByName = new Map(existing.map((row) => [row.name, row]));
  const seenNames = new Set<string>();

  for (const skill of found) {
    seenNames.add(skill.name);
    const prior = existingByName.get(skill.name);
    if (prior) {
      skill.enabled = prior.enabled;
      db.update(skillsTable)
        .set({
          path: skill.path,
          description: skill.description,
          builtin: skill.builtin,
          updatedAt: skill.updatedAt,
        })
        .where(eq(skillsTable.id, prior.id))
        .run();
    } else {
      db.insert(skillsTable)
        .values({
          id: nanoid(10),
          name: skill.name,
          path: skill.path,
          description: skill.description,
          enabled: true,
          builtin: skill.builtin,
          updatedAt: skill.updatedAt,
        })
        .run();
    }
  }

  // Drop DB rows whose folders disappeared
  for (const row of existing) {
    if (!seenNames.has(row.name)) {
      db.delete(skillsTable).where(eq(skillsTable.id, row.id)).run();
    }
  }

  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** Return all skills with their disk-loaded body. */
export async function listSkills(): Promise<SkillRecord[]> {
  return syncSkills();
}

export async function getSkillByName(name: string): Promise<SkillRecord | null> {
  const all = await syncSkills();
  return all.find((skill) => skill.name === name) ?? null;
}
