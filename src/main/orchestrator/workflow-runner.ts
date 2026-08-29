import { StateGraph, START, END } from '@langchain/langgraph';
import { getWorkflow, type WorkflowDefinition, type WorkflowEdge } from '../services/workflows.js';
import { requestApproval } from '../services/approvals/index.js';
import { buildGraph } from './graph.js';
import { getSetting, SETTING_KEYS } from '../services/settings.js';
import { PROVIDERS } from '@shared/constants';
import type { AgentState } from './state.js';
import { WorkflowStateAnnotation, type WorkflowState } from './workflow-state.js';
import { logger } from '../services/logger.js';
import type { RunCtx } from './runCtx.js';
import { emitLog } from './eventEmitter.js';
import { getTask } from '@main/services/workspaces';
import { TaskResult } from './types.js';

const log = logger.child({ mod: 'workflow-runner' });

export async function runWorkflow(
  taskId: number,
  workflowId: number,
  ctx: RunCtx,
): Promise<TaskResult> {
  const workflowRecord = getWorkflow(workflowId);
  const definition: WorkflowDefinition = {
    nodes: workflowRecord.nodes,
    edges: workflowRecord.edges,
  };

  emitLog(taskId, 'info', `[workflow] running "${workflowRecord.name}"`);

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
      const agentId = node.data.agentId as number;
      graph.addNode(node.id, async (state: WorkflowState) => {
        emitLog(taskId, 'info', `[workflow] node "${node.id}" (agent)`);
        try {
          const provider = await getSetting(SETTING_KEYS.ACTIVE_PROVIDER, PROVIDERS.OLLAMA);
          const agentCtx: RunCtx = { ...ctx, agentId };
          const agentGraph = buildGraph(provider);
          // Chain the previous agent node's output into this node's prompt; the
          // first node in the workflow falls back to the original task prompt.
          const inputPrompt = state.result || state.prompt;
          const initial: Partial<AgentState> = { prompt: inputPrompt };
          const output = await agentGraph.invoke(initial, {
            configurable: { runCtx: agentCtx },
            signal: ctx.signal,
            timeout: ctx.timeoutMs,
          });
          return {
            result: output.result,
          };
        } catch (err) {
          log.warn({ nodeId: node.id, err }, 'workflow agent node failed');
          throw err;
        }
      });
    } else if (node.type === 'approval') {
      graph.addNode(node.id, async (_state: WorkflowState) => {
        emitLog(taskId, 'info', `[workflow] approval requested by node "${node.id}"`);
        // TODO: fix this
        const decision = await requestApproval(taskId, null, 'workflow_approval', ctx.signal);
        if (decision === 'denied') {
          throw new Error(`Approval denied at node "${node.id}"`);
        }
        return {};
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
    return { status: 'succeeded' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'failed', reason: msg };
  }
}
