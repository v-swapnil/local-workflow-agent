import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { join, basename } from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { getDb } from '../../db/index.js';
import { skills as skillsTable } from '../../db/schema.js';
import { userDataDir } from '../../util/paths.js';
import { getSetting, SETTING_KEYS } from '../settings.js';
import { getWorkspace } from '../workspaces/index.js';
import { logger } from '../logger.js';
import { parseSkill } from './skillParser.js';
import type { SkillRecord } from '@shared/schema.js';

const log = logger.child({ mod: 'skills' });

export const ID_RE = /^[a-z0-9][a-z0-9-_]*$/i;

type SkillSource = SkillRecord['source'];

export function userSkillsDir(): string {
  return join(userDataDir(), 'skills');
}

/**
 * Directories to scan for skills, in precedence order (earlier wins on name clash).
 * Userspace first, then the active workspace's conventional skill folders.
 */
async function skillSourceDirs(): Promise<{ dir: string; source: SkillSource }[]> {
  const dirs: { dir: string; source: SkillSource }[] = [
    { dir: userSkillsDir(), source: 'user' },
  ];
  const workspaceId = await getSetting(SETTING_KEYS.ACTIVE_WORKSPACE);
  if (workspaceId) {
    try {
      const ws = await getWorkspace(workspaceId);
      dirs.push(
        { dir: join(ws.path, 'skills'), source: 'workspace' },
        { dir: join(ws.path, '.claude', 'skills'), source: 'workspace' },
        { dir: join(ws.path, '.github', 'skills'), source: 'workspace' },
      );
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'failed to resolve active workspace for skills');
    }
  }
  return dirs;
}

async function readSkillFolder(absDir: string, source: SkillSource): Promise<SkillRecord | null> {
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
    allowedTools: parsed.meta.allowedTools ?? [],
    body: parsed.body,
    enabled: true,
    source,
    updatedAt: fileStat.mtimeMs,
  };
}

/**
 * Discover skills from disk (userspace + active workspace) and reconcile with the DB.
 * Skills are read-only on disk; the DB only persists the user's `enabled` toggle.
 */
export async function syncSkills(): Promise<SkillRecord[]> {
  const found: SkillRecord[] = [];
  const seenNames = new Set<string>();
  for (const { dir, source } of await skillSourceDirs()) {
    if (!existsSync(dir)) continue;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skill = await readSkillFolder(join(dir, entry.name), source);
      if (!skill) continue;
      if (seenNames.has(skill.name)) continue; // earlier source wins
      seenNames.add(skill.name);
      found.push(skill);
    }
  }

  const db = getDb();
  const existing = db.select().from(skillsTable).all();
  const existingByName = new Map(existing.map((row) => [row.name, row]));
  const foundNames = new Set(found.map((skill) => skill.name));

  for (const skill of found) {
    const prior = existingByName.get(skill.name);
    if (prior) {
      skill.enabled = prior.enabled;
      db.update(skillsTable)
        .set({
          path: skill.path,
          description: skill.description,
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
          updatedAt: skill.updatedAt,
        })
        .run();
    }
  }

  // Drop DB rows whose folders disappeared
  for (const row of existing) {
    if (!foundNames.has(row.name)) {
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
