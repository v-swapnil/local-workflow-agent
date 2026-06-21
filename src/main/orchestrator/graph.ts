import { StateGraph, START, END } from '@langchain/langgraph';
import { StateAnnotation } from './state.js';
import { plannerNode } from './plannerNode.js';
import { executorNode } from './executorNode.js';
import { copilotExecutorNode } from './copilotExecutorNode.js';
import { PROVIDERS, AGENT_KIND, type AgentKind } from '@shared/constants';

export function buildGraph(provider: string, kind: AgentKind = AGENT_KIND.PLANNER_EXECUTOR) {
  if (provider === PROVIDERS.COPILOT) {
    return new StateGraph(StateAnnotation)
      .addNode('executor', copilotExecutorNode)
      .addEdge(START, 'executor')
      .addEdge('executor', END)
      .compile();
  }

  if (kind === AGENT_KIND.EXECUTOR) {
    return new StateGraph(StateAnnotation)
      .addNode('executor', executorNode)
      .addEdge(START, 'executor')
      .addEdge('executor', END)
      .compile();
  }

  if (kind === AGENT_KIND.PLANNER) {
    return new StateGraph(StateAnnotation)
      .addNode('planner', plannerNode)
      .addEdge(START, 'planner')
      .addEdge('planner', END)
      .compile();
  }

  // Default: planner+executor
  return new StateGraph(StateAnnotation)
    .addNode('planner', plannerNode)
    .addNode('executor', executorNode)
    .addEdge(START, 'planner')
    .addEdge('planner', 'executor')
    .addEdge('executor', END)
    .compile();
}
