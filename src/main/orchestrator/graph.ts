import { StateGraph, START, END } from '@langchain/langgraph';
import { StateAnnotation } from './state.js';
import { plannerNode } from './plannerNode.js';
import { executorNode } from './executorNode.js';
import { copilotExecutorNode } from './copilotExecutorNode.js';
import { PROVIDERS } from '@shared/constants';

export function buildGraph(provider: string) {
  if (provider === PROVIDERS.COPILOT) {
    return new StateGraph(StateAnnotation)
      .addNode('executor', copilotExecutorNode)
      .addEdge(START, 'executor')
      .addEdge('executor', END)
      .compile();
  }

  return new StateGraph(StateAnnotation)
    .addNode('planner', plannerNode)
    .addNode('executor', executorNode)
    .addEdge(START, 'planner')
    .addEdge('planner', 'executor')
    .addEdge('executor', END)
    .compile();
}
