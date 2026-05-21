import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { workflows } from '../db/schema.js';

export interface WorkflowRecord {
  id: string;
  name: string;
  description: string | null;
  graphJson: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowNode {
  id: string;
  type: 'start' | 'end' | 'agent' | 'condition' | 'approval';
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  label?: string;
  maxIterations?: number;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export function listWorkflows(): WorkflowRecord[] {
  return getDb().select().from(workflows).all() as WorkflowRecord[];
}

export function getWorkflow(id: string): WorkflowRecord {
  const row = getDb().select().from(workflows).where(eq(workflows.id, id)).get();
  if (!row) throw new Error(`workflow not found: ${id}`);
  return row as WorkflowRecord;
}

export interface UpsertWorkflowInput {
  id?: string;
  name: string;
  description?: string;
  graphJson: string;
}

export function upsertWorkflow(input: UpsertWorkflowInput): WorkflowRecord {
  const now = Date.now();
  const id = input.id ?? nanoid(10);

  const row = {
    id,
    name: input.name,
    description: input.description ?? null,
    graphJson: input.graphJson,
    createdAt: now,
    updatedAt: now,
  };

  // If updating, preserve createdAt
  if (input.id) {
    try {
      const existing = getWorkflow(input.id);
      row.createdAt = existing.createdAt;
    } catch {
      /* new record */
    }
  }

  getDb()
    .insert(workflows)
    .values(row)
    .onConflictDoUpdate({ target: workflows.id, set: { ...row } })
    .run();

  return getWorkflow(id);
}

export function deleteWorkflow(id: string): void {
  getDb().delete(workflows).where(eq(workflows.id, id)).run();
}

export function validateWorkflowDefinition(def: WorkflowDefinition): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const startNodes = def.nodes.filter((n) => n.type === 'start');
  const endNodes = def.nodes.filter((n) => n.type === 'end');

  if (startNodes.length === 0) errors.push('Missing start node');
  if (startNodes.length > 1) errors.push('Multiple start nodes');
  if (endNodes.length === 0) errors.push('Missing end node');

  // Check all edge sources/targets reference valid nodes
  const nodeIds = new Set(def.nodes.map((n) => n.id));
  for (const edge of def.edges) {
    if (!nodeIds.has(edge.source)) errors.push(`Edge ${edge.id}: unknown source node ${edge.source}`);
    if (!nodeIds.has(edge.target)) errors.push(`Edge ${edge.id}: unknown target node ${edge.target}`);
  }

  // Check agent nodes have agentId
  for (const node of def.nodes) {
    if (node.type === 'agent' && !node.data.agentId) {
      errors.push(`Agent node ${node.id}: missing agentId`);
    }
  }

  return { valid: errors.length === 0, errors };
}
