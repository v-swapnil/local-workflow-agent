import { useCallback } from 'react';
import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  Panel,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AgentNode, ConditionNode, ApprovalNode, StartNode, EndNode } from './nodes/WorkflowNodes';
import { NodePalette } from './NodePalette';
import { WorkflowEditorProvider } from './WorkflowEditorContext';
import { trpc } from '@renderer/trpc';
import { type WorkflowDefinition } from '@main/services/workflows';

const nodeTypes = {
  agent: AgentNode,
  condition: ConditionNode,
  approval: ApprovalNode,
  start: StartNode,
  end: EndNode,
};

const DEFAULT_NODES: Node[] = [
  { id: 'start', type: 'start', position: { x: 200, y: 50 }, data: {} },
  { id: 'end', type: 'end', position: { x: 200, y: 300 }, data: {} },
];

interface WorkflowCanvasProps {
  initialDefinition?: WorkflowDefinition | null;
  agents: { id: string; name: string; role: string }[];
  onChange?: (def: WorkflowDefinition) => void;
}

export function WorkflowCanvas({ initialDefinition, agents, onChange }: WorkflowCanvasProps) {
  const savedTheme = trpc.settings.theme.useQuery();

  const initNodes: Node[] =
    initialDefinition?.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
    })) ?? DEFAULT_NODES;

  const initEdges: Edge[] =
    initialDefinition?.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      label: e.label,
      data: {},
    })) ?? [];

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  const notifyChange = useCallback(
    (ns: Node[], es: Edge[]) => {
      if (!onChange) return;
      const def: WorkflowDefinition = {
        nodes: ns.map((n) => ({
          id: n.id,
          type: n.type as WorkflowDefinition['nodes'][number]['type'],
          position: n.position,
          data: n.data as Record<string, unknown>,
        })),
        edges: es.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? undefined,
          label: e.label as string | undefined,
        })),
      };
      onChange(def);
    },
    [onChange],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((es) => {
        const next = addEdge(params, es);
        notifyChange(nodes, next);
        return next;
      });
    },
    [setEdges, notifyChange, nodes],
  );

  const updateNodeData = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      setNodes((ns) => {
        const next = ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n));
        notifyChange(next, edges);
        return next;
      });
    },
    [setNodes, edges, notifyChange],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      const target = nodes.find((n) => n.id === nodeId);
      if (target && (target.type === 'start' || target.type === 'end')) return;
      setNodes((ns) => {
        const next = ns.filter((n) => n.id !== nodeId);
        setEdges((es) => {
          const filteredEdges = es.filter((e) => e.source !== nodeId && e.target !== nodeId);
          notifyChange(next, filteredEdges);
          return filteredEdges;
        });
        return next;
      });
    },
    [nodes, setNodes, setEdges, notifyChange],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('nodeType') as string;
      if (!type) return;
      const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const position = { x: event.clientX - bounds.left - 70, y: event.clientY - bounds.top - 20 };
      const id = `${type}-${Date.now()}`;
      const newNode: Node = { id, type, position, data: {} };
      setNodes((ns) => {
        const next = [...ns, newNode];
        notifyChange(next, edges);
        return next;
      });
    },
    [setNodes, edges, notifyChange],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <WorkflowEditorProvider value={{ agents, updateNodeData, deleteNode }}>
      <div className="relative h-full min-h-0" onDrop={onDrop} onDragOver={onDragOver}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={(changes) => {
            onNodesChange(changes);
            // notify on position changes too
            setTimeout(() => notifyChange(nodes, edges), 0);
          }}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          className="bg-ink-950"
          colorMode={savedTheme.data === 'light' ? 'light' : 'dark'}
        >
          <Panel position="top-left">
            <NodePalette />
          </Panel>
          <Background color="#27272a" gap={20} />
          <Controls className="border-ink-700 bg-ink-900 text-ink-300" />
        </ReactFlow>
      </div>
    </WorkflowEditorProvider>
  );
}
