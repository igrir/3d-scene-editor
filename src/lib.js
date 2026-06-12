/**
 * 3D Primitive Builder — Embeddable Library
 * 
 * Usage:
 *   <div id="my-editor"></div>
 *   <script src="3d-primitive-builder.umd.js"></script>
 *   <script>
 *     const editor = PrimitiveBuilder.create('#my-editor', {
 *       width: '100%',
 *       height: 600,
 *     });
 *   </script>
 */

import * as THREE from 'three';
import { state, sceneRefs, objects, selected, dropTargets } from './state.js';
import { DEFAULT_COLOR } from './constants.js';
import { initScene } from './scene.js';
import { createObj, generateAllIcons } from './objects.js';
import { createUI, refreshPanel, selectColorFinal, selectColor, syncBarColorToSelection } from './panels.js';
import { createGizmoInstances, getActiveGizmo, detachGizmo, attachGizmo } from './gizmo/index.js';
import { refreshSelection } from './selection.js';
import { setupInput } from './input.js';
import { setupImportExport } from './import-export.js';
import { loadFromData, exportSceneData, showSaveLoadUI } from './saveload.js';
import { history, actCreate } from './history.js';
import { cancelDropMode, startDropMode, placeGhost } from './drop-mode.js';
import { delSel, dupSel } from './objects.js';
import { groupSelected, ungroupSelected, initPrefabUI } from './prefabs.js';
// Inject CSS into the page (inlined in JS bundle, no extra HTTP request)
// Body overflow:hidden is stripped so embedding pages can scroll.
// Fullscreen pages (/editor/) set overflow:hidden via their own CSS.
import cssStyle from '../css/style.css?inline';
(function injectLibCSS() {
  if (typeof document === 'undefined' || document.getElementById('__pb_css')) return;
  const s = document.createElement('style');
  s.id = '__pb_css';
  // Only strip standalone body{...overflow:hidden...} — NOT #panel-body etc.
  // CSS is minified to one line by Vite, so use string start / semicolon anchor
  const cleaned = cssStyle.replace(/(?:^|[;}])\s*body\{([^}]*)\}/g, (m) => {
    return m.replace(/overflow:[^;]+;?/g, '');
  });
  s.textContent = cleaned;
  document.head.appendChild(s);
})();

// Suppress Three.js r155+ deprecation warnings (harmless)
(function suppressThreeWarnings() {
  if (typeof console === 'undefined') return;
  const _warn = console.warn;
  const suppressed = [
    'physicallyCorrectLights',
    'useLegacyLights',
  ];
  console.warn = function(...args) {
    const msg = args.join(' ');
    for (const s of suppressed) {
      if (msg.includes(s)) return;
    }
    _warn.apply(console, args);
  };
})();

export class PrimitiveEditor {
  constructor(container, options = {}) {
    if (typeof container === 'string') {
      container = document.querySelector(container);
    }
    if (!container) throw new Error('PrimitiveBuilder: container element not found');

    this.options = {
      width: '100%',
      height: 500,
      showUI: true,
      showTools: true,
      showPanel: true,
      ...options,
    };

    this._container = container;
    this._ready = false;

    // Set up container
    container.style.position = 'relative';
    container.style.width = typeof this.options.width === 'number' ? this.options.width + 'px' : this.options.width;
    container.style.height = typeof this.options.height === 'number' ? this.options.height + 'px' : this.options.height;
    container.style.overflow = 'hidden';

    // Create the canvas wrapper
    const cv = document.createElement('div');
    cv.id = 'cv';
    cv.style.cssText = 'width:100%;height:100%;position:relative;overflow:hidden';
    container.appendChild(cv);

    // Store reference
    this._cv = cv;
    this._initialized = false;
  }

  async init() {
    if (this._initialized) return;
    this._initialized = true;

    // 1. Scene
    const sc = initScene(this._cv);
    
    // 2. Gizmo instances
    createGizmoInstances();

    // 3. UI
    if (this.options.showUI) {
      createUI();
    }

    // 4. Input (always needed for orbit, but skip if no UI elements)
    setupInput();

    // 5. Import/Export — only if visible
    if (this.options.showUI) {
      setupImportExport();
    }

    // ── UI-dependent setup (skip when showUI=false) ──
    if (this.options.showUI) {
      // 6. Icons
      const icons = generateAllIcons(DEFAULT_COLOR);
      document.querySelectorAll('.ob-icon').forEach(img => {
        if (icons[img.dataset.t]) img.src = icons[img.dataset.t];
      });

      // 7. Wire up primitive buttons
      this._wirePrimitiveButtons();

      // 8. Wire up color swatches
      this._wireColorSwatches();

      // 9. Wire up action buttons
      this._wireActionButtons();

      // 10. Init prefab UI
      initPrefabUI();
    }

    // 11. Start animation loop
    this._startLoop();

    this._ready = true;

    // Expose some methods on the DOM element
    this._cv._editor = this;

    return this;
  }

  _wirePrimitiveButtons() {
    document.querySelectorAll('.ob[data-t]').forEach(b => {
      // Remove existing listeners to prevent duplicates if init() called multiple times
      const clone = b.cloneNode(true);
      b.parentNode.replaceChild(clone, b);
      clone.addEventListener('click', () => {
        const t = clone.dataset.t;
        if (state.dropMode) {
          if (state.dropMode.type === t && state.dropMode.ghost.visible) {
            placeGhost();
            return;
          }
          cancelDropMode();
        }
        startDropMode(t);
      });
    });
  }

  _wireColorSwatches() {
    ['cc-recent', 'cc-custom'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const clone = el.cloneNode(true);
      el.parentNode.replaceChild(clone, el);
      clone.addEventListener('click', e => {
        const sw = e.target.closest('span[data-c]');
        if (!sw) return;
        const c = sw.dataset.c;
        if (id === 'cc-custom' && document.getElementById('cc-custom').classList.contains('editing')) return;
        selectColorFinal(c);
      });
    });
  }

  _wireActionButtons() {
    // Wire save/load, duplicate, delete buttons (normally in main.js)
    this._wireButton('btn-saveload', () => showSaveLoadUI());
    [
      { id: 'bdup', action: dupSel },
      { id: 'btn-dup-tl', action: dupSel },
      { id: 'bddel', action: delSel },
      { id: 'btn-del-tl', action: delSel },
    ].forEach(({ id, action }) => this._wireButton(id, action));
    // Group/ungroup buttons
    this._wireButton('btn-group', groupSelected);
    this._wireButton('btn-ungroup', ungroupSelected);

    // Flip buttons
    this._wireFlipButtons();
  }

  _wireButton(id, fn) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener('click', fn);
  }

  _wireFlipButtons() {
    const flipSel = (axis) => {
      if (!selected.size) return;
      const ai = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      const oldScales = [...selected].map(m => m.scale.clone());
      for (const m of selected) {
        m.scale.setComponent(ai, -m.scale.getComponent(ai));
      }
      const newScales = [...selected].map(m => m.scale.clone());
      history.execute({
        do: () => selected.forEach((m, i) => m.scale.copy(newScales[i])),
        undo: () => selected.forEach((m, i) => m.scale.copy(oldScales[i])),
      });
    };
    ['btn-fliph', 'btn-flipv'].forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;
      const axis = id === 'btn-fliph' ? 'x' : 'y';
      const clone = btn.cloneNode(true);
      btn.parentNode.replaceChild(clone, btn);
      clone.addEventListener('click', () => flipSel(axis));
    });
  }

  _startLoop() {
    const loop = () => {
      this._animId = requestAnimationFrame(loop);
      const g = getActiveGizmo();
      if (g && g.visible && state.targetObject) {
        if (selected.size > 1) {
          const c = new THREE.Vector3();
          for (const m of selected) c.add(m.position);
          c.divideScalar(selected.size);
          g.position.copy(c);
        } else {
          g.position.copy(state.targetObject.position);
        }
      }
      // Animate dashed outline overlay
      if (sceneRefs.outlinePass && sceneRefs.outlinePass.overlayMaterial && sceneRefs.outlinePass.overlayMaterial.uniforms) {
        sceneRefs.outlinePass.overlayMaterial.uniforms.dashTime.value = performance.now() / 1000;
      }
      sceneRefs.orbit.update();
      sceneRefs.composer.render();
    };
    loop();
  }

  // ── API Methods ──

  loadScene(data) {
    if (!Array.isArray(data)) return;
    loadFromData(data);
    return this;
  }

  getSceneData() {
    return exportSceneData();
  }

  addPrimitive(type) {
    if (!this._ready) return this;
    const m = createObj(type);
    m.position.set(0, 0.5, 0);
    history.execute(actCreate(m));
    selected.clear();
    selected.add(m);
    refreshSelection();
    return this;
  }

  clearScene() {
    if (!this._ready) return this;
    cancelDropMode();
    function disposeObj(o) {
      if (o.isGroup) { o.children.forEach(disposeObj); return; }
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    }
    for (const m of [...objects]) {
      sceneRefs.scene.remove(m);
      disposeObj(m);
    }
    objects.length = 0;
    dropTargets.length = 1;
    selected.clear();
    detachGizmo();
    history.undoStack = [];
    history.redoStack = [];
    history.updateButtons();
    refreshSelection();
    sceneRefs.camera.position.set(6, 5, 8);
    sceneRefs.orbit.target.set(0, 0.4, 0);
    sceneRefs.orbit.update();
    return this;
  }

  setBackgroundColor(color) {
    sceneRefs.scene.background = new THREE.Color(color);
    return this;
  }

  destroy() {
    cancelDropMode();
    if (sceneRefs.renderer) {
      sceneRefs.renderer.dispose();
    }
    if (sceneRefs.composer) {
      // Clean up composer passes
    }
    window._refreshIcons = null;
    window._syncColorPicker = null;
    this._cv.innerHTML = '';
    this._initialized = false;
    this._ready = false;
  }

  get isReady() { return this._ready; }
  get container() { return this._container; }
  get scene() { return sceneRefs.scene; }
  get objects() { return objects; }
  get selected() { return selected; }
  get state() { return state; }
}

// ── Singleton convenience ──
let _defaultInstance = null;

export function create(container, options = {}) {
  const editor = new PrimitiveEditor(container, options);
  // We don't auto-init — user must call editor.init() or use the returned promise
  return editor;
}

// Auto-init for direct script tag usage
if (typeof window !== 'undefined') {
  const pb = { create, Editor: PrimitiveEditor };
  Object.defineProperty(pb, 'sceneRefs', { get: () => sceneRefs });
  window.PrimitiveBuilder = pb;

  // Auto-load if there's a [data-primitive-editor] element
  document.addEventListener('DOMContentLoaded', () => {
    const el = document.querySelector('[data-primitive-editor]');
    if (el) {
      const opts = {};
      try { Object.assign(opts, JSON.parse(el.dataset.primitiveEditor)); } catch {}
      const editor = create(el, opts);
      editor.init();
    }
  });
}
