# 3D Scene Editor

A browser-based 3D scene editor built with [Three.js](https://threejs.org/). Place, transform, and style primitive objects in a real-time 3D viewport — no install, no backend, just an HTML file.

## Features

### Scene Manipulation
- **Primitive objects** — Box, Sphere, Cylinder, Cone, Torus, Plane, and Image objects
- **Gizmo transforms** — Move, rotate, and scale objects with either an **Advanced** (per-axis) or **Simple** (full) gizmo mode
- **Multi-select** — Ctrl/Cmd+click to select multiple objects, transform as a group
- **Drag-to-place** — Pick an object type, see a ghost preview follow the mouse, click to place on surfaces
- **Rectangle select** — Drag a rectangle in the viewport to select all visible objects

### Editing
- **Color picker** — Hex input + 8 swatch chips
- **Info panel** — Editable name, position (X/Y/Z), scale (X/Y/Z) with click-to-scrub
- **Drop shadows** — Dashed vertical line + ground ring + dot while translating
- **Undo/Redo** — Cmd+Z (undo), Cmd+Y (redo)
- **Delete** — Backspace/Delete removes selected objects
- **Duplicate** — Clone selected objects with position offset

### World Controls
- **Directional sun light** — Adjustable azimuth & elevation
- **Ambient light** — Toggle and color
- **Background color** — Scene background picker
- **Grid toggle** — Show/hide ground grid
- **Soft shadows** — Toggle shadow map
- **SSAO** — Screen-space ambient occlusion post-processing

### UI
- **Glass panel** — White translucent UI with backdrop blur, collapsible bottom panel with tabbed interface
- **Mobile-friendly** — Touch targets, responsive layout
- **Tabs** — Objects (create), Tools (gizmo mode, surface/plane move, etc.), Color, Info (transform values, image assignment), World (lighting/environment)

### Import/Export
- **Export scene** — Download scene as JSON
- **Import scene** — Load previously exported JSON

## Usage

1. Open `index.html` in any modern browser (Chrome, Firefox, Safari, Edge)
2. Click an object type in the **Objects** tab to create it, or use **Drop Mode** to place on surfaces
3. Select objects by clicking, toggle between **Advanced** and **Simple** gizmo in the **Tools** tab
4. Use the **World** tab to control lighting and environment

No build step, no server required — just open the file.

## Tech Stack

- **Three.js** (r157) — WebGL rendering, scene graph, raycasting
- **Three.js examples** — OrbitControls, EffectComposer, SSAOPass
- Vanilla HTML/CSS/JS — Single-file application (~65KB)

## License

MIT
