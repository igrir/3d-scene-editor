# 🌐 Embedding 3D Primitive Builder

Include the full 3D scene editor on any website with a single `<script>` tag and CSS. No build tools, no framework, no server required.

## Quick Start

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="dist/3d-primitive-builder.css">
</head>
<body>

  <div id="editor" style="width:100%;height:500px"></div>

  <script src="dist/3d-primitive-builder.umd.js"></script>
  <script>
    PrimitiveBuilder.create('#editor', { height: 500 }).init();
  </script>

</body>
</html>
```

## Zero-JS Embed

Set the `data-primitive-editor` attribute on any element:

```html
<div data-primitive-editor='{"height":500}'></div>
<script src="dist/3d-primitive-builder.umd.js"></script>
```

Options are passed as JSON in the attribute value.

## Build the Library

From the project root:

```bash
npm run build
```

Output:
```
dist/3d-primitive-builder.umd.js   — UMD bundle (623 KB, ~163 KB gzipped)
dist/3d-primitive-builder.es.js    — ES module bundle
dist/3d-primitive-builder.css      — Styles
```

## Script Tag (CDN)

Host the built files on any static server, or use a CDN:

```html
<link rel="stylesheet" href="https://your-cdn.com/3d-primitive-builder.css">
<script src="https://your-cdn.com/3d-primitive-builder.umd.js"></script>
```

## API Reference

### `PrimitiveBuilder.create(selector, options)`

Creates an editor instance. Returns a `PrimitiveEditor` object.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `width` | number / string | `'100%'` | Container width |
| `height` | number | `500` | Container height (px) |
| `showUI` | boolean | `true` | Show the bottom panel & tools |

### `PrimitiveEditor` Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `.init()` | `Promise<PrimitiveEditor>` | Initialize the 3D scene |
| `.addPrimitive(type)` | `PrimitiveEditor` | Add an object (box, sphere, cylinder, cone, torus, plane, etc.) |
| `.loadScene(data)` | `PrimitiveEditor` | Load scene from JSON array |
| `.getSceneData()` | `Array` | Export current scene as JSON |
| `.clearScene()` | `PrimitiveEditor` | Remove all objects |
| `.setBackgroundColor(hex)` | `PrimitiveEditor` | Change scene background |
| `.destroy()` | `void` | Clean up and remove the editor |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `.container` | `Element` | The container DOM element |
| `.scene` | `THREE.Scene` | The Three.js scene |
| `.objects` | `Array` | All scene objects |
| `.selected` | `Set` | Currently selected objects |
| `.state` | `Object` | Internal app state |
| `.isReady` | `boolean` | Whether the editor is initialized |

## Example

See [`example.html`](example.html) for a full working demo.

```javascript
const editor = await PrimitiveBuilder.create('#editor', {
  height: 520,
}).init();

// Add some objects
editor.addPrimitive('box');
editor.addPrimitive('sphere');

// Export the scene
const data = editor.getSceneData();
console.log(data);

// Load a previously exported scene
editor.loadScene(data);

// Clean up when done
editor.destroy();
```

## Files

```
embedding/
├── README.md       ← this file
└── example.html    ← standalone demo page
```

The library source is at `src/lib.js`. Built files go to `dist/`.
