import type { ConnectorRoute, DiagramEdge, DiagramNode, DiagramPoint } from "./types.ts";

export function strokeWidthToSvgUnits(widthInPoints: number): number {
  return widthInPoints * (4 / 3);
}

export function containsPoint(node: DiagramNode, point: DiagramPoint): boolean {
  const centerX = node.x + node.width / 2;
  const centerY = node.y + node.height / 2;
  const dx = Math.abs(point.x - centerX);
  const dy = Math.abs(point.y - centerY);

  if (node.type === "ellipse") {
    return (dx / (node.width / 2)) ** 2 + (dy / (node.height / 2)) ** 2 <= 1;
  }
  if (node.type === "diamond") {
    return dx / (node.width / 2) + dy / (node.height / 2) <= 1;
  }
  return dx <= node.width / 2 && dy <= node.height / 2;
}

export function boundaryPoint(node: DiagramNode, toward: DiagramPoint): DiagramPoint {
  const center = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;

  if (dx === 0 && dy === 0) return { x: center.x + node.width / 2, y: center.y };

  let scale: number;
  if (node.type === "ellipse") {
    const denominator = (dx / (node.width / 2)) ** 2 + (dy / (node.height / 2)) ** 2;
    scale = 1 / Math.sqrt(denominator);
  } else if (node.type === "diamond") {
    scale = 1 / (Math.abs(dx) / (node.width / 2) + Math.abs(dy) / (node.height / 2));
  } else {
    scale = Math.min(
      dx === 0 ? Number.POSITIVE_INFINITY : node.width / 2 / Math.abs(dx),
      dy === 0 ? Number.POSITIVE_INFINITY : node.height / 2 / Math.abs(dy),
    );
  }

  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

export function resolveConnectorPoints(
  nodes: DiagramNode[],
  edge: DiagramEdge,
): { start: DiagramPoint; end: DiagramPoint } {
  const startNode = edge.startAttachment
    ? nodes.find((node) => node.id === edge.startAttachment?.nodeId)
    : undefined;
  const endNode = edge.endAttachment
    ? nodes.find((node) => node.id === edge.endAttachment?.nodeId)
    : undefined;
  if (!startNode && !endNode) return { start: edge.start, end: edge.end };

  let start = edge.start;
  let end = edge.end;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (startNode) start = boundaryPoint(startNode, endNode ? nodeCenter(endNode) : end);
    if (endNode) end = boundaryPoint(endNode, startNode ? nodeCenter(startNode) : start);
  }
  return { start, end };
}

export function nodeCenter(node: DiagramNode): DiagramPoint {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

export function connectorPath(
  start: DiagramPoint,
  end: DiagramPoint,
  route: ConnectorRoute = "straight",
): string {
  if (route === "elbow") {
    const middleX = (start.x + end.x) / 2;
    return `M ${start.x} ${start.y} L ${middleX} ${start.y} L ${middleX} ${end.y} L ${end.x} ${end.y}`;
  }
  if (route === "curved") {
    const middleX = (start.x + end.x) / 2;
    return `M ${start.x} ${start.y} C ${middleX} ${start.y}, ${middleX} ${end.y}, ${end.x} ${end.y}`;
  }
  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
}
