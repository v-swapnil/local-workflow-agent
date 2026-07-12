import { StateGraph, START, END } from '@langchain/langgraph';
import { getWorkflow, type WorkflowDefinition, type WorkflowEdge } from '../services/workflows.js';
import { requestApproval } from '../services/approvals.js';
import { buildGraph } from './graph.js';
import { getSetting, SETTING_KEYS } from '../services/settings.js';
import { PROVIDERS, AGENT_KIND, type AgentKind } from '@shared/constants';
import { getAgentOrNull } from '../services/agents.js';
import type { AgentState } from './state.js';
import { WorkflowStateAnnotation, type WorkflowState } from './workflow-state.js';
import type { TaskResult } from '@shared/agent';
import { logger } from '../services/logger.js';
import type { RunCtx } from './runCtx.js';
import { emitLog } from './eventEmitter.js';
import { getTask } from '@main/services/workspaces';

const log = logger.child({ mod: 'workflow-runner' });

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
          const provider = await getSetting(SETTING_KEYS.ACTIVE_PROVIDER, PROVIDERS.OLLAMA);
          const agentRecord = getAgentOrNull(agentId);
          const kind = agentRecord?.kind ?? AGENT_KIND.PLANNER_EXECUTOR;
          const agentCtx: RunCtx = { ...ctx, agentId };
          const agentGraph = buildGraph(provider, kind);
          const initial: Partial<AgentState> = { prompt: state.prompt };
          await agentGraph.invoke(initial, {
            configurable: { runCtx: agentCtx },
            signal: ctx.signal,
            timeout: ctx.timeoutMs,
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
    } else if (node.type === 'approval') {
      graph.addNode(node.id, async (_state: WorkflowState) => {
        emitLog(taskId, undefined, true, `[workflow] approval requested by node "${node.id}"`);
        const decision = await requestApproval(taskId, 'ask_question', node.data, ctx.signal);
        if (decision === 'deny') {
          throw new Error(`Approval denied at node "${node.id}"`);
        }
        return { currentNodeId: node.id };
      });
    }
  }

  // Add edges
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

    if (sourceNode.type !== 'end') {
      const outEdges: WorkflowEdge[] = edgeMap.get(edge.source) ?? [];
      if (outEdges.length === 1) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        graph.addEdge(edge.source as any, targetNodeId);
      }
    }
  }

  const compiled = graph.compile();

  try {
    const task = getTask(ctx.taskId);
    const initialState: Partial<WorkflowState> = { prompt: task.prompt };
    await compiled.invoke(initialState, {
      configurable: { runCtx: ctx },
      signal: ctx.signal,
      timeout: ctx.timeoutMs,
    });
    return { status: 'succeeded', plan: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'failed', plan: null, reason: msg };
  }
}
