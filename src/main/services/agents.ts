import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { agents } from '../db/schema.js';
import { PROVIDERS } from '@shared/constants';
import type { AgentRecord } from '@shared/schema.js';

export function listAgents(): AgentRecord[] {
  return getDb().select().from(agents).all() as AgentRecord[];
}

export function getAgent(id: string): AgentRecord {
  const row = getDb().select().from(agents).where(eq(agents.id, id)).get();
  if (!row) throw new Error(`agent not found: ${id}`);
  return row as AgentRecord;
}

export function getAgentOrNull(id: string): AgentRecord | null {
  const row = getDb().select().from(agents).where(eq(agents.id, id)).get();
  return (row as AgentRecord) ?? null;
}

interface UpsertAgentInput {
  id?: string;
  name: string;
  role: string;
  model: string;
  systemPrompt: string;
  tools?: string | null;
  temperature: number;
  graphMode: 'full' | 'direct';
  maxIterations?: number;
  description?: string;
  provider?: string;
}

export function upsertAgent(input: UpsertAgentInput): AgentRecord {
  const now = Date.now();
  const id = input.id ?? nanoid(10);

  const row = {
    id,
    name: input.name,
    role: input.role,
    model: input.model,
    systemPrompt: input.systemPrompt,
    tools: input.tools ?? null,
    temperature: input.temperature,
    graphMode: input.graphMode,
    maxIterations: input.maxIterations ?? 10,
    description: input.description ?? null,
    provider: input.provider ?? PROVIDERS.OLLAMA,
  };

  getDb()
    .insert(agents)
    .values({ ...row })
    .onConflictDoUpdate({ target: agents.id, set: { ...row } })
    .run();

  return getAgent(id);
}

export function deleteAgent(id: string): void {
  getDb().delete(agents).where(eq(agents.id, id)).run();
}
