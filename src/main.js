import * as THREE from 'three';
import { state, sceneRefs, objects, dropTargets, selected } from './state.js';
import { DEFAULT_COLOR } from './constants.js';
import { initScene } from './scene.js';
import { createObj, generateAllIcons } from './objects.js';
import { createUI, refreshPanel } from './panels.js';
import { createGizmoInstances, getActiveGizmo, detachGizmo } from './gizmo/index.js';
import { refreshSelection } from './selection.js';
import { setupInput } from './input.js';
import { setupImportExport } from './import-export.js';
import { showSaveLoadUI } from './saveload.js';
import { history, actCreate, actColor } from './history.js';
import { cancelDropMode, startDropMode, placeGhost } from './drop-mode.js';
import { delSel, dupSel } from './objects.js';

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
const icons = generateAllIcons();
document.querySelectorAll('.ob-icon').forEach(img => {
  if (icons[img.dataset.t]) img.src = icons[img.dataset.t];
});

// 7. Save/Load button
document.getElementById('btn-saveload').addEventListener('click', () => showSaveLoadUI());

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

// Color picker
document.getElementById('cp').addEventListener('input', () => {
  const selMeshes = [...selected].filter(m => !m.isGroup);
  const oc = selMeshes.map(m => m.material.color.getHex());
  const nc = document.getElementById('cp').value;
  state.nextColor = nc;
  document.getElementById('ch').textContent = nc;
  if (state.dropMode && state.dropMode.ghost) {
    state.dropMode.ghost.material.color.set(nc);
  }
  if (selMeshes.length) {
    const c = new THREE.Color(nc);
    selMeshes.forEach(m => m.material.color.copy(c));
    history.execute(actColor(selMeshes, oc, nc));
    refreshPanel();
  }
});

// Color swatches
document.querySelectorAll('.cc span').forEach(el => {
  el.addEventListener('click', () => {
    const c = el.dataset.c;
    const selMeshes = [...selected].filter(m => !m.isGroup);
    const oc = selMeshes.map(m => m.material.color.getHex());
    document.getElementById('cp').value = c;
    document.getElementById('ch').textContent = c;
    state.nextColor = c;
    if (state.dropMode && state.dropMode.ghost) {
      state.dropMode.ghost.material.color.set(c);
    }
    if (selMeshes.length) {
      const col = new THREE.Color(c);
      selMeshes.forEach(m => m.material.color.copy(col));
      history.execute(actColor(selMeshes, oc, c));
      refreshPanel();
    }
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
    const newName = document.getElementById('inp-name').value.trim() || m.userData.type;
    const oldPos = state.focusSnapshot.pos;
    const oldScl = state.focusSnapshot.scl;
    const oldName = state.focusSnapshot.name;

    m.userData.type = newName;
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
        m.userData.type = newName;
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
        m.userData.type = oldName;
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
// DEFAULT OBJECTS
// ═══════════════════════════════════

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
  sceneRefs.orbit.update();
  sceneRefs.composer.render();
}
loop();

console.log('\u2705 3D Scene Editor refactored to ES modules. Gizmo mode: advanced + simple. Toggle in toolbar!');
