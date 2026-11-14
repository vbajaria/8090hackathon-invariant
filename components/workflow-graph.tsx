"use client";
import { useMemo } from "react";
import { Background, Controls, Handle, Position, ReactFlow, type Node, type NodeProps } from "@xyflow/react";
import type { Run, Status } from "@/lib/types";
import { useTheme } from "@/components/theme-provider";
import "@xyflow/react/dist/style.css";

type StateNode = Node<{ label: string; status: Status; track: string }>;
function State({ data }: NodeProps<StateNode>) {
  const color = data.status === "completed" ? "var(--graph-success)" : data.status === "failed" ? "var(--danger)" : data.status === "running" ? "var(--graph-running)" : "var(--muted)";
  return <div className="graph-state" style={{ borderColor: color }}><Handle type="target" position={Position.Top} /><span style={{ color }}>{data.track} · {data.status.replaceAll("_", " ")}</span><strong>{data.label}</strong><Handle type="source" position={Position.Bottom} /></div>;
}
const nodeTypes = { state: State };
export function WorkflowGraph({ run }: { run: Run }) {
  const { theme } = useTheme();
  const { nodes, edges } = useMemo(() => {
    const nodes: StateNode[] = [], edges: { id: string; source: string; target: string; animated?: boolean; style: { stroke: string } }[] = [];
    ([run.factorySteps, run.oracleSteps] as const).forEach((steps, track) => steps.forEach((s, i) => {
      nodes.push({ id: s.id, type: "state", data: { label: s.label, status: s.status, track: track ? "INVARIANT" : "8090" }, position: { x: track * 320, y: i * 100 } });
      if (i) edges.push({ id: `${track}-${i}`, source: steps[i - 1].id, target: s.id, animated: s.status === "running", style: { stroke: track ? "var(--graph-oracle)" : "var(--graph-factory)" } });
    }));
    nodes.push({ id: "report", type: "state", position: { x: 160, y: 740 }, data: { label: run.evidence?.verdict || "Independent evidence report", status: run.evidence ? "completed" : "pending", track: "CONVERGENCE" } });
    for (const track of [run.factorySteps, run.oracleSteps]) if (track.length) edges.push({ id: `${track.at(-1)!.id}-report`, source: track.at(-1)!.id, target: "report", style: { stroke: "var(--graph-success)" } });
    return { nodes, edges };
  }, [run.factorySteps, run.oracleSteps, run.evidence]);
  return <details className="panel workflow-graph"><summary>Explore the live verification graph <span>Actual recorded states · read-only</span></summary><div className="graph-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} nodesDraggable={false} nodesConnectable={false} fitView colorMode={theme} minZoom={0.3} maxZoom={1.5}><Background color="var(--graph-grid)" gap={18} /><Controls showInteractive={false} /></ReactFlow></div></details>;
}
