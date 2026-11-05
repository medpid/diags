# Diagram Studio

Diagram Studio is a cross-platform desktop diagram editor built with React and TypeScript, Vite, and a small Tauri/Rust application shell. Its first milestone focuses on a crisp, single-theme workspace and the essentials for making and sharing flow diagrams.

## Requirements

- Node.js 20 or newer and npm
- Rust stable and the platform prerequisites listed in the [Tauri setup guide](https://tauri.app/start/prerequisites/)

## Development

```sh
npm install
npm run dev
```

Run the desktop application with `npm run tauri dev`. Build the frontend with `npm run build`, or package desktop installers with `npm run tauri build`.
Run the diagram geometry tests with `npm test`.

## Editor essentials

- Draw and move rectangles, ellipses, diamonds, and text labels; connect shapes by dragging from one shape to another.
- Choose straight-arrow, straight-line, elbow, curved, or double-arrow connectors from the collapsible tool sections.
- Style connectors and shapes with half-point border weights, polished fonts, color, and bold or italic labels.
- Undo, redo, duplicate, delete, pan, and zoom with the toolbar and keyboard shortcuts.
- Save and open editable JSON diagrams, or export the canvas as SVG.

The editor uses an SVG-based diagram model so more shapes, connectors, and layout capabilities can be added incrementally. This is a focused MVP, not full draw.io feature parity. Mobile and tablet interfaces are intentionally left for a later phase.
