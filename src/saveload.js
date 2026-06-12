import * as THREE from 'three';
import { objects, selected, state, sceneRefs, dropTargets } from './state.js';
import { createObj } from './objects.js';
import { history, actCreate } from './history.js';
import { refreshSelection } from './selection.js';
import { detachGizmo } from './gizmo/index.js';
import { cancelDropMode } from './drop-mode.js';

const SAVES_KEY = 'scene_editor_saves';

// Track which save slot is currently loaded
let currentSaveId = null;

export function getCurrentSaveId() { return currentSaveId; }
export function setCurrentSaveId(id) { currentSaveId = id; }

export function getSaves() {
  try {
    return JSON.parse(localStorage.getItem(SAVES_KEY)) || [];
  } catch { return []; }
}

function saveSaves(saves) {
  localStorage.setItem(SAVES_KEY, JSON.stringify(saves));
}

export function captureThumbnail() {
  const r = sceneRefs.renderer;
  // Temporarily hide the panel and gizmo for clean screenshot
  const panel = document.getElementById('panel');
  const gizmo = sceneRefs.advGizmo;
  const sgizmo = sceneRefs.simGizmo;
  const pnlDisp = panel.style.display;
  const gVis = gizmo.visible;
  const sgVis = sgizmo.visible;
  panel.style.display = 'none';
  gizmo.visible = false;
  sgizmo.visible = false;
  r.render(sceneRefs.scene, sceneRefs.camera);
  const dataUrl = r.domElement.toDataURL('image/png');
  // Restore
  panel.style.display = pnlDisp;
  gizmo.visible = gVis;
  sgizmo.visible = sgVis;
  return dataUrl;
}

const VALID_TYPES = ['box','sphere','cylinder','cone','pyramid','torus','halfdonut','donut','quarterdonut','halfball','quarterball','bowl','isotriangle','righttriangle','plane','image'];

function serializeMesh(m) {
  try {
    const isGrp = m.isGroup === true;
    const d = {
      type: m.userData && m.userData.type || 'unknown',
      pos: m.position ? m.position.toArray() : [0,0,0],
      rot: m.quaternion ? [m.quaternion.x, m.quaternion.y, m.quaternion.z, m.quaternion.w] : [0,0,0,1],
      scl: m.scale ? m.scale.toArray() : [1,1,1],
      name: (m.userData && (m.userData.name || m.userData.type)) || 'unknown',
    };
    if (isGrp) {
      // Group: serialize children with their LOCAL transforms
      d.children = m.children.map(c => serializeMesh(c));
    } else if (m.userData && m.userData.type === 'image' && m.userData.imageSrc) {
      d.color = '#ffffff';
      d.img = m.userData.imageSrc;
    } else {
      d.color = m && m.material && m.material.color
        ? '#' + m.material.color.getHexString()
        : '#ffffff';
    }
    return d;
  } catch (e) {
    console.error('serializeMesh error:', e, m);
    return { type: 'error', error: e.message };
  }
}

export function exportSceneData() {
  return objects.map(m => serializeMesh(m));
}

export function saveCurrentScene(name) {
  const data = exportSceneData();
  const thumbnail = captureThumbnail();
  const saves = getSaves();
  saves.push({
    id: Date.now(),
    name: name || 'Untitled ' + new Date().toLocaleString('id-ID'),
    timestamp: Date.now(),
    thumbnail,
    data,
  });
  saveSaves(saves);
  return saves;
}

export function overwriteSave(id, name) {
  const data = exportSceneData();
  const thumbnail = captureThumbnail();
  const saves = getSaves();
  const idx = saves.findIndex(s => s.id === id);
  if (idx >= 0) {
    saves[idx].data = data;
    saves[idx].thumbnail = thumbnail;
    saves[idx].timestamp = Date.now();
    if (name) saves[idx].name = name;
    saveSaves(saves);
  }
  return saves;
}

export function deleteSave(id) {
  const saves = getSaves().filter(s => s.id !== id);
  saveSaves(saves);
  return saves;
}

export { serializeMesh, deserializeEntry };

export function clearWorld() {
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
}

function deserializeEntry(entry) {
  // Handle groups with children
  if (entry.children && Array.isArray(entry.children)) {
    const group = new THREE.Group();
    group.userData.type = 'group';
    group.userData.isDropTarget = false;
    group.userData.name = entry.name || 'Group';
    if (entry.pos) group.position.fromArray(entry.pos);
    if (entry.rot) group.quaternion.set(entry.rot[0], entry.rot[1], entry.rot[2], entry.rot[3]);
    if (entry.scl) group.scale.fromArray(entry.scl);
    
    for (const child of entry.children) {
      const geomType = VALID_TYPES.includes(child.type) ? child.type : 'box';
      const mesh = createObj(geomType, child.img || null);
      mesh.userData.name = child.name || child.type;
      if (child.pos) mesh.position.fromArray(child.pos);
      if (child.rot) mesh.quaternion.set(child.rot[0], child.rot[1], child.rot[2], child.rot[3]);
      if (child.scl) mesh.scale.fromArray(child.scl);
      if (child.color && mesh.material) {
        mesh.material.color.set(child.color);
      }
      if (child.img) mesh.userData.imageSrc = child.img;
      group.add(mesh);
    }
    return group;
  }
  
  // Regular object
  const geomType = VALID_TYPES.includes(entry.type) ? entry.type : 'box';
  const m = createObj(geomType, entry.img || null);
  m.userData.name = entry.name || entry.type;
  if (entry.pos) m.position.fromArray(entry.pos);
  if (entry.rot) m.quaternion.set(entry.rot[0], entry.rot[1], entry.rot[2], entry.rot[3]);
  if (entry.scl) m.scale.fromArray(entry.scl);
  if (entry.color && geomType !== 'image' && !m.isGroup) {
    m.material.color.set(entry.color);
  }
  return m;
}

export function loadFromData(data) {
  clearWorld();
  for (const entry of data) {
    if (!entry.type) continue;
    const saved = state.nextColor;
    if (entry.color && entry.type !== 'image') {
      state.nextColor = entry.color;
    }
    const m = deserializeEntry(entry);
    state.nextColor = saved;
    history.execute(actCreate(m));
  }
  selected.clear();
  detachGizmo();
  refreshSelection();
}

// ── UI ──

export function showSaveLoadUI() {
  // Remove existing overlay if any
  const existing = document.getElementById('sl-overlay');
  if (existing) existing.remove();

  const ov = document.createElement('div');
  ov.id = 'sl-overlay';
  ov.style.cssText = `
    position:fixed;inset:0;z-index:9999;display:flex;align-items:center;
    justify-content:center;background:rgba(0,0,0,.5);
    backdrop-filter:blur(4px);font-family:system-ui,sans-serif;
  `;
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });

  const box = document.createElement('div');
  box.style.cssText = `
    background:rgba(255,255,255,.45);backdrop-filter:blur(30px);
    border-radius:20px;padding:24px;width:min(500px,90vw);max-height:80vh;
    overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.2);color:#222;
  `;

  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
  hdr.innerHTML = '<h2 style="margin:0;font-size:18px;">\u{1F4BE} Save / Load</h2>';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u2716';
  closeBtn.style.cssText = 'background:none;border:none;font-size:20px;cursor:pointer;color:#555;padding:4px 8px;';
  closeBtn.onclick = () => ov.remove();
  hdr.appendChild(closeBtn);
  box.appendChild(hdr);

  // Save buttons row
  const saveRow = document.createElement('div');
  saveRow.style.cssText = 'display:flex;gap:8px;margin-bottom:16px;';

  // Save (overwrite current)
  const saveBtn = document.createElement('button');
  saveBtn.textContent = '\u{1F4BE} Save';
  saveBtn.style.cssText = `
    flex:1;padding:12px;border:none;border-radius:12px;
    cursor:pointer;font-size:14px;font-weight:600;color:#fff;
    background:#0f3460;
  `;
  if (!currentSaveId) { saveBtn.style.opacity = '.4'; saveBtn.title = 'Load a save first, or use Save As'; }
  saveBtn.onclick = () => {
    if (!currentSaveId) { alert('Belum ada save yang di-load. Pake Save As buat bikin save baru.'); return; }
    const saves = getSaves();
    const cur = saves.find(s => s.id === currentSaveId);
    overwriteSave(currentSaveId, cur ? cur.name : undefined);
    ov.remove();
    showSaveLoadUI();
  };
  saveRow.appendChild(saveBtn);

  // Save As (always new)
  const saveAsBtn = document.createElement('button');
  saveAsBtn.textContent = '\u{1F4FD}\uFE0F Save As';
  saveAsBtn.style.cssText = `
    flex:1;padding:12px;border:none;border-radius:12px;
    cursor:pointer;font-size:14px;font-weight:600;color:#222;
    background:rgba(0,0,0,.08);
  `;
  saveAsBtn.onclick = () => {
    const name = prompt('Save as:', 'Scene ' + new Date().toLocaleString('id-ID'));
    if (!name) return;
    saveCurrentScene(name);
    ov.remove();
    showSaveLoadUI();
  };
  saveRow.appendChild(saveAsBtn);
  box.appendChild(saveRow);

  // Saved scenes list
  const saves = getSaves();
  if (saves.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'text-align:center;opacity:.5;font-size:13px;padding:32px 0;';
    empty.textContent = 'Belum ada savean';
    box.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    // Sort newest first
    const sorted = [...saves].sort((a, b) => b.timestamp - a.timestamp);

    sorted.forEach(s => {
      const card = document.createElement('div');
      card.style.cssText = `
        display:flex;align-items:center;gap:12px;padding:10px;
        border-radius:12px;background:rgba(255,255,255,.5);
        cursor:pointer;transition:.15s;
      `;
      card.onmouseenter = () => card.style.background = 'rgba(255,255,255,.7)';
      card.onmouseleave = () => card.style.background = 'rgba(255,255,255,.5)';

      // Thumbnail
      const thumb = document.createElement('img');
      thumb.src = s.thumbnail || '';
      thumb.style.cssText = 'width:56px;height:56px;border-radius:8px;object-fit:cover;background:#eee;flex-shrink:0;';
      card.appendChild(thumb);

      // Info
      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      const titleRow = document.createElement('div');
      titleRow.style.cssText = 'display:flex;align-items:center;gap:4px';
      const title = document.createElement('span');
      title.style.cssText = 'font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1';
      title.textContent = s.name;
      titleRow.appendChild(title);
      const renameBtn = document.createElement('button');
      renameBtn.textContent = '\u270F\uFE0F';
      renameBtn.style.cssText = `
        padding:2px 4px;border:none;border-radius:4px;cursor:pointer;
        font-size:11px;background:transparent;color:#888;flex-shrink:0;
      `;
      renameBtn.title = 'Rename';
      renameBtn.onclick = e => {
        e.stopPropagation();
        const newName = prompt('Rename:', s.name);
        if (newName && newName !== s.name) {
          const saves = getSaves();
          const found = saves.find(sv => sv.id === s.id);
          if (found) { found.name = newName; saveSaves(saves); }
          ov.remove();
          showSaveLoadUI();
        }
      };
      titleRow.appendChild(renameBtn);
      info.appendChild(titleRow);
      const date = document.createElement('div');
      date.style.cssText = 'font-size:11px;opacity:.5;';
      date.textContent = new Date(s.timestamp).toLocaleString('id-ID');
      info.appendChild(date);
      card.appendChild(info);

      // Load button
      const loadBtn = document.createElement('button');
      loadBtn.textContent = '\u25B6 Load';
      loadBtn.style.cssText = `
        padding:6px 12px;border:none;border-radius:8px;
        background:rgba(15,52,96,.15);cursor:pointer;font-size:12px;font-weight:600;
        white-space:nowrap;color:#0f3460;
      `;
      loadBtn.onclick = e => {
        e.stopPropagation();
        currentSaveId = s.id;
        loadFromData(s.data);
        ov.remove();
      };
      card.appendChild(loadBtn);

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.textContent = '\u{1F5D1}';
      delBtn.style.cssText = `
        padding:6px 8px;border:none;border-radius:8px;
        background:rgba(200,0,0,.08);cursor:pointer;font-size:13px;
        white-space:nowrap;color:#c00;
      `;
      delBtn.onclick = e => {
        e.stopPropagation();
        if (confirm('Delete "' + s.name + '"?')) {
          deleteSave(s.id);
          ov.remove();
          showSaveLoadUI();
        }
      };
      card.appendChild(delBtn);

      list.appendChild(card);
    });
    box.appendChild(list);
  }

  ov.appendChild(box);
  document.body.appendChild(ov);
}

// ── Sample projects ──

export const SAMPLES = {
  'Rumah': [
    { type: 'box', pos: [0, 0.6, 0], scl: [2, 1.2, 1.6], color: '#e8d4a2' },
    { type: 'cone', pos: [0, 1.5, 0], scl: [2.4, 0.7, 1.8], color: '#b54b3d' },
    { type: 'box', pos: [-0.6, 0.3, 0.81], scl: [0.5, 0.6, 0.02], color: '#6b3a2a' },
    { type: 'box', pos: [0.6, 0.3, 0.81], scl: [0.5, 0.6, 0.02], color: '#6b3a2a' },
    { type: 'box', pos: [0, 0.4, -0.81], scl: [0.6, 0.8, 0.02], color: '#4a3520' },
    { type: 'cylinder', pos: [0, 0, 0], scl: [0.06, 0.02, 0.06], color: '#8b7355' },
  ],
  'Gedung': [
    { type: 'box', pos: [0, 1.5, 0], scl: [2.4, 3, 1.6], color: '#7a8a9e' },
    { type: 'box', pos: [0, 3.2, 0], scl: [2.8, 0.15, 1.8], color: '#6b7b8f' },
    { type: 'box', pos: [-0.6, 2.2, 0.81], scl: [0.4, 0.5, 0.02], color: '#a8d8ea' },
    { type: 'box', pos: [0.6, 2.2, 0.81], scl: [0.4, 0.5, 0.02], color: '#a8d8ea' },
    { type: 'box', pos: [-0.6, 1.2, 0.81], scl: [0.4, 0.5, 0.02], color: '#a8d8ea' },
    { type: 'box', pos: [0.6, 1.2, 0.81], scl: [0.4, 0.5, 0.02], color: '#a8d8ea' },
    { type: 'box', pos: [0, 0.4, -0.81], scl: [0.5, 0.8, 0.02], color: '#4a3520' },
  ],
  'Gunung': [
    { type: 'cone', pos: [0, 0.8, 0], scl: [3, 1.6, 2.5], color: '#4a7c59' },
    { type: 'cone', pos: [-1, 1.2, 0.8], scl: [1.5, 0.8, 1.2], color: '#5a8c69' },
    { type: 'cone', pos: [0.8, 1.0, -0.6], scl: [1.2, 0.6, 1.0], color: '#5a8c69' },
    { type: 'cone', pos: [1.2, 0.4, 1.0], scl: [0.8, 0.4, 0.8], color: '#6a9c79' },
    { type: 'cone', pos: [-1.2, 0.3, -0.8], scl: [0.7, 0.3, 0.7], color: '#6a9c79' },
    { type: 'sphere', pos: [0, 1.8, 0], scl: [0.2, 0.2, 0.2], color: '#ffffff' },
    { type: 'cone', pos: [-0.5, 0.2, -1.5], scl: [0.6, 0.8, 0.6], color: '#3a6c49' },
    { type: 'cone', pos: [1.5, 0.2, -0.5], scl: [0.6, 0.8, 0.6], color: '#3a6c49' },
  ],
  'Bunga': [
    { type: 'cylinder', pos: [0, 0.5, 0], scl: [0.06, 1, 0.06], color: '#3a5c29' },
    { type: 'sphere', pos: [0, 1.1, 0], scl: [0.35, 0.2, 0.2], color: '#e94560' },
    { type: 'sphere', pos: [0.25, 1.0, 0.15], scl: [0.25, 0.18, 0.18], color: '#ff6b81' },
    { type: 'sphere', pos: [-0.25, 1.0, 0.15], scl: [0.25, 0.18, 0.18], color: '#ff6b81' },
    { type: 'sphere', pos: [0.15, 1.0, -0.25], scl: [0.25, 0.18, 0.18], color: '#ff6b81' },
    { type: 'sphere', pos: [-0.15, 1.0, -0.25], scl: [0.25, 0.18, 0.18], color: '#ff6b81' },
    { type: 'sphere', pos: [0, 1.3, 0], scl: [0.15, 0.15, 0.15], color: '#ffdd44' },
    { type: 'cylinder', pos: [0.6, 0.3, 0.6], scl: [0.04, 0.6, 0.04], color: '#3a5c29' },
    { type: 'sphere', pos: [0.6, 0.7, 0.6], scl: [0.2, 0.15, 0.15], color: '#ff6b81' },
    { type: 'cylinder', pos: [-0.5, 0.2, -0.5], scl: [0.04, 0.4, 0.04], color: '#3a5c29' },
    { type: 'sphere', pos: [-0.5, 0.5, -0.5], scl: [0.2, 0.15, 0.15], color: '#ff6b81' },
  ],
  'Rak Buku': [
    { type: 'box', pos: [0, 1.2, 0], scl: [1.6, 2.4, 0.6], color: '#8b6b4b' },
    { type: 'box', pos: [0, 0.6, 0.15], scl: [1.5, 0.08, 0.55], color: '#7a5c3d' },
    { type: 'box', pos: [0, 1.3, 0.15], scl: [1.5, 0.08, 0.55], color: '#7a5c3d' },
    { type: 'box', pos: [0, 2.0, 0.15], scl: [1.5, 0.08, 0.55], color: '#7a5c3d' },
    { type: 'box', pos: [-0.55, 1.0, 0.15], scl: [0.08, 0.7, 0.55], color: '#6b4b2d' },
    { type: 'box', pos: [0.55, 1.0, 0.15], scl: [0.08, 0.7, 0.55], color: '#6b4b2d' },
    { type: 'box', pos: [-0.55, 1.7, 0.15], scl: [0.08, 0.7, 0.55], color: '#6b4b2d' },
    { type: 'box', pos: [0.55, 1.7, 0.15], scl: [0.08, 0.7, 0.55], color: '#6b4b2d' },
    { type: 'box', pos: [-0.3, 1.7, 0.35], scl: [0.15, 0.6, 0.08], color: '#e94560' },
    { type: 'box', pos: [0.1, 1.6, 0.35], scl: [0.12, 0.5, 0.08], color: '#0f3460' },
    { type: 'box', pos: [0.35, 1.8, 0.35], scl: [0.1, 0.4, 0.08], color: '#16a34a' },
    { type: 'box', pos: [-0.25, 0.9, 0.35], scl: [0.15, 0.5, 0.08], color: '#f59e0b' },
    { type: 'box', pos: [0.15, 0.95, 0.35], scl: [0.12, 0.55, 0.08], color: '#8b5cf6' },
    { type: 'box', pos: [0.4, 0.8, 0.35], scl: [0.1, 0.35, 0.08], color: '#06b6d4' },
  ],
};

export function loadSample(name) {
  const data = SAMPLES[name];
  if (!data) return;
  loadFromData(data);
}
