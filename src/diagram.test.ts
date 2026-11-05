import assert from "node:assert/strict";
import test from "node:test";
import { boundaryPoint, connectorPath, containsPoint, resolveConnectorPoints, strokeWidthToSvgUnits } from "./diagram.ts";
import type { DiagramEdge, DiagramNode } from "./types.ts";

function createNode(id: string, type: DiagramNode["type"], x: number, y: number): DiagramNode {
  return {
    id,
    type,
    x,
    y,
    width: 100,
    height: 60,
    text: id,
    fill: "#fff",
    stroke: "#000",
    strokeWidth: 1.5,
    fontSize: 16,
  };
}

function createEdge(startAttachment: string, endAttachment: string): DiagramEdge {
  return {
    id: "edge",
    type: "connector",
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
    startAttachment: { nodeId: startAttachment },
    endAttachment: { nodeId: endAttachment },
    stroke: "#000",
    strokeWidth: 1.5,
  };
}

test("connects rectangle boundaries and follows shapes after they move", () => {
  const left = createNode("left", "rectangle", 0, 0);
  const right = createNode("right", "rectangle", 200, 0);
  const edge = createEdge(left.id, right.id);

  assert.deepEqual(resolveConnectorPoints([left, right], edge), {
    start: { x: 100, y: 30 },
    end: { x: 200, y: 30 },
  });

  right.x = 280;
  assert.deepEqual(resolveConnectorPoints([left, right], edge), {
    start: { x: 100, y: 30 },
    end: { x: 280, y: 30 },
  });
});

test("snaps connectors to ellipse and diamond outlines", () => {
  assert.deepEqual(
    boundaryPoint(createNode("ellipse", "ellipse", 0, 0), { x: 200, y: 30 }),
    { x: 100, y: 30 },
  );
  assert.deepEqual(
    boundaryPoint(createNode("diamond", "diamond", 0, 0), { x: 200, y: 30 }),
    { x: 100, y: 30 },
  );
  assert.equal(containsPoint(createNode("diamond", "diamond", 0, 0), { x: 50, y: 30 }), true);
  assert.equal(containsPoint(createNode("diamond", "diamond", 0, 0), { x: 5, y: 5 }), false);
});

test("creates separate straight, elbow and curved connector paths", () => {
  const start = { x: 10, y: 20 };
  const end = { x: 110, y: 80 };

  assert.equal(connectorPath(start, end, "straight"), "M 10 20 L 110 80");
  assert.equal(connectorPath(start, end, "elbow"), "M 10 20 L 60 20 L 60 80 L 110 80");
  assert.equal(connectorPath(start, end, "curved"), "M 10 20 C 60 20, 60 80, 110 80");
});

test("converts half-point and point strokes to SVG pixel widths", () => {
  assert.equal(strokeWidthToSvgUnits(0.5), 2 / 3);
  assert.equal(strokeWidthToSvgUnits(1.5), 2);
});

test("leaves unconnected legacy connectors at their saved endpoints", () => {
  const edge = { ...createEdge("left", "right"), startAttachment: undefined, endAttachment: undefined };
  edge.start = { x: 5, y: 8 };
  edge.end = { x: 20, y: 26 };

  assert.deepEqual(resolveConnectorPoints([], edge), { start: edge.start, end: edge.end });
});
