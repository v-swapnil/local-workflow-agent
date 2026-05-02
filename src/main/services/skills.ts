import { app, shell } from 'electron';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { join, basename, resolve } from 'node:path';
import { readdir, readFile, writeFile, mkdir, stat, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import matter from 'gray-matter';
import { getDb } from '../db/index.js';
import { skills as skillsTable } from '../db/schema.js';
import { userDataDir } from '../util/paths.js';
import { logger } from './logger.js';

const log = logger.child({ mod: 'skills' });

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

const ID_RE = /^[a-z0-9][a-z0-9-_]*$/i;

/* ───────── Paths ───────── */

export function userSkillsDir(): string {
  return join(userDataDir(), 'skills');
}

/** Bundled skills folder. In dev: repo root /skills. In prod: resources/skills. */
function bundledSkillsDir(): string {
  // electron-vite places source at app.getAppPath() in both dev and prod
  const candidates = [
    join(app.getAppPath(), 'skills'),
    join(process.resourcesPath ?? '', 'skills'),
    join(process.cwd(), 'skills'),
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return candidates[0]!;
}

/* ───────── Frontmatter parser (gray-matter) ───────── */

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

/* ───────── Loader ───────── */

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

async function readSkillFolder(absDir: string, builtinIds: Set<string>): Promise<Skill | null> {
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
  const st = await stat(skillFile);
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
    updatedAt: st.mtimeMs,
  };
}

/**
 * Read all skills from disk and reconcile with the DB.
 * Preserves the user's `enabled` toggle for skills that already had a row.
 */
export async function syncSkills(): Promise<Skill[]> {
  await ensureBundledSkills();

  const userDir = userSkillsDir();
  const builtinIds = new Set<string>();
  const bundled = bundledSkillsDir();
  if (existsSync(bundled)) {
    for (const e of await readdir(bundled, { withFileTypes: true })) {
      if (e.isDirectory()) builtinIds.add(e.name);
    }
  }

  const found: Skill[] = [];
  for (const entry of await readdir(userDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sk = await readSkillFolder(join(userDir, entry.name), builtinIds);
    if (sk) found.push(sk);
  }

  const db = getDb();
  const existing = db.select().from(skillsTable).all();
  const existingByName = new Map(existing.map((r) => [r.name, r]));
  const seenNames = new Set<string>();

  for (const sk of found) {
    seenNames.add(sk.name);
    const prior = existingByName.get(sk.name);
    if (prior) {
      sk.enabled = prior.enabled;
      db.update(skillsTable)
        .set({
          path: sk.path,
          description: sk.description,
          builtin: sk.builtin,
          updatedAt: sk.updatedAt,
        })
        .where(eq(skillsTable.id, prior.id))
        .run();
    } else {
      db.insert(skillsTable)
        .values({
          id: nanoid(10),
          name: sk.name,
          path: sk.path,
          description: sk.description,
          enabled: true,
          builtin: sk.builtin,
          updatedAt: sk.updatedAt,
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
export async function listSkills(): Promise<Skill[]> {
  return syncSkills();
}

export async function getSkillByName(name: string): Promise<Skill | null> {
  const all = await syncSkills();
  return all.find((s) => s.name === name) ?? null;
}

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
}): Promise<Skill> {
  if (!ID_RE.test(input.id)) {
    throw new Error('skill id must match /^[a-z0-9][a-z0-9-_]*$/i');
  }
  const dir = join(userSkillsDir(), input.id);
  if (existsSync(dir)) throw new Error(`skill folder already exists: ${input.id}`);
  await mkdir(dir, { recursive: true });
  const md = renderSkillMd(input);
  await writeFile(join(dir, 'SKILL.md'), md, 'utf8');
  const all = await syncSkills();
  const sk = all.find((s) => s.path === resolve(dir));
  if (!sk) throw new Error('skill created but not found after sync');
  return sk;
}

export async function deleteSkill(name: string): Promise<void> {
  const sk = await getSkillByName(name);
  if (!sk) return;
  if (sk.builtin) throw new Error('cannot delete a builtin skill (disable it instead)');
  await rm(sk.path, { recursive: true, force: true });
  await syncSkills();
}

export async function revealSkillInOS(name: string): Promise<void> {
  const sk = await getSkillByName(name);
  if (!sk) throw new Error(`skill not found: ${name}`);
  shell.openPath(sk.path);
}

function renderSkillMd(input: {
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

/* ───────── Used by the planner/executor ───────── */

export interface SkillCatalogEntry {
  name: string;
  description: string;
  when_to_use: string;
}

/** Compact catalog handed to the planner. Only enabled skills are listed. */
export async function skillCatalog(): Promise<SkillCatalogEntry[]> {
  const all = await listSkills();
  return all
    .filter((s) => s.enabled)
    .map((s) => ({
      name: s.name,
      description: s.description,
      when_to_use: s.whenToUse,
    }));
}

/** Resolve selected skill names to their bodies (skipping unknown ones). */
export async function resolveSkillBodies(
  names: string[],
): Promise<{ name: string; body: string }[]> {
  if (!names?.length) return [];
  const all = await listSkills();
  const out: { name: string; body: string }[] = [];
  for (const n of names) {
    const sk = all.find((s) => s.name === n && s.enabled);
    if (sk) out.push({ name: sk.name, body: sk.body });
  }
  return out;
}
