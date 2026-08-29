import { eq } from 'drizzle-orm';
import { join, basename, sep } from 'node:path';
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
import { SkillDetails } from './types.js';

const log = logger.child({ mod: 'skills' });

const ID_RE = /^[a-z0-9][a-z0-9-_]*$/i;

/**
 * Directories to scan for skills, in precedence order (earlier wins on name clash).
 * Userspace first, then the active workspace's conventional skill folders.
 */
async function skillSourceDirs(): Promise<{ dir: string; source: string }[]> {
  const dirs: { dir: string; source: string }[] = [
    { dir: join(userDataDir(), 'skills'), source: 'user' },
  ];
  const workspaceId = await getSetting(SETTING_KEYS.ACTIVE_WORKSPACE);
  if (workspaceId) {
    try {
      const ws = await getWorkspace(Number(workspaceId));
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

async function readSkillFolder(absDir: string, source: string): Promise<SkillDetails | null> {
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
    id: 0,
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
export const syncSkills = async (): Promise<SkillRecord[]> => {
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
};

/** Return all skills from the DB only — no disk I/O. Kept fresh by syncSkills() on app start / Skills page open. */
export const listSkills = async (): Promise<SkillRecord[]> => {
  const db = getDb();
  return db
    .select()
    .from(skillsTable)
    .all()
    .sort((a, b) => a.name.localeCompare(b.name));
};

/** Resolve which configured source directory a skill's absolute path was found under. */
async function resolveSkillSource(path: string): Promise<string> {
  const dirs = await skillSourceDirs();
  return dirs.find(({ dir }) => path.startsWith(`${dir}${sep}`))?.source ?? 'workspace';
}

/** Load one skill's full details (body, when_to_use, allowed-tools) by reading its SKILL.md from disk. */
export const getSkillById = async (id: number): Promise<SkillDetails | null> => {
  const row = getDb().select().from(skillsTable).where(eq(skillsTable.id, id)).get();
  if (!row) return null;
  const source = await resolveSkillSource(row.path);
  const details = await readSkillFolder(row.path, source);
  if (!details) return null;
  return { ...details, id: row.id, enabled: row.enabled };
};
