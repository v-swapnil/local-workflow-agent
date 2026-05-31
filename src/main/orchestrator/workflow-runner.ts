import { StateGraph, START, END } from '@langchain/langgraph';
import {
  getWorkflow,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowEdge,
} from '../services/workflows.js';
import { getAgent } from '../services/agents.js';
import { requestApproval } from '../services/approvals.js';
import { buildGraph } from './graph.js';
import type { AgentState } from './state.js';
import { WorkflowStateAnnotation, type WorkflowState } from './workflow-state.js';
import type { TaskResult } from '@shared/agent';
import { logger } from '../services/logger.js';
import type { RunCtx } from './runCtx.js';
import { emitLog } from './eventEmitter.js';

const log = logger.child({ mod: 'workflow-runner' });

function evaluateCondition(data: Record<string, unknown>, state: WorkflowState): 'true' | 'false' {
  const field = data.field as string;
  const operator = data.operator as string;
  const value = data.value;

  // Resolve dot-notation path in agentOutputs
  const parts = field.split('.');
  let current: unknown = state.agentOutputs;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      current = undefined;
      break;
    }
    current = (current as Record<string, unknown>)[part];
  }

  switch (operator) {
    case 'eq':
      return current === value ? 'true' : 'false';
    case 'neq':
      return current !== value ? 'true' : 'false';
    case 'gt':
      return (current as number) > (value as number) ? 'true' : 'false';
    case 'lt':
      return (current as number) < (value as number) ? 'true' : 'false';
    case 'gte':
      return (current as number) >= (value as number) ? 'true' : 'false';
    case 'lte':
      return (current as number) <= (value as number) ? 'true' : 'false';
    case 'contains':
      return String(current).includes(String(value)) ? 'true' : 'false';
    case 'exists':
      return current !== undefined && current !== null ? 'true' : 'false';
    default:
      return 'false';
  }
}

export async function runWorkflow(
  taskId: string,
  workflowId: string,
  ctx: RunCtx,
): Promise<TaskResult> {
  const workflowRecord = getWorkflow(workflowId);
  const definition: WorkflowDefinition = {
    nodes: workflowRecord.nodes,
    edges: workflowRecord.edges,
  };

  emitLog(taskId, undefined, true, `[workflow] running "${workflowRecord.name}"`);

  const startNode = definition.nodes.find((n) => n.type === 'start');
  const endNode = definition.nodes.find((n) => n.type === 'end');
  if (!startNode) throw new Error('workflow has no start node');
  if (!endNode) throw new Error('workflow has no end node');

  const graph = new StateGraph(WorkflowStateAnnotation);
  const edgeMap = new Map<string, WorkflowEdge[]>();
  for (const edge of definition.edges) {
    const list = edgeMap.get(edge.source) ?? [];
    list.push(edge);
    edgeMap.set(edge.source, list);
  }

  // Add nodes
  for (const node of definition.nodes) {
    if (node.type === 'start' || node.type === 'end') continue;

    if (node.type === 'agent') {
      const agentId = node.data.agentId as string;
      graph.addNode(node.id, async (state: WorkflowState) => {
        emitLog(taskId, undefined, true, `[workflow] node "${node.id}" (agent)`);
        try {
          const agent = getAgent(agentId);
          const agentCtx: RunCtx = { ...ctx };
          const agentGraph = buildGraph(agent);
          const initial: Partial<AgentState> = { prompt: state.prompt };
          await agentGraph.invoke(initial, {
            configurable: { runCtx: agentCtx },
            recursionLimit: 10,
            signal: ctx.signal,
          });
          return {
            currentNodeId: node.id,
            agentOutputs: { [node.id]: { done: true } },
            iteration: state.iteration + 1,
          };
        } catch (err) {
          log.warn({ nodeId: node.id, err }, 'workflow agent node failed');
          return { currentNodeId: node.id };
        }
      });
    } else if (node.type === 'condition') {
      graph.addNode(node.id, (state: WorkflowState) => {
        const result = evaluateCondition(node.data, state);
        emitLog(taskId, undefined, true, `[workflow] condition "${node.id}" → ${result}`);
        return { currentNodeId: node.id };
      });
    } else if (node.type === 'approval') {
      graph.addNode(node.id, async (_state: WorkflowState) => {
        emitLog(taskId, undefined, true, `[workflow] approval requested by node "${node.id}"`);
        const decision = await requestApproval(taskId, 'ask_user', node.data, ctx.signal);
        if (decision === 'deny') {
          throw new Error(`Approval denied at node "${node.id}"`);
        }
        return { currentNodeId: node.id };
      });
    }
  }

  // Add edges
  const processedConditions = new Set<string>();
  for (const edge of definition.edges) {
    const sourceNode = definition.nodes.find((n) => n.id === edge.source);
    const targetIsEnd = edge.target === endNode.id;

    if (!sourceNode) continue;

    if (sourceNode.type === 'start') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      graph.addEdge(START, edge.target as any);
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targetNodeId: any = targetIsEnd ? END : edge.target;

    if (sourceNode.type === 'condition') {
      if (processedConditions.has(sourceNode.id)) continue;
      processedConditions.add(sourceNode.id);
      // Conditional edges: find both true/false outgoing edges
      const outEdges: WorkflowEdge[] = edgeMap.get(sourceNode.id) ?? [];
      if (outEdges.length >= 2) {
        const trueTarget = outEdges.find((e) => e.sourceHandle === 'true')?.target;
        const falseTarget = outEdges.find((e) => e.sourceHandle === 'false')?.target;
        if (trueTarget && falseTarget) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const trueNodeId: any = trueTarget === endNode.id ? END : trueTarget;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const falseNodeId: any = falseTarget === endNode.id ? END : falseTarget;
          graph.addConditionalEdges(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sourceNode.id as any,
            (state: WorkflowState) => evaluateCondition(sourceNode.data, state),
            { true: trueNodeId, false: falseNodeId },
          );
        }
      }
    } else if (sourceNode.type !== 'end') {
      const outEdges: WorkflowEdge[] = edgeMap.get(edge.source) ?? [];
      if (outEdges.length === 1) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        graph.addEdge(edge.source as any, targetNodeId);
      }
    }
  }

  const compiled = graph.compile();
  const initialState: Partial<WorkflowState> = { prompt: ctx.taskId };

  try {
    await compiled.invoke(initialState, {
      configurable: { runCtx: ctx },
      recursionLimit: 50,
      signal: ctx.signal,
    });
    return {
      status: 'succeeded',
      iterations: 1,
      plan: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: 'failed',
      iterations: 1,
      plan: null,
      reason: msg,
    };
  }
}
