import * as THREE from 'three';
import { state, sceneRefs, objects, dropTargets, selected } from './state.js';
import { DEFAULT_COLOR } from './constants.js';
import { initScene } from './scene.js';
import { createObj, generateAllIcons } from './objects.js';
import { createUI, refreshPanel, selectColor, selectColorFinal, trackColor, addColor, renderCustom, renderRecent } from './panels.js';
import { createGizmoInstances, getActiveGizmo, detachGizmo } from './gizmo/index.js';
import { refreshSelection } from './selection.js';
import { setupInput } from './input.js';
import { setupImportExport } from './import-export.js';
import { showSaveLoadUI } from './saveload.js';
import { history, actCreate } from './history.js';
import { cancelDropMode, startDropMode, placeGhost } from './drop-mode.js';
import { delSel, dupSel } from './objects.js';
import { groupSelected, ungroupSelected, initPrefabUI } from './prefabs.js';
import { SCENES, getSceneNames } from './view-mode.js';

// ═══════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════

const container = document.getElementById('cv');

// 1. Scene
initScene(container);

// 2. Gizmo instances (must be after scene exists)
createGizmoInstances();

// 3. UI
createUI();

// 4. Input events
setupInput();

// 5. Import/Export buttons
setupImportExport();

// 6. Generate primitive icons
let icons = generateAllIcons(state.nextColor);
document.querySelectorAll('.ob-icon').forEach(img => {
  if (icons[img.dataset.t]) img.src = icons[img.dataset.t];
});
// Expose refreshIcons for color changes
window._refreshIcons = (color) => {
  icons = generateAllIcons(color);
  document.querySelectorAll('.ob-icon').forEach(img => {
    if (icons[img.dataset.t]) img.src = icons[img.dataset.t];
  });
};

// 7. Save/Load button
document.getElementById('btn-saveload').addEventListener('click', () => showSaveLoadUI());

// 8. Init prefab UI
initPrefabUI();

// ═══════════════════════════════════
// WIRE COMPLEX HANDLERS
// (these are handlers that would cause circular dependency chains
//  if placed in panels.js — they cross module boundaries)
// ═══════════════════════════════════

// Object creation buttons
document.querySelectorAll('.ob[data-t]').forEach(b => {
  b.addEventListener('click', () => {
    if (state.dropMode) {
      if (state.dropMode.type === b.dataset.t && state.dropMode.ghost.visible) {
        placeGhost();
        return;
      }
      cancelDropMode();
    }
    startDropMode(b.dataset.t);
  });
});

// Color swatches — event delegation on containers
['cc-recent', 'cc-custom'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    const sw = e.target.closest('span[data-c]');
    if (!sw) return;
    const c = sw.dataset.c;
    // In cc-custom edit mode, deleteColor handles it in panels.js
    if (id === 'cc-custom' && document.getElementById('cc-custom').classList.contains('editing')) return;
    selectColorFinal(c);
  });
});

// Undo / Redo
document.getElementById('btn-undo').addEventListener('click', () => history.undo());
document.getElementById('btn-redo').addEventListener('click', () => history.redo());

// Duplicate
document.getElementById('bdup').addEventListener('click', dupSel);
document.getElementById('btn-dup-tl').addEventListener('click', dupSel);

// Delete
document.getElementById('bddel').addEventListener('click', delSel);
document.getElementById('btn-del-tl').addEventListener('click', delSel);

// Flip
document.getElementById('btn-fliph').addEventListener('click', () => flipSel('x'));
document.getElementById('btn-flipv').addEventListener('click', () => flipSel('y'));
document.getElementById('btn-group').addEventListener('click', groupSelected);
document.getElementById('btn-ungroup').addEventListener('click', ungroupSelected);

function flipSel(axis) {
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
  refreshPanel();
}

// Reset scene
document.getElementById('bdrst').addEventListener('click', () => {
  if (state.dropMode) cancelDropMode();
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
  dropTargets.length = 1; // only shadowPlane remains
  selected.clear();
  detachGizmo();
  history.undoStack = [];
  history.redoStack = [];
  history.updateButtons();
  refreshSelection();
  sceneRefs.camera.position.set(6, 5, 8);
  sceneRefs.orbit.target.set(0, 0.4, 0);
  sceneRefs.orbit.update();
});

// Info panel field change events (history + multi-selection)
document.querySelectorAll('#si-editor input').forEach(inp => {
  inp.addEventListener('change', () => {
    if (!state.editingObject || !state.focusSnapshot) return;
    const m = state.editingObject;
    const newPos = new THREE.Vector3(
      parseFloat(document.getElementById('inp-px').value) || 0,
      parseFloat(document.getElementById('inp-py').value) || 0,
      parseFloat(document.getElementById('inp-pz').value) || 0
    );
    const newScl = new THREE.Vector3(
      Math.max(0.01, parseFloat(document.getElementById('inp-sx').value) || 0.01),
      Math.max(0.01, parseFloat(document.getElementById('inp-sy').value) || 0.01),
      Math.max(0.01, parseFloat(document.getElementById('inp-sz').value) || 0.01)
    );
    const newName = document.getElementById('inp-name').value.trim() || m.userData.name || m.userData.type;
    const oldPos = state.focusSnapshot.pos;
    const oldScl = state.focusSnapshot.scl;
    const oldName = state.focusSnapshot.name;

    m.userData.name = newName;
    m.position.copy(newPos);
    m.scale.copy(newScl);

    if (selected.size > 1) {
      const dPos = newPos.clone().sub(oldPos);
      const dScl = new THREE.Vector3(
        oldScl.x > 0 ? newScl.x / oldScl.x : 1,
        oldScl.y > 0 ? newScl.y / oldScl.y : 1,
        oldScl.z > 0 ? newScl.z / oldScl.z : 1
      );
      for (const om of selected) {
        if (om === m) continue;
        om.position.add(dPos);
        om.scale.multiply(dScl);
      }
    }

    history.execute({
      do() {
        m.userData.name = newName;
        m.position.copy(newPos);
        m.scale.copy(newScl);
        const dp = newPos.clone().sub(oldPos);
        const ds = new THREE.Vector3(oldScl.x > 0 ? newScl.x / oldScl.x : 1, oldScl.y > 0 ? newScl.y / oldScl.y : 1, oldScl.z > 0 ? newScl.z / oldScl.z : 1);
        for (const om of selected) {
          if (om === m) continue;
          om.position.add(dp);
          om.scale.multiply(ds);
        }
      },
      undo() {
        m.userData.name = oldName;
        m.position.copy(oldPos);
        m.scale.copy(oldScl);
        const dp = oldPos.clone().sub(newPos);
        const ds = new THREE.Vector3(newScl.x > 0 ? oldScl.x / newScl.x : 1, newScl.y > 0 ? oldScl.y / newScl.y : 1, newScl.z > 0 ? oldScl.z / newScl.z : 1);
        for (const om of selected) {
          if (om === m) continue;
          om.position.add(dp);
          om.scale.multiply(ds);
        }
      },
    });

    refreshPanel();
    state.focusSnapshot = { pos: newPos.clone(), scl: newScl.clone(), name: newName };
  });
});

// ═══════════════════════════════════
// VIEW MODE SETUP
// ═══════════════════════════════════

const params = new URLSearchParams(location.search);
const viewScene = params.get('view');

if (viewScene && SCENES[viewScene]) {
  // ── Pure viewer: no UI at all, just the scene ──
  const sceneData = SCENES[viewScene];
  for (const s of sceneData) {
    state.nextColor = s.color;
    const m = createObj(s.type);
    m.position.set(s.pos[0], s.pos[1], s.pos[2]);
    if (s.rot) m.rotation.set(s.rot[0], s.rot[1], s.rot[2]);
    if (s.scale) m.scale.set(s.scale[0], s.scale[1], s.scale[2]);
    m.material.color.set(s.color);
    sceneRefs.scene.add(m);
    objects.push(m);
    dropTargets.push(m);
  }
  // Camera position
  sceneRefs.camera.position.set(3, 2.5, 3.5);
  sceneRefs.orbit.target.set(0, 1, 0);
  sceneRefs.orbit.update();
  // Pure viewer — no UI, no interaction, no gizmo, lightweight render
  document.body.classList.add('view-mode');
  document.body.classList.add('view-mode-pure');
  selected.clear();
  detachGizmo();
  refreshSelection();
  sceneRefs.viewerMode = true;

} else {
  // ── Normal editor mode with view toggle ──
  const btn = document.createElement('button');
  btn.id = 'view-toggle';
  btn.innerHTML = '\u25B6'; // ▶
  btn.title = 'View Mode';
  btn.addEventListener('click', () => {
    document.body.classList.toggle('view-mode');
    const isView = document.body.classList.contains('view-mode');
    btn.innerHTML = isView ? '\u2716' : '\u25B6'; // ✕ or ▶
    btn.title = isView ? 'Exit View Mode' : 'View Mode';
  });
  document.body.appendChild(btn);

  // Default objects
  (function initDefaultObjects() {
    const defaults = [
      ['box', [-1.5, 0.5, 0], '#e94560'],
      ['sphere', [1.5, 0.6, 0], '#0f3460'],
      ['cylinder', [0, 0.5, -1.8], '#16a34a'],
      ['cone', [0, 0.5, 1.8], '#f59e0b'],
      ['torus', [-1.8, 0.5, -1.5], '#8b5cf6'],
    ];
    for (const [t, pos, c] of defaults) {
      state.nextColor = c;
      const m = createObj(t);
      m.position.set(pos[0], pos[1], pos[2]);
      sceneRefs.scene.add(m);
      objects.push(m);
      dropTargets.push(m);
    }
    state.nextColor = DEFAULT_COLOR;
    document.getElementById('cp').value = DEFAULT_COLOR;
    document.getElementById('ch').textContent = DEFAULT_COLOR;
  })();
}


// ═══════════════════════════════════
// ANIMATION LOOP
// ═══════════════════════════════════

function loop() {
  requestAnimationFrame(loop);
  const g = getActiveGizmo();
  if (g.visible && state.targetObject) {
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
  if (sceneRefs.viewerMode) {
    sceneRefs.renderer.render(sceneRefs.scene, sceneRefs.camera);
  } else {
    sceneRefs.composer.render();
  }
}
loop();

console.log('\u2705 3D Scene Editor refactored to ES modules. Gizmo mode: advanced + simple. Toggle in toolbar!');
