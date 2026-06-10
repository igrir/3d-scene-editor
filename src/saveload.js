import * as THREE from 'three';
import { objects, selected, state, sceneRefs, dropTargets } from './state.js';
import { createObj } from './objects.js';
import { history, actCreate } from './history.js';
import { refreshSelection } from './selection.js';
import { detachGizmo } from './gizmo/index.js';
import { cancelDropMode } from './drop-mode.js';

const SAVES_KEY = 'scene_editor_saves';

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

export function exportSceneData() {
  return objects.map(m => {
    const d = {
      type: m.userData.type,
      pos: m.position.toArray(),
      rot: [m.quaternion.x, m.quaternion.y, m.quaternion.z, m.quaternion.w],
      scl: m.scale.toArray(),
    };
    if (m.userData.type === 'image' && m.userData.imageSrc) {
      d.color = '#ffffff';
      d.img = m.userData.imageSrc;
    } else if (!m.isGroup) {
      d.color = '#' + m.material.color.getHexString();
    }
    return d;
  });
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

export function deleteSave(id) {
  const saves = getSaves().filter(s => s.id !== id);
  saveSaves(saves);
  return saves;
}

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

export function loadFromData(data) {
  clearWorld();
  for (const entry of data) {
    if (!entry.type) continue;
    const saved = state.nextColor;
    if (entry.color && entry.type !== 'image') {
      state.nextColor = entry.color;
    }
    const m = createObj(entry.type, entry.img || null);
    state.nextColor = saved;
    if (entry.pos) m.position.fromArray(entry.pos);
    if (entry.rot) m.quaternion.set(entry.rot[0], entry.rot[1], entry.rot[2], entry.rot[3]);
    if (entry.scl) m.scale.fromArray(entry.scl);
    if (entry.color && entry.type !== 'image' && !m.isGroup) {
      m.material.color.set(entry.color);
    }
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

  // Save current button
  const saveBtn = document.createElement('button');
  saveBtn.textContent = '\u{1F4FD}\uFE0F Save Current Scene';
  saveBtn.style.cssText = `
    width:100%;padding:12px;border:none;border-radius:12px;
    background:rgba(0,0,0,.08);cursor:pointer;font-size:14px;font-weight:600;
    margin-bottom:16px;color:#222;
  `;
  saveBtn.onclick = () => {
    const name = prompt('Save as:', 'Scene ' + new Date().toLocaleString('id-ID'));
    if (!name) return;
    saveCurrentScene(name);
    ov.remove();
    showSaveLoadUI(); // refresh
  };
  box.appendChild(saveBtn);

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
      const title = document.createElement('div');
      title.style.cssText = 'font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      title.textContent = s.name;
      info.appendChild(title);
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
      loadBtn.onclick = e => { e.stopPropagation(); loadFromData(s.data); ov.remove(); };
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
