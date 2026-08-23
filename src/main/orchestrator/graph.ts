import { StateGraph, START, END } from '@langchain/langgraph';
import { StateAnnotation } from './state.js';
import { executorNode } from './executorNode.js';
import { copilotExecutorNode } from './copilotExecutorNode.js';
import { PROVIDERS } from '@shared/constants';

export function buildGraph(provider: string) {
  const node = provider === PROVIDERS.COPILOT ? copilotExecutorNode : executorNode;
  return new StateGraph(StateAnnotation)
    .addNode('executor', node)
    .addEdge(START, 'executor')
    .addEdge('executor', END)
    .compile();
}
