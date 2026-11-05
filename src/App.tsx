import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronDown,
  Circle,
  CornerDownRight,
  Diamond,
  FileImage,
  FileJson,
  Hand,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  Square,
  Spline,
  Type,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import {
  boundaryPoint,
  connectorPath,
  containsPoint,
  nodeCenter,
  resolveConnectorPoints,
  strokeWidthToSvgUnits,
} from "./diagram";
import type {
  ArrowDirection,
  ConnectorRoute,
  ConnectorType,
  Diagram,
  DiagramEdge,
  DiagramNode,
  DiagramPoint,
  FontChoice,
  NodeType,
} from "./types";

type Tool = "select" | "hand" | NodeType | "connector";
type Point = { x: number; y: number };
type Selection = { kind: "node" | "edge"; id: string } | null;
type Interaction =
  | { kind: "draw-node"; id: string; type: NodeType; origin: Point; original: Diagram }
  | {
      kind: "draw-edge";
      id: string;
      origin: Point;
      startAttachment?: { nodeId: string };
      original: Diagram;
    }
  | { kind: "move-node"; id: string; origin: Point; node: DiagramNode; original: Diagram }
  | { kind: "move-edge"; id: string; origin: Point; edge: DiagramEdge; original: Diagram }
  | { kind: "pan"; pointer: Point; center: Point };

const initialDiagram: Diagram = {
  version: 1,
  nodes: [
    {
      id: "node-start",
      type: "ellipse",
      x: 290,
      y: 310,
      width: 172,
      height: 72,
      text: "Start here",
      fill: "#eaf3ff",
      stroke: "#4b82cf",
      strokeWidth: 1.5,
      fontSize: 16,
    },
    {
      id: "node-step",
      type: "rectangle",
      x: 610,
      y: 284,
      width: 210,
      height: 124,
      text: "Add your first step",
      fill: "#ffffff",
      stroke: "#77849a",
      strokeWidth: 1.5,
      fontSize: 16,
    },
    {
      id: "node-decision",
      type: "diamond",
      x: 966,
      y: 278,
      width: 152,
      height: 136,
      text: "Ready?",
      fill: "#fff5e7",
      stroke: "#d99b42",
      strokeWidth: 1.5,
      fontSize: 16,
    },
  ],
  edges: [
    {
      id: "edge-start-step",
      type: "connector",
      start: { x: 462, y: 346 },
      end: { x: 610, y: 346 },
      stroke: "#8894a8",
      strokeWidth: 1.5,
      endArrow: true,
      route: "straight",
      startAttachment: { nodeId: "node-start" },
      endAttachment: { nodeId: "node-step" },
    },
    {
      id: "edge-step-decision",
      type: "connector",
      start: { x: 820, y: 346 },
      end: { x: 966, y: 346 },
      stroke: "#8894a8",
      strokeWidth: 1.5,
      endArrow: true,
      route: "straight",
      startAttachment: { nodeId: "node-step" },
      endAttachment: { nodeId: "node-decision" },
    },
  ],
};

const cloneDiagram = (diagram: Diagram): Diagram => JSON.parse(JSON.stringify(diagram)) as Diagram;
const makeId = () => `item-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
const isNodeType = (value: string): value is NodeType =>
  value === "rectangle" || value === "ellipse" || value === "diamond" || value === "text";
const isConnectorRoute = (value: string): value is ConnectorRoute =>
  value === "straight" || value === "elbow" || value === "curved";
const isFontChoice = (value: string): value is FontChoice =>
  value === "Inter" || value === "DM Sans" || value === "Manrope" || value === "Georgia" || value === "monospace";
const shapeTools: { id: NodeType; label: string; shortcut: string; icon: typeof Square }[] = [
  { id: "rectangle", label: "Rectangle", shortcut: "R", icon: Square },
  { id: "ellipse", label: "Ellipse", shortcut: "O", icon: Circle },
  { id: "diamond", label: "Decision", shortcut: "D", icon: Diamond },
  { id: "text", label: "Text", shortcut: "T", icon: Type },
];
const connectorTools: {
  id: ConnectorType;
  label: string;
  detail: string;
  route: ConnectorRoute;
  arrows: ArrowDirection;
  shortcut?: string;
  icon: typeof Square;
}[] = [
  { id: "arrow", label: "Arrow", detail: "Straight · arrowhead", route: "straight", arrows: "end", shortcut: "L", icon: ArrowRight },
  { id: "line", label: "Straight line", detail: "Straight · no arrowhead", route: "straight", arrows: "none", icon: Minus },
  { id: "elbow", label: "Elbow connector", detail: "Right-angle · arrowhead", route: "elbow", arrows: "end", icon: CornerDownRight },
  { id: "curved", label: "Curved connector", detail: "Smooth curve · arrowhead", route: "curved", arrows: "end", icon: Spline },
  { id: "double-arrow", label: "Double arrow", detail: "Straight · both ends", route: "straight", arrows: "both", icon: ArrowLeftRight },
];
const selectionTools: { id: "select" | "hand"; label: string; shortcut: string; icon: typeof Square }[] = [
  { id: "select", label: "Select", shortcut: "V", icon: MousePointer2 },
  { id: "hand", label: "Pan canvas", shortcut: "H", icon: Hand },
];
const pointToNode = (nodes: DiagramNode[], point: DiagramPoint) =>
  [...nodes].reverse().find((node) => containsPoint(node, point));

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isDiagram(value: unknown): value is Diagram {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Diagram>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.edges) &&
    candidate.nodes.every(
      (node) =>
        node &&
        typeof node.id === "string" &&
        ["rectangle", "ellipse", "diamond", "text"].includes(node.type) &&
        [node.x, node.y, node.width, node.height, node.fontSize, node.strokeWidth].every(Number.isFinite) &&
        node.strokeWidth >= 0.5 &&
        typeof node.text === "string" &&
        typeof node.fill === "string" &&
        typeof node.stroke === "string" &&
        (node.fontFamily === undefined || isFontChoice(node.fontFamily)) &&
        (node.fontWeight === undefined || node.fontWeight === "normal" || node.fontWeight === "bold") &&
        (node.fontStyle === undefined || node.fontStyle === "normal" || node.fontStyle === "italic") &&
        (node.textColor === undefined || typeof node.textColor === "string"),
    ) &&
    candidate.edges.every(
      (edge) =>
        edge &&
        typeof edge.id === "string" &&
        edge.type === "connector" &&
        [edge.start?.x, edge.start?.y, edge.end?.x, edge.end?.y, edge.strokeWidth].every(Number.isFinite) &&
        edge.strokeWidth >= 0.5 &&
        typeof edge.stroke === "string" &&
        (edge.route === undefined || isConnectorRoute(edge.route)) &&
        (edge.startArrow === undefined || typeof edge.startArrow === "boolean") &&
        (edge.endArrow === undefined || typeof edge.endArrow === "boolean") &&
        (edge.startAttachment === undefined || (typeof edge.startAttachment === "object" && edge.startAttachment !== null && typeof edge.startAttachment.nodeId === "string")) &&
        (edge.endAttachment === undefined || (typeof edge.endAttachment === "object" && edge.endAttachment !== null && typeof edge.endAttachment.nodeId === "string")),
    )
  );
}

function normalizeDiagram(diagram: Diagram): Diagram {
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => ({
      ...node,
      fontFamily: node.fontFamily ?? "Inter",
      fontWeight: node.fontWeight ?? "normal",
      fontStyle: node.fontStyle ?? "normal",
      textColor: node.textColor ?? "#283445",
    })),
    edges: diagram.edges.map((edge) => ({
      ...edge,
      route: edge.route ?? "straight",
      startArrow: edge.startArrow ?? false,
      endArrow: edge.endArrow ?? true,
    })),
  };
}

function App() {
  const [diagram, setDiagram] = useState<Diagram>(() => cloneDiagram(initialDiagram));
  const [tool, setTool] = useState<Tool>("select");
  const [connectorType, setConnectorType] = useState<ConnectorType>("arrow");
  const [selection, setSelection] = useState<Selection>(null);
  const [zoom, setZoom] = useState(0.9);
  const [center, setCenter] = useState<Point>({ x: 704, y: 346 });
  const [viewport, setViewport] = useState({ width: 1200, height: 760 });
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const undoRef = useRef<Diagram[]>([]);
  const redoRef = useRef<Diagram[]>([]);

  const selectedNode = selection?.kind === "node" ? diagram.nodes.find((node) => node.id === selection.id) : undefined;
  const selectedEdge = selection?.kind === "edge" ? diagram.edges.find((edge) => edge.id === selection.id) : undefined;
  const bounds = useMemo(() => {
    const width = viewport.width / zoom;
    const height = viewport.height / zoom;
    return { x: center.x - width / 2, y: center.y - height / 2, width, height };
  }, [center, viewport, zoom]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function pushHistory(snapshot: Diagram) {
    undoRef.current = [...undoRef.current.slice(-49), cloneDiagram(snapshot)];
    redoRef.current = [];
  }

  function editDiagram(update: (current: Diagram) => Diagram) {
    pushHistory(diagram);
    setDiagram(update(diagram));
    setSaved(false);
  }

  function pointerWorld(event: ReactPointerEvent<SVGSVGElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: bounds.x + ((event.clientX - rect.left) / rect.width) * bounds.width,
      y: bounds.y + ((event.clientY - rect.top) / rect.height) * bounds.height,
    };
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    const point = pointerWorld(event);
    const target = event.target instanceof Element ? event.target.closest<SVGElement>("[data-id]") : null;
    const id = target?.dataset.id;
    const targetNode = id ? diagram.nodes.find((item) => item.id === id) : undefined;
    const edge = id ? diagram.edges.find((item) => item.id === id) : undefined;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "hand" || event.button === 1) {
      interactionRef.current = { kind: "pan", pointer: { x: event.clientX, y: event.clientY }, center };
      return;
    }
    if (tool === "select") {
      if (targetNode) {
        setSelection({ kind: "node", id: targetNode.id });
        interactionRef.current = { kind: "move-node", id: targetNode.id, origin: point, node: targetNode, original: cloneDiagram(diagram) };
      } else if (edge) {
        setSelection({ kind: "edge", id: edge.id });
        interactionRef.current = {
          kind: "move-edge",
          id: edge.id,
          origin: point,
          edge: {
            ...edge,
            ...resolveConnectorPoints(diagram.nodes, edge),
            startAttachment: undefined,
            endAttachment: undefined,
          },
          original: cloneDiagram(diagram),
        };
      } else {
        setSelection(null);
      }
      return;
    }

    const original = cloneDiagram(diagram);
    const newId = makeId();
    if (tool === "connector") {
      const preset = connectorTools.find((item) => item.id === connectorType) ?? connectorTools[0];
      const startAttachment = targetNode ? { nodeId: targetNode.id } : undefined;
      const newEdge: DiagramEdge = {
        id: newId,
        type: "connector",
        start: point,
        end: point,
        stroke: "#66758b",
        strokeWidth: 1.5,
        route: preset.route,
        startArrow: preset.arrows === "both",
        endArrow: preset.arrows !== "none",
        startAttachment,
      };
      setDiagram({ ...diagram, edges: [...diagram.edges, newEdge] });
      setSelection({ kind: "edge", id: newId });
      interactionRef.current = { kind: "draw-edge", id: newId, origin: point, startAttachment, original };
      return;
    }

    const type = tool;
    const node: DiagramNode = {
      id: newId,
      type,
      x: point.x,
      y: point.y,
      width: type === "text" ? 180 : 160,
      height: type === "text" ? 52 : 96,
      text: type === "text" ? "Add a label" : type === "diamond" ? "Decision" : "New step",
      fill: type === "diamond" ? "#fff5e7" : type === "ellipse" ? "#eaf3ff" : "#ffffff",
      stroke: type === "diamond" ? "#d99b42" : type === "ellipse" ? "#4b82cf" : "#77849a",
      strokeWidth: 1.5,
      fontSize: 16,
      fontFamily: "Inter",
      fontWeight: "normal",
      fontStyle: "normal",
      textColor: "#283445",
    };
    setDiagram({ ...diagram, nodes: [...diagram.nodes, node] });
    setSelection({ kind: "node", id: newId });
    interactionRef.current = { kind: "draw-node", id: newId, type, origin: point, original };
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const interaction = interactionRef.current;
    if (!interaction) return;
    if (interaction.kind === "pan") {
      setCenter({
        x: interaction.center.x - (event.clientX - interaction.pointer.x) / zoom,
        y: interaction.center.y - (event.clientY - interaction.pointer.y) / zoom,
      });
      return;
    }

    const point = pointerWorld(event);
    const dx = point.x - interaction.origin.x;
    const dy = point.y - interaction.origin.y;
    if (interaction.kind === "draw-node") {
      const x = Math.min(point.x, interaction.origin.x);
      const y = Math.min(point.y, interaction.origin.y);
      const width = Math.max(24, Math.abs(dx));
      const height = Math.max(24, Math.abs(dy));
      setDiagram((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === interaction.id
            ? {
                ...node,
                x: interaction.type === "text" ? interaction.origin.x : x,
                y: interaction.type === "text" ? interaction.origin.y : y,
                width: interaction.type === "text" ? Math.max(120, width) : width,
                height: interaction.type === "text" ? 52 : height,
              }
            : node,
        ),
      }));
    } else if (interaction.kind === "draw-edge") {
      const targetNode = pointToNode(diagram.nodes, point);
      const endAttachment =
        targetNode && targetNode.id !== interaction.startAttachment?.nodeId
          ? { nodeId: targetNode.id }
          : undefined;
      const startNode = interaction.startAttachment
        ? diagram.nodes.find((node) => node.id === interaction.startAttachment?.nodeId)
        : undefined;
      const end = endAttachment && targetNode
        ? boundaryPoint(targetNode, startNode ? nodeCenter(startNode) : interaction.origin)
        : point;
      const start = startNode ? boundaryPoint(startNode, end) : interaction.origin;
      setDiagram((current) => ({
        ...current,
        edges: current.edges.map((edge) =>
          edge.id === interaction.id ? { ...edge, start, end, endAttachment } : edge,
        ),
      }));
    } else if (interaction.kind === "move-node") {
      if (Math.hypot(dx, dy) < 2) return;
      setDiagram((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === interaction.id
            ? { ...node, x: interaction.node.x + dx, y: interaction.node.y + dy }
            : node,
        ),
      }));
    } else if (interaction.kind === "move-edge") {
      if (Math.hypot(dx, dy) < 2) return;
      setDiagram((current) => ({
        ...current,
        edges: current.edges.map((edge) =>
          edge.id === interaction.id
            ? {
                ...edge,
                start: { x: interaction.edge.start.x + dx, y: interaction.edge.start.y + dy },
                end: { x: interaction.edge.end.x + dx, y: interaction.edge.end.y + dy },
                startAttachment: undefined,
                endAttachment: undefined,
              }
            : edge,
        ),
      }));
    }
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const interaction = interactionRef.current;
    if (!interaction) return;
    if (interaction.kind === "draw-edge") {
      const releasePoint = pointerWorld(event);
      const clickedWithoutDragging =
        Math.hypot(releasePoint.x - interaction.origin.x, releasePoint.y - interaction.origin.y) < 8;
      const targetNode = clickedWithoutDragging ? undefined : pointToNode(diagram.nodes, releasePoint);
      const endAttachment =
        targetNode && targetNode.id !== interaction.startAttachment?.nodeId
          ? { nodeId: targetNode.id }
          : undefined;
      const startNode = interaction.startAttachment
        ? diagram.nodes.find((node) => node.id === interaction.startAttachment?.nodeId)
        : undefined;
      const end = clickedWithoutDragging
        ? { x: interaction.origin.x + 140, y: interaction.origin.y }
        : endAttachment && targetNode
          ? boundaryPoint(targetNode, startNode ? nodeCenter(startNode) : interaction.origin)
          : releasePoint;
      const start = startNode ? boundaryPoint(startNode, end) : interaction.origin;
      setDiagram((current) => ({
        ...current,
        edges: current.edges.map((edge) =>
          edge.id === interaction.id ? { ...edge, start, end, endAttachment } : edge,
        ),
      }));
    }
    const changed =
      interaction.kind === "draw-node" ||
      interaction.kind === "draw-edge" ||
      ((interaction.kind === "move-node" || interaction.kind === "move-edge") &&
        Math.hypot(pointerWorld(event).x - interaction.origin.x, pointerWorld(event).y - interaction.origin.y) >= 2);
    if (changed) {
      undoRef.current = [...undoRef.current.slice(-49), interaction.original];
      redoRef.current = [];
      setSaved(false);
    }
    if (interaction.kind === "draw-node" || interaction.kind === "draw-edge") {
      setTool("select");
    }
    interactionRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function undo() {
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current = [...redoRef.current, cloneDiagram(diagram)];
    setDiagram(previous);
    setSaved(false);
  }

  function redo() {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current = [...undoRef.current, cloneDiagram(diagram)];
    setDiagram(next);
    setSaved(false);
  }

  function deleteSelection() {
    if (!selection) return;
    editDiagram((current) => ({
      ...current,
      nodes: selection.kind === "node" ? current.nodes.filter((node) => node.id !== selection.id) : current.nodes,
      edges: selection.kind === "edge" ? current.edges.filter((edge) => edge.id !== selection.id) : current.edges,
    }));
    setSelection(null);
  }

  function updateSelectedNode(patch: Partial<DiagramNode>) {
    if (!selectedNode) return;
    editDiagram((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === selectedNode.id ? { ...node, ...patch } : node)),
    }));
  }

  function updateSelectedEdge(patch: Partial<DiagramEdge>) {
    if (!selectedEdge) return;
    editDiagram((current) => ({
      ...current,
      edges: current.edges.map((edge) => (edge.id === selectedEdge.id ? { ...edge, ...patch } : edge)),
    }));
  }

  function duplicateSelection() {
    if (!selection) return;
    if (selection.kind === "node" && selectedNode) {
      const copy = { ...selectedNode, id: makeId(), x: selectedNode.x + 28, y: selectedNode.y + 28 };
      editDiagram((current) => ({ ...current, nodes: [...current.nodes, copy] }));
      setSelection({ kind: "node", id: copy.id });
    } else if (selection.kind === "edge" && selectedEdge) {
      const points = resolveConnectorPoints(diagram.nodes, selectedEdge);
      const copy = {
        ...selectedEdge,
        id: makeId(),
        start: { x: points.start.x + 24, y: points.start.y + 24 },
        end: { x: points.end.x + 24, y: points.end.y + 24 },
        startAttachment: undefined,
        endAttachment: undefined,
      };
      editDiagram((current) => ({ ...current, edges: [...current.edges, copy] }));
      setSelection({ kind: "edge", id: copy.id });
    }
  }

  function saveDiagram() {
    downloadFile("diagram-studio.json", JSON.stringify(diagram, null, 2), "application/json");
    setSaved(true);
    setNotice("Diagram saved as JSON");
  }

  function exportSvg() {
    const svg = svgRef.current;
    if (!svg) return;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", "1600");
    copy.setAttribute("height", "1000");
    copy.setAttribute("viewBox", "0 0 1600 1000");
    copy.querySelectorAll(".selection-outline").forEach((item) => item.remove());
    const source = new XMLSerializer().serializeToString(copy);
    downloadFile("diagram-studio.svg", source, "image/svg+xml");
    setNotice("Diagram exported as SVG");
  }

  async function loadDiagram(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isDiagram(parsed)) throw new Error("This file is not a supported Diagram Studio document.");
      pushHistory(diagram);
      setDiagram(normalizeDiagram(parsed));
      setSelection(null);
      setSaved(true);
      setNotice("Diagram opened");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not open this diagram.");
    } finally {
      event.target.value = "";
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if ((event.ctrlKey || event.metaKey) && key === "y") {
        event.preventDefault();
        redo();
      } else if ((event.ctrlKey || event.metaKey) && key === "d") {
        event.preventDefault();
        duplicateSelection();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selection) {
        event.preventDefault();
        deleteSelection();
      } else if (event.key === "Escape") {
        setSelection(null);
        setTool("select");
      } else {
        const matched = selectionTools.find((item) => item.shortcut.toLowerCase() === key);
        if (matched) setTool(matched.id);
        const matchedShape = shapeTools.find((item) => item.shortcut.toLowerCase() === key);
        if (matchedShape) setTool(matchedShape.id);
        const matchedConnector = connectorTools.find((item) => item.shortcut?.toLowerCase() === key);
        if (matchedConnector) {
          setConnectorType(matchedConnector.id);
          setTool("connector");
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function renderNode(node: DiagramNode) {
    const selected = selection?.kind === "node" && selection.id === node.id;
    const textLines = node.text.split("\n");
    const text = (
      <text
        x={node.x + node.width / 2}
        y={node.y + node.height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily={
          node.fontFamily === "monospace"
            ? "ui-monospace, SFMono-Regular, Consolas, monospace"
            : node.fontFamily === "Georgia"
              ? "Georgia, serif"
              : node.fontFamily === "Manrope"
                ? "'Manrope Variable', 'Trebuchet MS', sans-serif"
                : node.fontFamily === "DM Sans"
                    ? "'DM Sans Variable', 'Segoe UI', sans-serif"
                    : "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif"
        }
        fontSize={node.fontSize}
        fontWeight={node.fontWeight === "bold" ? 700 : 500}
        fontStyle={node.fontStyle ?? "normal"}
        fill={node.textColor ?? "#283445"}
        pointerEvents="none"
      >
        {textLines.map((line, index) => (
          <tspan key={`${node.id}-${index}`} x={node.x + node.width / 2} dy={index === 0 ? `${-(textLines.length - 1) * 0.62}em` : "1.24em"}>
            {line}
          </tspan>
        ))}
      </text>
    );

    return (
      <g key={node.id} data-id={node.id}>
        {node.type === "ellipse" ? (
          <ellipse
            cx={node.x + node.width / 2}
            cy={node.y + node.height / 2}
            rx={node.width / 2}
            ry={node.height / 2}
            fill={node.fill}
            stroke={selected ? "#356fd3" : node.stroke}
            strokeWidth={strokeWidthToSvgUnits(node.strokeWidth + (selected ? 0.75 : 0))}
            vectorEffect="non-scaling-stroke"
          />
        ) : node.type === "diamond" ? (
          <polygon
            points={`${node.x + node.width / 2},${node.y} ${node.x + node.width},${node.y + node.height / 2} ${node.x + node.width / 2},${node.y + node.height} ${node.x},${node.y + node.height / 2}`}
            fill={node.fill}
            stroke={selected ? "#356fd3" : node.stroke}
            strokeWidth={strokeWidthToSvgUnits(node.strokeWidth + (selected ? 0.75 : 0))}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : node.type === "text" ? (
          <rect x={node.x} y={node.y} width={node.width} height={node.height} fill="transparent" />
        ) : (
          <rect
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            rx={10}
            fill={node.fill}
            stroke={selected ? "#356fd3" : node.stroke}
            strokeWidth={strokeWidthToSvgUnits(node.strokeWidth + (selected ? 0.75 : 0))}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {text}
        {selected && (
          <rect
            className="selection-outline"
            x={node.x - 5}
            y={node.y - 5}
            width={node.width + 10}
            height={node.height + 10}
            rx={node.type === "ellipse" ? (node.width + 10) / 2 : 5}
            fill="none"
            stroke="#3478e5"
            strokeDasharray="4 4"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
      </g>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><span /><span /><span /></div>
          <div className="brand-copy"><strong>Diagram</strong><span>STUDIO</span></div>
        </div>
        <div className="document-title">
          <strong>Untitled diagram</strong>
          <span className={saved ? "save-status" : "save-status unsaved"}><i />{saved ? "All changes saved" : "Unsaved changes"}</span>
        </div>
        <div className="top-actions">
          <button className="icon-button" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo}><Undo2 size={17} /></button>
          <button className="icon-button" title="Redo (Ctrl+Y)" aria-label="Redo" onClick={redo}><Redo2 size={17} /></button>
          <span className="top-divider" />
          <button className="secondary-button" onClick={() => fileInputRef.current?.click()}><Upload size={15} /> Open</button>
          <button className="primary-button" onClick={saveDiagram}><ArrowDownToLine size={15} /> Save diagram</button>
          <input ref={fileInputRef} className="visually-hidden" type="file" accept=".json,application/json" onChange={loadDiagram} />
        </div>
      </header>

      <div className="workspace">
        <aside className="tool-rail" aria-label="Diagram tools">
          <div className="tool-section-label">CANVAS TOOLS</div>
          <div className="tool-list">
            {selectionTools.map(({ id, label, shortcut, icon: Icon }) => (
              <button
                key={id}
                className={`tool-button ${tool === id ? "active" : ""}`}
                title={`${label} · ${shortcut}`}
                aria-label={label}
                aria-pressed={tool === id}
                onClick={() => setTool(id)}
              >
                <Icon size={18} strokeWidth={1.8} /><span>{label}</span><kbd>{shortcut}</kbd>
              </button>
            ))}
          </div>
          <details className="tool-group" open>
            <summary><span>SHAPES</span><ChevronDown size={14} /></summary>
            <div className="tool-list">
              {shapeTools.map(({ id, label, shortcut, icon: Icon }) => (
                <button
                  key={id}
                  className={`tool-button ${tool === id ? "active" : ""}`}
                  title={`${label} · ${shortcut}`}
                  aria-label={label}
                  aria-pressed={tool === id}
                  onClick={() => setTool(id)}
                >
                  <Icon size={18} strokeWidth={1.8} /><span>{label}</span><kbd>{shortcut}</kbd>
                </button>
              ))}
            </div>
          </details>
          <details className="tool-group" open>
            <summary><span>CONNECTORS</span><ChevronDown size={14} /></summary>
            <div className="tool-list">
              {connectorTools.map(({ id, label, detail, shortcut, icon: Icon }) => (
                <button
                  key={id}
                  className={`tool-button connector-tool ${tool === "connector" && connectorType === id ? "active" : ""}`}
                  title={`${label}: drag from one shape to another to attach${shortcut ? ` · ${shortcut}` : ""}`}
                  aria-pressed={tool === "connector" && connectorType === id}
                  onClick={() => {
                    setConnectorType(id);
                    setTool("connector");
                  }}
                >
                  <Icon size={17} strokeWidth={1.8} /><span><strong>{label}</strong><small>{detail}</small></span>{shortcut && <kbd>{shortcut}</kbd>}
                </button>
              ))}
            </div>
          </details>
          <div className="rail-divider" />
          <div className="tool-section-label">ACTIONS</div>
          <button className="tool-button compact" title="Delete selected item" onClick={deleteSelection} disabled={!selection}>
            <X size={17} /><span>Delete</span><kbd>⌫</kbd>
          </button>
          <button className="tool-button compact" title="Duplicate selected item" onClick={duplicateSelection} disabled={!selection}>
            <FileJson size={17} /><span>Duplicate</span><kbd>⌘D</kbd>
          </button>
          <div className="rail-bottom">
            <div className="theme-chip"><span /><div><strong>Studio</strong><small>Professional theme</small></div><Check size={14} /></div>
          </div>
        </aside>

        <section className="editor-area">
          <div className="canvas-toolbar">
            <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>Untitled diagram</strong></div>
            <div className="canvas-actions">
              <span className="canvas-hint">
                {tool === "select"
                  ? "Drag to select and move"
                  : tool === "hand"
                    ? "Drag to move canvas"
                    : tool === "connector"
                      ? "Drag from one shape to another to connect them"
                      : `Click and drag to draw ${tool}`}
              </span>
              <span className="canvas-action-divider" />
              <button className="icon-button small" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.45, value - 0.1))}><Minus size={15} /></button>
              <button className="zoom-value" onClick={() => { setZoom(0.9); setCenter({ x: 704, y: 346 }); }}>{Math.round(zoom * 100)}%</button>
              <button className="icon-button small" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.8, value + 0.1))}><Plus size={15} /></button>
              <span className="canvas-action-divider" />
              <button className="icon-button small" title="Export SVG" aria-label="Export SVG" onClick={exportSvg}><FileImage size={16} /></button>
            </div>
          </div>

          <div className={`canvas-wrap ${tool !== "select" ? "drawing-mode" : ""} ${tool === "hand" ? "panning-mode" : ""}`}>
            <svg
              ref={svgRef}
              className="diagram-canvas"
              viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
              preserveAspectRatio="none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <defs>
                <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="#dfe4eb" />
                </pattern>
              </defs>
              <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill="#fbfcfd" />
              <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill="url(#grid)" />
              {diagram.edges.map((edge) => {
                const selected = selection?.kind === "edge" && selection.id === edge.id;
                const points = resolveConnectorPoints(diagram.nodes, edge);
                const route = edge.route ?? "straight";
                const strokeWidth = strokeWidthToSvgUnits(edge.strokeWidth + (selected ? 0.75 : 0));
                return (
                  <g key={edge.id} data-id={edge.id}>
                    <defs>
                      <marker
                        id={`arrow-end-${edge.id}`}
                        markerWidth="8"
                        markerHeight="8"
                        refX="7"
                        refY="4"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <path d="M0 0 L8 4 L0 8 Z" fill={selected ? "#3478e5" : edge.stroke} />
                      </marker>
                      <marker
                        id={`arrow-start-${edge.id}`}
                        markerWidth="8"
                        markerHeight="8"
                        refX="1"
                        refY="4"
                        orient="auto"
                        markerUnits="strokeWidth"
                      >
                        <path d="M8 0 L0 4 L8 8 Z" fill={selected ? "#3478e5" : edge.stroke} />
                      </marker>
                    </defs>
                    <path
                      d={connectorPath(points.start, points.end, route)}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={Math.max(14, strokeWidth + 8)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={connectorPath(points.start, points.end, route)}
                      fill="none"
                      stroke={selected ? "#3478e5" : edge.stroke}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      markerStart={edge.startArrow ? `url(#arrow-start-${edge.id})` : undefined}
                      markerEnd={edge.endArrow === false ? undefined : `url(#arrow-end-${edge.id})`}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}
              {diagram.nodes.map(renderNode)}
            </svg>
            <div className="canvas-coordinates"><span className="coordinate-dot" /> Infinite canvas <span>·</span> {diagram.nodes.length} shapes</div>
            <div className="canvas-nudge">
              <MousePointer2 size={13} />
              {tool === "connector" ? "Drag from one shape to another to attach" : "Select an item to edit its properties"}
            </div>
          </div>
          <footer className="statusbar">
            <span><span className="status-dot" /> Ready</span><span>{diagram.nodes.length} shapes</span><span>{diagram.edges.length} connectors</span>
            <span className="status-spacer" /><button onClick={exportSvg}><FileImage size={13} /> Export as SVG</button><button onClick={saveDiagram}><FileJson size={13} /> Save JSON</button>
          </footer>
        </section>

        <aside className="inspector">
          <div className="inspector-heading"><div><span className="eyebrow">CANVAS</span><h2>{selectedNode || selectedEdge ? "Properties" : "Welcome"}</h2></div><button className="icon-button small" title="Canvas options" aria-label="Canvas options"><Plus size={15} /></button></div>
          {selectedNode ? (
            <div className="inspector-content">
              <section className="property-section">
                <span className="section-title">SHAPE</span>
                <div className="field-label">Label</div>
                <textarea value={selectedNode.text} rows={2} onChange={(event) => updateSelectedNode({ text: event.target.value })} />
                <div className="field-label spaced">Shape type</div>
                <select
                  className="shape-kind"
                  aria-label="Shape type"
                  value={selectedNode.type}
                  onChange={(event) => {
                    if (isNodeType(event.target.value)) updateSelectedNode({ type: event.target.value });
                  }}
                >
                  <option value="rectangle">Rectangle</option>
                  <option value="ellipse">Ellipse</option>
                  <option value="diamond">Decision</option>
                  <option value="text">Text</option>
                </select>
              </section>
              <section className="property-section">
                <span className="section-title">APPEARANCE</span>
                <div className="color-row"><div><span className="field-label">Fill</span><small>Interior color</small></div><label className="color-swatch"><input type="color" value={selectedNode.fill} onChange={(event) => updateSelectedNode({ fill: event.target.value })} /><span style={{ backgroundColor: selectedNode.fill }} /></label></div>
                <div className="color-row"><div><span className="field-label">Border</span><small>Outline color</small></div><label className="color-swatch"><input type="color" value={selectedNode.stroke} onChange={(event) => updateSelectedNode({ stroke: event.target.value })} /><span style={{ backgroundColor: selectedNode.stroke }} /></label></div>
                <div className="field-row"><label htmlFor="stroke-width">Border weight</label><div className="number-control"><input id="stroke-width" type="number" min="0.5" max="12" step="0.5" value={selectedNode.strokeWidth} onChange={(event) => updateSelectedNode({ strokeWidth: Math.max(0.5, Number(event.target.value) || 0.5) })} /><span>pt</span></div></div>
                <div className="field-row"><label htmlFor="font-size">Font size</label><div className="number-control"><input id="font-size" type="number" min="10" max="36" value={selectedNode.fontSize} onChange={(event) => updateSelectedNode({ fontSize: Number(event.target.value) || 16 })} /><span>px</span></div></div>
              </section>
              <section className="property-section">
                <span className="section-title">TYPOGRAPHY</span>
                <label className="field-label" htmlFor="font-family">Font family</label>
                <select
                  className="shape-kind"
                  id="font-family"
                  value={selectedNode.fontFamily ?? "Inter"}
                  onChange={(event) => {
                    if (isFontChoice(event.target.value)) updateSelectedNode({ fontFamily: event.target.value });
                  }}
                >
                  <option value="Inter">Inter · Clean</option>
                  <option value="DM Sans">DM Sans · Modern</option>
                  <option value="Manrope">Manrope · Geometric</option>
                  <option value="Georgia">Georgia · Serif</option>
                  <option value="monospace">Monospace · Technical</option>
                </select>
                <div className="color-row"><div><span className="field-label">Text color</span><small>Label color</small></div><label className="color-swatch"><input type="color" value={selectedNode.textColor ?? "#283445"} onChange={(event) => updateSelectedNode({ textColor: event.target.value })} /><span style={{ backgroundColor: selectedNode.textColor ?? "#283445" }} /></label></div>
                <div className="text-style-buttons">
                  <button
                    className={selectedNode.fontWeight === "bold" ? "selected" : ""}
                    title="Toggle bold"
                    aria-label="Toggle bold"
                    aria-pressed={selectedNode.fontWeight === "bold"}
                    onClick={() => updateSelectedNode({ fontWeight: selectedNode.fontWeight === "bold" ? "normal" : "bold" })}
                  >B</button>
                  <button
                    className={selectedNode.fontStyle === "italic" ? "selected" : ""}
                    title="Toggle italic"
                    aria-label="Toggle italic"
                    aria-pressed={selectedNode.fontStyle === "italic"}
                    onClick={() => updateSelectedNode({ fontStyle: selectedNode.fontStyle === "italic" ? "normal" : "italic" })}
                  ><i>I</i></button>
                </div>
              </section>
              <section className="property-section position-section">
                <span className="section-title">POSITION & SIZE</span>
                <div className="dimension-grid">
                  <label>X <input type="number" value={Math.round(selectedNode.x)} onChange={(event) => updateSelectedNode({ x: Number(event.target.value) })} /></label>
                  <label>Y <input type="number" value={Math.round(selectedNode.y)} onChange={(event) => updateSelectedNode({ y: Number(event.target.value) })} /></label>
                  <label>W <input type="number" min="24" value={Math.round(selectedNode.width)} onChange={(event) => updateSelectedNode({ width: Math.max(24, Number(event.target.value)) })} /></label>
                  <label>H <input type="number" min="24" value={Math.round(selectedNode.height)} onChange={(event) => updateSelectedNode({ height: Math.max(24, Number(event.target.value)) })} /></label>
                </div>
              </section>
              <button className="delete-property" onClick={deleteSelection}><X size={14} /> Delete shape <kbd>⌫</kbd></button>
            </div>
          ) : selectedEdge ? (
            <div className="inspector-content">
              <section className="property-section">
                <span className="section-title">CONNECTOR</span>
                <label className="field-label" htmlFor="connector-route">Connector style</label>
                <select
                  className="shape-kind"
                  id="connector-route"
                  value={selectedEdge.route ?? "straight"}
                  onChange={(event) => {
                    if (isConnectorRoute(event.target.value)) updateSelectedEdge({ route: event.target.value });
                  }}
                >
                  <option value="straight">Straight</option>
                  <option value="elbow">Elbow · right angle</option>
                  <option value="curved">Curved · smooth</option>
                </select>
                <div className="field-row">
                  <label htmlFor="arrow-style">Arrowheads</label>
                  <select
                    className="shape-kind arrow-style-select"
                    id="arrow-style"
                    value={selectedEdge.startArrow && selectedEdge.endArrow ? "both" : selectedEdge.endArrow === false ? "none" : "end"}
                    onChange={(event) => {
                      if (event.target.value === "none" || event.target.value === "end" || event.target.value === "both") {
                        updateSelectedEdge({ startArrow: event.target.value === "both", endArrow: event.target.value !== "none" });
                      }
                    }}
                  >
                    <option value="none">None</option>
                    <option value="end">End</option>
                    <option value="both">Both ends</option>
                  </select>
                </div>
                <div className="color-row"><div><span className="field-label">Line color</span><small>Connector stroke</small></div><label className="color-swatch"><input type="color" value={selectedEdge.stroke} onChange={(event) => updateSelectedEdge({ stroke: event.target.value })} /><span style={{ backgroundColor: selectedEdge.stroke }} /></label></div>
                <div className="field-row"><label htmlFor="line-width">Line weight</label><div className="number-control"><input id="line-width" type="number" min="0.5" max="12" step="0.5" value={selectedEdge.strokeWidth} onChange={(event) => updateSelectedEdge({ strokeWidth: Math.max(0.5, Number(event.target.value) || 0.5) })} /><span>pt</span></div></div>
              </section>
              <button className="delete-property" onClick={deleteSelection}><X size={14} /> Delete connector <kbd>⌫</kbd></button>
            </div>
          ) : (
            <div className="welcome-panel">
              <div className="welcome-art"><div className="art-shape art-one" /><div className="art-line" /><div className="art-shape art-two" /><div className="art-shape art-three" /></div>
              <h3>A clearer way to think</h3>
              <p>Bring ideas to life with a clean, considered canvas. Every great diagram starts with one simple shape.</p>
              <button className="welcome-cta" onClick={() => setTool("rectangle")}><Plus size={15} /> Add your first shape</button>
              <div className="quick-tips"><span className="section-title">QUICK TIPS</span><p><kbd>V</kbd> Select & move items</p><p><kbd>R</kbd> Draw a rectangle</p><p><kbd>L</kbd> Connect shapes</p><p><kbd>⌘</kbd><kbd>D</kbd> Duplicate selection</p><p><kbd>⌫</kbd> Delete selection</p></div>
            </div>
          )}
          <div className="inspector-bottom"><span className="keyboard-icon">⌘</span><span>Shortcuts help</span><kbd>?</kbd></div>
        </aside>
      </div>
      {notice && <div className="toast"><Check size={15} />{notice}<button onClick={() => setNotice("")}><X size={14} /></button></div>}
    </main>
  );
}

export default App;
