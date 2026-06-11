/**
 * Prefab & Grouping System
 */
import * as THREE from 'three';
import { objects, selected, state, sceneRefs, dropTargets } from './state.js';
import { createObj } from './objects.js';
import { refreshSelection } from './selection.js';
import { history } from './history.js';
import { detachGizmo, attachGizmo } from './gizmo/index.js';

// ── Prefab Storage ──
let prefabs = [];
let prefabIdCounter = 1;

export function getPrefabs() { return prefabs; }

export function addPrefab(obj) {
  // Serialize the object(s) into a prefab
  const items = [];
  if (obj.isGroup) {
    for (const child of obj.children) {
      items.push(serializeObj(child));
    }
    // Also store group properties
    items.groupProps = {
      pos: obj.position.toArray(),
      rot: [obj.quaternion.x, obj.quaternion.y, obj.quaternion.z, obj.quaternion.w],
      scl: obj.scale.toArray(),
    };
  } else {
    items.push(serializeObj(obj));
  }

  // Capture screenshot thumbnail
  const thumb = captureThumbnail(obj);

  const prefab = {
    id: prefabIdCounter++,
    name: (obj.userData.type || 'Group') + '_' + prefabIdCounter,
    items,
    isGroup: obj.isGroup,
    thumb,
    createdAt: Date.now(),
  };
  prefabs.push(prefab);
  renderPrefabs();
  return prefab;
}

export function deletePrefab(id) {
  prefabs = prefabs.filter(p => p.id !== id);
  renderPrefabs();
}

export function instantiatePrefab(id) {
  const prefab = prefabs.find(p => p.id === id);
  if (!prefab) return;

  if (prefab.isGroup) {
    const group = new THREE.Group();
    group.userData.type = 'prefab_' + id;
    group.userData.prefabId = id;
    group.userData.isDropTarget = false;

    for (const item of prefab.items) {
      const mesh = deserializeObj(item);
      if (mesh) {
        group.add(mesh);
        mesh.userData.parentPrefabId = id;
      }
    }

    if (prefab.groupProps) {
      group.position.fromArray(prefab.groupProps.pos);
      group.quaternion.fromArray(prefab.groupProps.rot);
      group.scale.fromArray(prefab.groupProps.scl);
    }

    sceneRefs.scene.add(group);
    objects.push(group);
    // Register depth for undo
    history.execute({
      do: () => {},
      undo: () => {
        sceneRefs.scene.remove(group);
        const idx = objects.indexOf(group);
        if (idx > -1) objects.splice(idx, 1);
        selected.delete(group);
        detachGizmo();
      },
    });
    selected.clear();
    selected.add(group);
    refreshSelection();
  } else {
    // Single object
    const item = prefab.items[0];
    const mesh = deserializeObj(item);
    if (!mesh) return;
    mesh.position.set(0, 0.5, 0);
    sceneRefs.scene.add(mesh);
    objects.push(mesh);
    history.execute({
      do: () => {},
      undo: () => {
        sceneRefs.scene.remove(mesh);
        const idx = objects.indexOf(mesh);
        if (idx > -1) objects.splice(idx, 1);
        selected.delete(mesh);
        detachGizmo();
      },
    });
    selected.clear();
    selected.add(mesh);
    refreshSelection();
  }
}

// ── Group / Ungroup ──

export function groupSelected() {
  if (selected.size < 2) return;
  const arr = [...selected];
  const group = new THREE.Group();
  group.userData.type = 'group';
  group.userData.isDropTarget = false;

  // Calculate centroid
  const center = new THREE.Vector3();
  for (const m of arr) center.add(m.position);
  center.divideScalar(arr.length);
  group.position.copy(center);

  // Move children into group, offsetting positions relative to group
  for (const m of arr) {
    m.position.sub(center);
    group.add(m);
    const idx = objects.indexOf(m);
    if (idx > -1) objects.splice(idx, 1);
    // Remove children from dropTargets so they don't act as surfaces
    const dtIdx = dropTargets.indexOf(m);
    if (dtIdx > -1) dropTargets.splice(dtIdx, 1);
    // Clear selection highlight since unhighlight() won't find them anymore
    if (!m.isGroup && m.material) {
      m.material.emissive = new THREE.Color(0);
      m.material.emissiveIntensity = 0;
    }
  }

  sceneRefs.scene.add(group);
  objects.push(group);
  dropTargets.push(group);
  selected.clear();
  selected.add(group);
  history.execute({
    do: () => {},
    undo: () => {
      ungroupInternal(group);
      sceneRefs.scene.remove(group);
      const idx = objects.indexOf(group);
      if (idx > -1) objects.splice(idx, 1);
      const dtIdx = dropTargets.indexOf(group);
      if (dtIdx > -1) dropTargets.splice(dtIdx, 1);
    },
  });
  refreshSelection();
}

export function ungroupSelected() {
  if (selected.size !== 1) return;
  const obj = [...selected][0];
  if (!obj.isGroup) return;
  ungroupInternal(obj);
  sceneRefs.scene.remove(obj);
  const idx = objects.indexOf(obj);
  if (idx > -1) objects.splice(idx, 1);
  const dtIdx = dropTargets.indexOf(obj);
  if (dtIdx > -1) dropTargets.splice(dtIdx, 1);
  selected.clear();
  refreshSelection();
}

function ungroupInternal(group) {
  // Restore world positions of children
  const children = [...group.children];
  for (const child of children) {
    const worldPos = new THREE.Vector3();
    child.getWorldPosition(worldPos);
    child.position.copy(worldPos);
    child.quaternion.premultiply(group.quaternion.clone().invert());
    // Actually simpler: just use world matrix
    child.updateWorldMatrix(true, false);
    group.remove(child);
    sceneRefs.scene.add(child);
    objects.push(child);
    dropTargets.push(child);
  }
}

// ── Serialization ──

function serializeObj(mesh) {
  const d = {
    type: mesh.userData.type,
    pos: mesh.position.toArray(),
    rot: [mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w],
    scl: mesh.scale.toArray(),
  };
  if (mesh.isGroup) {
    d.children = mesh.children.map(c => serializeObj(c));
  } else {
    d.color = mesh.material ? '#' + mesh.material.color.getHexString() : '#cccccc';
  }
  return d;
}

function deserializeObj(d) {
  const mesh = createObj(d.type);
  if (!mesh) return null;
  mesh.position.fromArray(d.pos);
  mesh.quaternion.fromArray(d.rot);
  mesh.scale.fromArray(d.scl);
  if (d.color && mesh.material) {
    mesh.material.color.set(d.color);
  }
  return mesh;
}

// ── Thumbnail Capture ──

function captureThumbnail(obj) {
  // Clone the renderer's current frame into a data URL via a small offscreen canvas
  const renderer = sceneRefs.renderer;
  if (!renderer) return '';

  // Position the camera to frame the object
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = maxDim * 2.5 + 1;

  // Quick render to an offscreen canvas
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 120;
  thumbCanvas.height = 120;
  const thumbCtx = thumbCanvas.getContext('2d');
  if (!thumbCtx) return '';

  // Use the main scene but isolate the object
  const oldBg = sceneRefs.scene.background.clone();
  // Hide everything except the object
  const visMap = new Map();
  for (const m of objects) {
    visMap.set(m, m.visible);
    m.visible = m === obj || (obj.isGroup && obj.children.includes(m));
  }
  // Also hide panels/helpers
  if (sceneRefs.gridHelper) sceneRefs.gridHelper.visible = false;
  if (sceneRefs.shadowPlane) sceneRefs.shadowPlane.visible = false;

  // Create a temp camera
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  cam.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist);
  cam.lookAt(center);

  // Render to a temporary render target so we can read pixels back
  const rt = new THREE.WebGLRenderTarget(120, 120, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  });
  renderer.setRenderTarget(rt);
  renderer.render(sceneRefs.scene, cam);

  // Read pixels from render target
  const pixels = new Uint8Array(120 * 120 * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, 120, 120, pixels);
  renderer.setRenderTarget(null);

  // Flip Y (WebGL reads bottom-up, canvas expects top-down)
  const flipped = new Uint8Array(120 * 120 * 4);
  for (let y = 0; y < 120; y++) {
    const srcRow = y * 120 * 4;
    const dstRow = (119 - y) * 120 * 4;
    for (let x = 0; x < 120 * 4; x++) {
      flipped[dstRow + x] = pixels[srcRow + x];
    }
  }
  const imageData = new ImageData(new Uint8ClampedArray(flipped), 120, 120);
  thumbCanvas.getContext('2d').putImageData(imageData, 0, 0);

  // Clean up
  rt.dispose();
  sceneRefs.scene.background = oldBg;
  for (const [m, v] of visMap) m.visible = v;
  if (sceneRefs.gridHelper) sceneRefs.gridHelper.visible = true;
  if (sceneRefs.shadowPlane) sceneRefs.shadowPlane.visible = true;

  return thumbCanvas.toDataURL('image/png');
}

// ── Prefab UI ──

let prefabContainer = null;

export function renderPrefabs() {
  if (!prefabContainer) return;
  prefabContainer.innerHTML = '';

  if (prefabs.length === 0) {
    prefabContainer.innerHTML = '';
    const emptyMsg = document.createElement('div');
    emptyMsg.style.cssText = 'padding:16px;text-align:center;opacity:.4;font-size:11px;grid-column:1/-1';
    emptyMsg.textContent = 'Belum ada prefab. Select object lalu +';
    prefabContainer.appendChild(emptyMsg);
  }

  prefabs.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'pf-btn';
    btn.dataset.prefabId = p.id;
    btn.innerHTML = `<img src="${p.thumb || ''}" alt="" class="pf-thumb"><span class="pf-name">${p.name}</span>`;

    // Single click handler: instantiate normally, or delete if in delete mode
    let longPressTimer = null;
    let longPressFired = false;

    btn.addEventListener('pointerdown', () => {
      longPressFired = false;
      longPressTimer = setTimeout(() => {
        longPressFired = true;
        startDeleteMode();
      }, 500);
    });
    btn.addEventListener('pointerup', () => {
      clearTimeout(longPressTimer);
    });
    btn.addEventListener('pointerleave', () => {
      clearTimeout(longPressTimer);
    });

    btn.addEventListener('click', (e) => {
      if (deleteModeActive) {
        // If this click came from releasing the long-press, ignore it
        if (longPressFired) {
          longPressFired = false;
          return;
        }
        // User tapped again while in jitter mode — confirm delete
        const id = parseInt(e.currentTarget.dataset.prefabId);
        const name = prefabs.find(pf => pf.id === id)?.name || '';
        if (confirm(`Delete prefab "${name}"?`)) {
          deletePrefab(id);
        }
        endDeleteMode();
        return;
      }
      instantiatePrefab(p.id);
    });

    prefabContainer.appendChild(btn);
  });

  // Add prefab button
  const addBtn = document.createElement('button');
  addBtn.className = 'pf-btn pf-add';
  addBtn.textContent = '+';
  addBtn.title = 'Add prefab from selected object';
  addBtn.addEventListener('click', () => {
    if (selected.size === 0) return;
    const obj = [...selected][0];
    addPrefab(obj);
  });
  prefabContainer.appendChild(addBtn);
}

let deleteModeActive = false;

function startDeleteMode() {
  if (deleteModeActive) return;
  deleteModeActive = true;
  document.querySelectorAll('.pf-btn[data-prefab-id]').forEach(b => {
    b.classList.add('pf-deleting');
  });
  // Click anywhere outside cancels delete mode
  const cancel = (e) => {
    if (e.target.closest('.pf-btn[data-prefab-id]')) return;
    endDeleteMode();
    document.removeEventListener('click', cancel);
  };
  setTimeout(() => document.addEventListener('click', cancel), 50);
}

function endDeleteMode() {
  deleteModeActive = false;
  document.querySelectorAll('.pf-btn[data-prefab-id]').forEach(b => {
    b.classList.remove('pf-deleting');
  });
}

// ── Init ──

export function initPrefabUI() {
  // Wait until DOM is ready
  const grid = document.querySelector('.pf-grid');
  if (!grid) return;
  prefabContainer = grid;
  renderPrefabs();
}

// ── Expose for toolbar ──

export function canGroup() {
  return selected.size >= 2;
}

export function canUngroup() {
  return selected.size === 1 && [...selected][0].isGroup;
}
