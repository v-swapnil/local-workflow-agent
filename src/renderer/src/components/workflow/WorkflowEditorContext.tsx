import { createContext, useContext } from 'react';

export interface WorkflowAgentOption {
  id: string;
  name: string;
  role: string;
}

export interface WorkflowEditorContextValue {
  /** Agents available for assignment to agent nodes. */
  agents: WorkflowAgentOption[];
  /** Merge a patch into a node's data and persist the change. */
  updateNodeData: (nodeId: string, patch: Record<string, unknown>) => void;
  /** Remove a node (and its connected edges) from the canvas. */
  deleteNode: (nodeId: string) => void;
}

const WorkflowEditorContext = createContext<WorkflowEditorContextValue | null>(null);

export const WorkflowEditorProvider = WorkflowEditorContext.Provider;

export function useWorkflowEditor(): WorkflowEditorContextValue {
  const ctx = useContext(WorkflowEditorContext);
  if (!ctx) {
    throw new Error('useWorkflowEditor must be used within a WorkflowEditorProvider');
  }
  return ctx;
}
