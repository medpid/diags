export type NodeType = "rectangle" | "ellipse" | "diamond" | "text";
export type ConnectorRoute = "straight" | "elbow" | "curved";
export type ArrowDirection = "none" | "end" | "both";
export type ConnectorType = "arrow" | "line" | "elbow" | "curved" | "double-arrow";
export type FontChoice = "Inter" | "DM Sans" | "Manrope" | "Georgia" | "monospace";

export interface DiagramPoint {
  x: number;
  y: number;
}

export interface NodeAttachment {
  nodeId: string;
}

export interface DiagramNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  fontSize: number;
  fontFamily?: FontChoice;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textColor?: string;
}

export interface DiagramEdge {
  id: string;
  type: "connector";
  start: DiagramPoint;
  end: DiagramPoint;
  stroke: string;
  strokeWidth: number;
  route?: ConnectorRoute;
  startArrow?: boolean;
  endArrow?: boolean;
  startAttachment?: NodeAttachment;
  endAttachment?: NodeAttachment;
}

export interface Diagram {
  version: 1;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}
