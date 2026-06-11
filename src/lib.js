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
import { showSaveLoadUI, loadFromData, exportSceneData } from './saveload.js';
import { history, actCreate } from './history.js';
import { cancelDropMode, startDropMode } from './drop-mode.js';
import { delSel, dupSel } from './objects.js';

// Inline CSS injection
const LIB_CSS = /* inject:css */ true; // Vite will replace this

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
      // Override save/load for library mode
      this._patchSaveLoad();
    }

    // 4. Input
    setupInput();

    // 5. Import/Export
    setupImportExport();

    // 6. Icons
    const icons = generateAllIcons(DEFAULT_COLOR);
    document.querySelectorAll('.ob-icon').forEach(img => {
      if (icons[img.dataset.t]) img.src = icons[img.dataset.t];
    });

    this._ready = true;

    // Expose some methods on the DOM element
    this._cv._editor = this;

    return this;
  }

  _patchSaveLoad() {
    // In library mode, Save/Load opens a simple alert
    const btn = document.getElementById('btn-saveload');
    if (btn) {
      btn.removeEventListener('click', showSaveLoadUI);
      btn.addEventListener('click', () => {
        const data = exportSceneData();
        console.log('[PrimitiveBuilder] Scene data:', JSON.stringify(data));
        alert('Scene data logged to console (F12)');
      });
    }
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
  window.PrimitiveBuilder = {
    create,
    Editor: PrimitiveEditor,
  };

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
