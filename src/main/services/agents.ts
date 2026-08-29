import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { agents } from '../db/schema.js';
import type { AgentRecord } from '@shared/schema.js';

export const listAgents = (): AgentRecord[] => {
  return getDb().select().from(agents).all();
};

export const getAgent = (id: number): AgentRecord => {
  const row = getDb().select().from(agents).where(eq(agents.id, id)).get();
  if (!row) throw new Error(`agent not found: ${id}`);
  return row;
};

export const createAgent = (input: Omit<AgentRecord, 'id'>) => {
  return getDb().insert(agents).values(input).returning().get();
};

export const updateAgent = (id: number, input: Partial<AgentRecord>): AgentRecord => {
  return getDb().update(agents).set(input).where(eq(agents.id, id)).returning().get();
};

export const deleteAgent = (id: number) => {
  getDb().delete(agents).where(eq(agents.id, id)).run();
};
