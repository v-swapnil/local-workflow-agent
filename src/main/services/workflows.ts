import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { workflows } from '../db/schema.js';
import { WorkflowRecord } from '@shared/schema.js';

export interface ParsedWorkflowRecord extends Omit<WorkflowRecord, 'nodes' | 'edges'> {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowNode {
  id: string;
  type: 'start' | 'end' | 'agent' | 'approval';
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  label?: string;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

function parseRow(row: WorkflowRecord): ParsedWorkflowRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    nodes: JSON.parse(row.nodes || '[]') as WorkflowNode[],
    edges: JSON.parse(row.edges || '[]') as WorkflowEdge[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listWorkflows(): ParsedWorkflowRecord[] {
  const rows = getDb().select().from(workflows).all() as WorkflowRecord[];
  return rows.map(parseRow);
}

export function getWorkflow(id: number): ParsedWorkflowRecord {
  const row = getDb().select().from(workflows).where(eq(workflows.id, id)).get() as
    | WorkflowRecord
    | undefined;
  if (!row) throw new Error(`workflow not found: ${id}`);
  return parseRow(row);
}

export interface UpsertWorkflowInput {
  id?: number;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export function upsertWorkflow(input: UpsertWorkflowInput): ParsedWorkflowRecord {
  const now = Date.now();

  const row = {
    id: input.id ?? undefined,
    name: input.name,
    description: input.description ?? null,
    nodes: JSON.stringify(input.nodes),
    edges: JSON.stringify(input.edges),
    createdAt: now,
    updatedAt: now,
  };

  // If updating, preserve createdAt
  if (input.id) {
    try {
      const existing = getWorkflow(input.id);
      row.id = existing.id;
      row.createdAt = existing.createdAt;
    } catch {
      /* new record */
    }
  }

  const result = getDb()
    .insert(workflows)
    .values(row)
    .onConflictDoUpdate({ target: workflows.id, set: { ...row } })
    .run();

  return getWorkflow((result.lastInsertRowid || row.id) as number);
}

export function deleteWorkflow(id: number): void {
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
    if (!nodeIds.has(edge.source))
      errors.push(`Edge ${edge.id}: unknown source node ${edge.source}`);
    if (!nodeIds.has(edge.target))
      errors.push(`Edge ${edge.id}: unknown target node ${edge.target}`);
  }

  // Check agent nodes have agentId
  for (const node of def.nodes) {
    if (node.type === 'agent' && !node.data.agentId) {
      errors.push(`Agent node ${node.id}: missing agentId`);
    }
  }

  return { valid: errors.length === 0, errors };
}
