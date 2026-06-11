import * as THREE from 'three';
import Picker from 'vanilla-picker';
import { state, sceneRefs, selected } from './state.js';
import { getActiveGizmo, detachGizmo, attachGizmo } from './gizmo/index.js';
import { SAMPLES, loadSample } from './saveload.js';
import { history, actColor } from './history.js';

// ── Color data management ──
const SWATCHES_KEY = 'color_swatches';
const RECENT_KEY = 'recent_colors';
const DEFAULT_SWATCHES = ['#e94560', '#0f3460', '#16a34a', '#f59e0b', '#8b5cf6', '#06b6d4', '#f43f5e', '#ffffff'];

export function getSwatches() {
  try { return JSON.parse(localStorage.getItem(SWATCHES_KEY)) || [...DEFAULT_SWATCHES]; }
  catch { return [...DEFAULT_SWATCHES]; }
}
export function saveSwatches(arr) {
  localStorage.setItem(SWATCHES_KEY, JSON.stringify(arr));
}
export function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; }
  catch { return []; }
}
export function saveRecent(arr) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 5)));
}
// ── Recent / Custom swatches ──

export function trackColor(c) {
  const r = getRecent().filter(x => x !== c);
  r.unshift(c);
  saveRecent(r);
}
export function selectColor(c) {
  // Strip alpha from 8-char hex (#rrggbbaa → #rrggbb)
  if (/^#[0-9a-f]{8}$/i.test(c)) c = c.slice(0, 7);
  document.getElementById('cp').value = c;
  const cpPrev = document.getElementById('cp-preview');
  if (cpPrev) cpPrev.style.background = c;
  document.getElementById('ch').textContent = c;
  state.nextColor = c;
  const bc = document.getElementById('bar-color');
  if (bc) bc.style.background = c;
  if (state.dropMode && state.dropMode.ghost)
    state.dropMode.ghost.material.color.set(c);
  // Sync vanilla-picker
  if (window._syncColorPicker) window._syncColorPicker(c);
  renderRecent();
}

function applyColorToSelection(c) {
  const selMeshes = [...selected].filter(m => !m.isGroup);
  if (!selMeshes.length) return;
  const oc = selMeshes.map(m => m.material.color.getHex());
  const col = new THREE.Color(c);
  selMeshes.forEach(m => m.material.color.copy(col));
  history.execute(actColor(selMeshes, oc, col));
  refreshPanel();
}

export function selectColorFinal(c) {
  // Strip alpha from 8-char hex (#rrggbbaa → #rrggbb)
  if (/^#[0-9a-f]{8}$/i.test(c)) c = c.slice(0, 7);
  selectColor(c);
  trackColor(c);
  applyColorToSelection(c);
}

export function syncBarColorToSelection() {
  const selMeshes = [...selected].filter(m => !m.isGroup);
  if (selMeshes.length) {
    const c = '#' + selMeshes[0].material.color.getHexString();
    selectColor(c);
  }
}
export function deleteColor(c) {
  let sw = getSwatches().filter(x => x !== c);
  if (sw.length < 2) sw = [...DEFAULT_SWATCHES]; // keep at least some
  saveSwatches(sw);
  renderCustom();
}
export function addColor(c) {
  const sw = getSwatches();
  if (!sw.includes(c)) {
    sw.push(c);
    saveSwatches(sw);
    renderCustom();
  }
}
export function renderRecent() {
  const r = getRecent();
  const cont = document.getElementById('cc-recent');
  if (!cont) return;
  cont.innerHTML = '';
  r.forEach(c => {
    const sw = document.createElement('span');
    sw.setAttribute('data-c', c);
    sw.style.background = c;
    cont.appendChild(sw);
  });
}
export function renderCustom() {
  const sw = getSwatches();
  const cont = document.getElementById('cc-custom');
  if (!cont) return;
  cont.innerHTML = '';
  sw.forEach(c => {
    const sp = document.createElement('span');
    sp.setAttribute('data-c', c);
    sp.style.background = c;
    sp.setAttribute('draggable', 'true');
    cont.appendChild(sp);
  });
}

let editMode = false;
let holdTimer = null;
let dragItem = null, dragIdx = -1, dragClone = null;

export function enterEditMode() {
  editMode = true;
  const cont = document.getElementById('cc-custom');
  if (!cont) return;
  cont.classList.add('editing');
}
export function exitEditMode() {
  editMode = false;
  dragItem = null; dragIdx = -1;
  if (dragClone) { dragClone.remove(); dragClone = null; }
  document.querySelectorAll('#cc-custom span').forEach(el => el.classList.remove('drag-over'));
  const cont = document.getElementById('cc-custom');
  if (cont) cont.classList.remove('editing');
}

function initColorSwatchEvents() {
  const custom = document.getElementById('cc-custom');
  if (!custom) return;

  // Long press → edit mode
  custom.addEventListener('pointerdown', e => {
    const sw = e.target.closest('span[data-c]');
    if (!sw) return;
    if (editMode) {
      // Already in edit mode — start drag
      startDragItem(sw, e);
      return;
    }
    holdTimer = setTimeout(() => {
      enterEditMode();
    }, 600);
  });
  custom.addEventListener('pointerup', e => {
    clearTimeout(holdTimer);
    if (editMode && dragItem) {
      // Check if moved or click (delete)
      if (!document.body.classList.contains('dragging-swatch')) {
        // Tap in edit mode = delete
        const sw = e.target.closest('span[data-c]');
        if (sw) deleteColor(sw.dataset.c);
      }
      endDragItem();
    }
  });
  custom.addEventListener('pointermove', e => {
    if (editMode && dragItem) moveDragItem(e);
  });
  custom.addEventListener('pointercancel', () => {
    clearTimeout(holdTimer);
    endDragItem();
  });
}

function startDragItem(el, e) {
  const all = [...document.querySelectorAll('#cc-custom span')];
  dragIdx = all.indexOf(el);
  if (dragIdx < 0) return;
  dragItem = el;
  el.classList.add('dragging');
  document.body.classList.add('dragging-swatch');
}
function moveDragItem(e) {
  if (!dragItem) return;
  const all = [...document.querySelectorAll('#cc-custom span')];
  const hovered = document.elementFromPoint(e.clientX, e.clientY);
  const target = hovered && hovered.closest('#cc-custom span');
  if (target && target !== dragItem) {
    const toIdx = all.indexOf(target);
    if (toIdx >= 0 && toIdx !== dragIdx) {
      const sw = getSwatches();
      const [moved] = sw.splice(dragIdx, 1);
      sw.splice(toIdx, 0, moved);
      saveSwatches(sw);
      renderCustom();
      dragIdx = toIdx;
      // re-acquire dragItem ref after re-render
      dragItem = document.querySelectorAll('#cc-custom span')[dragIdx];
      dragItem.classList.add('dragging');
    }
  }
}
function endDragItem() {
  if (dragItem) dragItem.classList.remove('dragging');
  dragItem = null; dragIdx = -1;
  document.body.classList.remove('dragging-swatch');
}

function syncPopupState() {
  document.querySelectorAll('#gizmo-popup .gp-btn[data-sel]').forEach(b => {
    b.classList.toggle('on', b.dataset.sel === state.selectMode);
  });
  document.querySelectorAll('#gizmo-popup .gp-btn[data-giz]').forEach(b => {
    b.classList.toggle('on', b.dataset.giz === state.gizmoMode);
  });
  document.querySelectorAll('#tl-tools .tl-btn').forEach(b => b.classList.remove('active-tool'));
  if (state.toolMode === 'paint') document.getElementById('btn-paint').classList.add('active-tool');
  else if (state.toolMode === 'eyedrop') document.getElementById('btn-eyedrop').classList.add('active-tool');
}

// ── Modal helpers ──

export function showModal(title, json, okText, okCb) {
  const modalTitle = document.getElementById('modal-title');
  const modalJson = document.getElementById('modal-json');
  const modalOk = document.getElementById('modal-ok');
  const modal = document.getElementById('json-modal');
  modalTitle.textContent = title;
  modalJson.value = json;
  modalOk.textContent = okText;
  modalOk.style.display = okCb ? '' : 'none';
  modalOk.onclick = () => {
    try { okCb(modalJson.value); hideModal(); }
    catch (e) { alert('Error: ' + e.message); }
  };
  modal.classList.add('show');
  modalJson.focus();
  modalJson.select();
}

export function hideModal() {
  document.getElementById('json-modal').classList.remove('show');
}

// ── Info panel editor ──

export function populateEditor(m) {
  document.getElementById('inp-name').value = m.userData.type;
  document.getElementById('inp-px').value = m.position.x.toFixed(2);
  document.getElementById('inp-py').value = m.position.y.toFixed(2);
  document.getElementById('inp-pz').value = m.position.z.toFixed(2);
  document.getElementById('inp-sx').value = m.scale.x.toFixed(2);
  document.getElementById('inp-sy').value = m.scale.y.toFixed(2);
  document.getElementById('inp-sz').value = m.scale.z.toFixed(2);
  state.editingObject = m;

  const ip = document.getElementById('image-preview');
  if (m.userData.type === 'image') {
    ip.style.display = '';
    const preview = document.getElementById('img-preview');
    const prevContainer = preview.parentElement;
    let prevLabel = prevContainer.querySelector('.prev-label');
    if (m.userData.imageSrc) {
      preview.src = m.userData.imageSrc;
      preview.style.display = '';
      if (prevLabel) prevLabel.style.display = 'none';
    } else {
      preview.style.display = 'none';
      if (!prevLabel) {
        const lbl = document.createElement('div');
        lbl.className = 'prev-label';
        lbl.style.cssText = 'padding:16px;text-align:center;opacity:.4;font-size:11px;border-radius:8px;border:1px dashed #0f3460';
        lbl.textContent = 'Belum ada gambar — tap Ganti Image';
        preview.parentElement.insertBefore(lbl, preview.nextSibling);
      } else { prevLabel.style.display = ''; }
    }
  } else {
    ip.style.display = 'none';
  }
}

export function refreshPanel() {
  const si = document.getElementById('si');
  const sc = document.getElementById('sc');
  const ed = document.getElementById('si-editor');
  const panel = document.getElementById('panel');
  if (selected.size === 0) {
    si.style.display = '';
    ed.style.display = 'none';
    si.innerHTML = '<span class="l">Click object to select</span>';
    sc.textContent = '\u2014';
    state.editingObject = null;
    return;
  }
  sc.textContent = selected.size;
  if (selected.size >= 1) {
    const m = [...selected][0];
    si.style.display = 'none';
    ed.style.display = '';
    populateEditor(m);
    // Collapse panel when object selected — gives more 3D space
    if (panel) {
      panel.classList.add('collapsed');
      const icon = document.getElementById('pnl-toggle-icon');
      if (icon) icon.textContent = '\u25B2';
      setTimeout(() => { if (sceneRefs.resize) sceneRefs.resize(); }, 50);
    }
  }
}

// ── Create all DOM elements ──

export function createUI() {
  const cv = document.getElementById('cv');

  // ── io-float ──
  const io = createEl('div', { id: 'io-float' });
  io.appendChild(createEl('button', { id: 'btn-saveload', title: 'Save / Load', text: '\u{1F4BE}' }));
  io.appendChild(createEl('button', { id: 'btn-export', title: 'Export', text: '\u{1F4E4}' }));
  io.appendChild(createEl('button', { id: 'btn-import', title: 'Import', text: '\u{1F4E5}' }));
  const samplesBtn = createEl('button', { id: 'btn-samples', title: 'Open Sample', text: '\u{1F3D8}\uFE0F' });
  io.appendChild(samplesBtn);
  // Samples popup
  const samplesPopup = createEl('div', { id: 'samples-popup' });
  samplesPopup.style.display = 'none';
  samplesPopup.innerHTML = '<div class="sp-hdr">Sample Projects</div>' +
    Object.keys(SAMPLES).map(s => '<button class="sp-btn" data-sample="' + s + '">' + s + '</button>').join('');
  document.body.appendChild(samplesPopup);
  cv.appendChild(io);

  // ── tl-tools ──
  const tl = createEl('div', { id: 'tl-tools' });
  const selGroup = createEl('div');
  selGroup.style.cssText = 'display:flex;gap:3px;position:relative';
  selGroup.appendChild(createEl('button', { className: 'tl-btn on', id: 'sel-default', title: 'Click select', text: '\u{1F446}' }));
  selGroup.appendChild(createEl('button', { className: 'tl-btn', id: 'sel-rect', title: 'Rectangle select', text: '\u{1F532}' }));
  const gizmoBtn = createEl('button', { className: 'tl-btn', id: 'gizmo-toggle-tl', title: 'Toggle Gizmo', text: '\u2699\uFE0F' });
  selGroup.appendChild(gizmoBtn);
  // Gizmo popup
  const gp = createEl('div', { id: 'gizmo-popup' });
  gp.style.display = 'none';
  gp.innerHTML = '<div class="gp-hdr">Select</div><button class="gp-btn on" data-sel="default">\u{1F446} Click</button><button class="gp-btn" data-sel="rect">\u{1F532} Rect</button><div class="gp-hdr" style="margin-top:4px">Gizmo</div><button class="gp-btn" data-giz="simple">\u{1F518} Simple</button><button class="gp-btn" data-giz="advanced">\u{1F3AF} Advanced</button>';
  selGroup.appendChild(gp);
  tl.appendChild(selGroup);
  tl.appendChild(createEl('button', { className: 'tl-btn', id: 'btn-dup-tl', title: 'Duplicate selected', text: '\u{1F4CB}' }));
  tl.appendChild(createEl('button', { className: 'tl-btn bdel', id: 'btn-del-tl', title: 'Delete selected', text: '\u{1F5D1}\uFE0F' }));
  // Divider
  tl.appendChild(createEl('div', { style: 'height:1px;background:rgba(200,200,210,.3);margin:6px 4px;border-radius:1px' }));
  tl.appendChild(createEl('button', { className: 'tl-btn', id: 'btn-fliph', title: 'Flip Horizontal (scale.x *= -1)', text: '\u2194' }));
  tl.appendChild(createEl('button', { className: 'tl-btn', id: 'btn-flipv', title: 'Flip Vertical (scale.y *= -1)', text: '\u2195' }));
  // Divider
  tl.appendChild(createEl('div', { style: 'height:1px;background:rgba(200,200,210,.3);margin:6px 4px;border-radius:1px' }));
  tl.appendChild(createEl('button', { className: 'tl-btn', id: 'btn-group', title: 'Group selected', text: '\u{1F4E6}' }));
  tl.appendChild(createEl('button', { className: 'tl-btn', id: 'btn-ungroup', title: 'Ungroup selected', text: '\u{1F513}' }));
  tl.appendChild(createEl('button', { className: 'tl-btn', id: 'btn-paint', title: 'Paint bucket — tap object to color', text: '\u{1FAA3}' }));
  tl.appendChild(createEl('button', { className: 'tl-btn', id: 'btn-eyedrop', title: 'Eyedropper — tap object to pick color', text: '\u{1F489}' }));
  cv.appendChild(tl);

  // ── sel-overlay ──
  const selO = createEl('div', { id: 'sel-overlay' });
  selO.style.display = 'none';
  cv.appendChild(selO);

  // ── Panel ──
  const panel = createEl('div', { id: 'panel' });
  const panelBar = createEl('div', { id: 'panel-bar' });
  const barColor = createEl('span', { id: 'bar-color' });
  barColor.style.background = state.nextColor;
  panelBar.appendChild(barColor);
  
  // Vanilla Picker will be initialised later on the bar-color element
  
  const toggleIcon = createEl('span', { id: 'pnl-toggle-icon', text: '\u25B2' });
  panelBar.appendChild(toggleIcon);
  panelBar.appendChild(createEl('button', { className: 'uf-btn', id: 'btn-undo', disabled: true, text: '\u21A9' }));
  panelBar.appendChild(createEl('button', { className: 'uf-btn', id: 'btn-redo', disabled: true, text: '\u21AA' }));
  panel.appendChild(panelBar);

  const panelBody = createEl('div', { id: 'panel-body' });

  // Tabs
  const tabs = createEl('div', { id: 'panel-tabs' });
  const tabNames = [
    { tab: 'objects', label: '\u{1F4E6} Objects' },
    { tab: 'prefabs', label: '\u{1F3ED} Prefabs' },
    { tab: 'tools', label: '\u{1F527} Tools' },
    { tab: 'color', label: '\u{1F3A8} Color' },
    { tab: 'info', label: '\u{1F4CB} Info' },
    { tab: 'world', label: '\u{1F30D} World' },
  ];
  tabNames.forEach((t, i) => {
    const btn = createEl('button', { 'data-tab': t.tab, text: t.label });
    if (i === 0) btn.classList.add('on');
    tabs.appendChild(btn);
  });
  panelBody.appendChild(tabs);

  const content = createEl('div', { id: 'panel-content' });

  // ── Objects tab ──
  const objTab = createEl('div', { className: 'tab-content', 'data-tab': 'objects' });
  const og = createEl('div', { className: 'og' });
  const objTypes = [
    { t: 'box', label: 'Box' },
    { t: 'sphere', label: 'Sphere' },
    { t: 'cylinder', label: 'Cyl' },
    { t: 'cone', label: 'Cone' },
    { t: 'torus', label: 'Donut' },
    { t: 'halfdonut', label: 'Half D' },
    { t: 'quarterdonut', label: 'Q D' },
    { t: 'halfball', label: 'Half B' },
    { t: 'quarterball', label: 'Q B' },
    { t: 'bowl', label: 'Bowl' },
    { t: 'isotriangle', label: 'Iso △' },
    { t: 'righttriangle', label: 'Siku △' },
    { t: 'plane', label: 'Plane' },
    { t: 'image', label: 'Image' },
  ];
  objTypes.forEach(o => {
    const btn = createEl('button', { className: 'ob', 'data-t': o.t });
    btn.innerHTML = `<span class="em"><img class="ob-icon" data-t="${o.t}" alt="" style="width:22px;height:22px;border-radius:3px;vertical-align:middle;"></span><span>${o.label}</span>`;
    og.appendChild(btn);
  });
  objTab.appendChild(og);
  const imgInput = createEl('input', { type: 'file', id: 'image-file-input', accept: 'image/*' });
  imgInput.style.display = 'none';
  objTab.appendChild(imgInput);
  content.appendChild(objTab);

  // ── Prefabs tab ──
  const prefabTab = createEl('div', { className: 'tab-content', 'data-tab': 'prefabs' });
  prefabTab.style.display = 'none';
  prefabTab.appendChild(createHdr('Prefabs'));
  const pfGrid = createEl('div', { className: 'pf-grid' });
  pfGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:4px';
  prefabTab.appendChild(pfGrid);
  content.appendChild(prefabTab);

  // ── Tools tab ──
  const toolsTab = createEl('div', { className: 'tab-content', 'data-tab': 'tools' });
  toolsTab.style.display = 'none';
  toolsTab.appendChild(createHdr('Gizmo Mode'));
  const gizmoBg = createEl('div', { className: 'bg' });
  gizmoBg.style.marginBottom = '6px';
  gizmoBg.appendChild(createGBtn({ mode: 'advanced', label: '\u{1F3AF} Advanced' }));
  gizmoBg.appendChild(createGBtn({ mode: 'simple', label: '\u{1F518} Simple', on: true }));
  toolsTab.appendChild(gizmoBg);

  const xzSection = createEl('div', { id: 'xz-mode-section' });
  const xzHdr = document.createElement('div');
  xzHdr.className = 'hdr';
  xzHdr.textContent = 'XZ Move Mode';
  xzSection.appendChild(xzHdr);
  const xzBg = createEl('div', { className: 'bg' });
  xzBg.style.marginBottom = '8px';
  xzBg.appendChild(createGBtn({ xzmode: 'plane', label: '\u{1F3D4}\uFE0F Plane' }));
  xzBg.appendChild(createGBtn({ xzmode: 'surface', label: '\u{1F3AF} Surface', on: true }));
  xzSection.appendChild(xzBg);
  toolsTab.appendChild(xzSection);

  toolsTab.appendChild(createHdr('Actions'));
  const actionRow = createEl('div', { className: 'row' });
  actionRow.appendChild(createEl('button', { className: 'ba bs', id: 'bdup', text: '\u{1F4CB} Duplicate' }));
  actionRow.appendChild(createEl('button', { className: 'ba bd', id: 'bddel', text: '\u{1F5D1}\uFE0F Delete' }));
  actionRow.appendChild(createEl('button', { className: 'ba bs', id: 'bdrst', text: '\u{1F504} Reset' }));
  toolsTab.appendChild(actionRow);
  content.appendChild(toolsTab);

  // ── Color tab ──
  const colorTab = createEl('div', { className: 'tab-content', 'data-tab': 'color' });
  colorTab.style.display = 'none';

  // Color preview (hidden native picker kept for compat, visual preview opens vanilla-picker)
  const cp = createEl('input', { type: 'color', id: 'cp', value: '#e94560' });
  cp.style.display = 'none';
  colorTab.appendChild(cp);
  const cr = createEl('div', { className: 'cr' });
  cr.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer';
  const cpPreview = createEl('span', { id: 'cp-preview' });
  cpPreview.style.cssText = 'width:32px;height:32px;border-radius:8px;border:2px solid rgba(0,0,0,.08);flex-shrink:0';
  cpPreview.style.background = state.nextColor;
  cr.appendChild(cpPreview);
  const ch = createEl('span', { id: 'ch' });
  ch.style.cssText = 'font-size:12px;font-family:monospace;color:#444;flex:1';
  ch.textContent = state.nextColor;
  cr.appendChild(ch);
  colorTab.appendChild(cr);

  // Recent colors
  const recentHdr = createEl('div', { className: 'hdr', text: 'Recent' });
  colorTab.appendChild(recentHdr);
  const ccRecent = createEl('div', { id: 'cc-recent', className: 'cc' });
  ccRecent.style.marginBottom = '6px';
  colorTab.appendChild(ccRecent);

  // Divider
  const sep = createEl('div');
  sep.style.cssText = 'height:1px;background:rgba(0,0,0,.08);margin:6px 0';
  colorTab.appendChild(sep);

  // Custom swatches + add button
  const swHdrRow = createEl('div');
  swHdrRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px';
  const swHdr = createEl('div', { className: 'hdr', text: 'Swatches' });
  swHdr.style.cssText = 'flex:1;margin-bottom:0';
  swHdrRow.appendChild(swHdr);
  const addBtn = createEl('button', { id: 'add-swatch', text: '\u2795' });
  swHdrRow.appendChild(addBtn);
  colorTab.appendChild(swHdrRow);

  const ccCustom = createEl('div', { id: 'cc-custom', className: 'cc' });
  colorTab.appendChild(ccCustom);
  content.appendChild(colorTab);

  // ── Info tab ──
  const infoTab = createEl('div', { className: 'tab-content', 'data-tab': 'info' });
  infoTab.style.display = 'none';
  const siHdr = document.createElement('div');
  siHdr.className = 'hdr';
  siHdr.innerHTML = 'Selection <span id="sc" style="opacity:.6;color:#444">\u2014</span>';
  infoTab.appendChild(siHdr);

  const siEditor = createEl('div', { id: 'si-editor' });
  siEditor.style.display = 'none';

  // Name
  const nameGroup = createEl('div');
  nameGroup.style.marginBottom = '6px';
  nameGroup.appendChild(createLabel('Name'));
  const nameInput = createEl('input', { type: 'text', id: 'inp-name' });
  nameInput.style.cssText = 'width:100%;padding:5px 8px;background:#f5f5f7;border:1px solid #0f3460;border-radius:4px;color:#333;font-size:11px';
  nameGroup.appendChild(nameInput);
  siEditor.appendChild(nameGroup);

  // Position grid
  const posGrid = createEl('div', {});
  posGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:6px';
  ['X', 'Y', 'Z'].forEach(letter => {
    const g = createEl('div');
    g.appendChild(createLabel('Pos ' + letter));
    g.appendChild(createNumInput('inp-p' + letter.toLowerCase()));
    posGrid.appendChild(g);
  });
  siEditor.appendChild(posGrid);

  // Scale grid
  const sclGrid = createEl('div', {});
  sclGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px';
  ['X', 'Y', 'Z'].forEach(letter => {
    const g = createEl('div');
    g.appendChild(createLabel('Scale ' + letter));
    g.appendChild(createNumInput('inp-s' + letter.toLowerCase(), 0.01));
    sclGrid.appendChild(g);
  });
  siEditor.appendChild(sclGrid);

  // Image preview
  const imgPreview = createEl('div', { id: 'image-preview' });
  imgPreview.style.display = 'none';
  const pv = document.createElement('img');
  pv.id = 'img-preview';
  pv.style.cssText = 'max-width:100%;max-height:120px;border-radius:8px;border:1px solid #0f3460;object-fit:contain;background:rgba(0,0,0,.3)';
  imgPreview.appendChild(pv);
  const imgLabel = createLabel('Image');
  imgLabel.style.cssText = 'font-size:9px;opacity:.5;display:block;margin-top:4px;margin-bottom:2px';
  imgPreview.appendChild(imgLabel);
  const changeBtn = createEl('button', { className: 'ba bs', id: 'btn-change-img' });
  changeBtn.style.cssText = 'min-height:36px;font-size:11px';
  changeBtn.textContent = '\u{1F5BC}\uFE0F Ganti Image';
  imgPreview.appendChild(changeBtn);
  const imgEditFile = createEl('input', { type: 'file', id: 'img-edit-file', accept: 'image/*' });
  imgEditFile.style.display = 'none';
  imgPreview.appendChild(imgEditFile);
  siEditor.appendChild(imgPreview);

  infoTab.appendChild(siEditor);

  const siPlaceholder = document.createElement('div');
  siPlaceholder.className = 'si';
  siPlaceholder.id = 'si';
  siPlaceholder.innerHTML = '<span class="l">Click object to select</span>';
  infoTab.appendChild(siPlaceholder);

  content.appendChild(infoTab);

  // ── World tab ──
  const worldTab = createEl('div', { className: 'tab-content', 'data-tab': 'world' });
  worldTab.style.display = 'none';
  worldTab.appendChild(createHdr('Grid'));
  const gridBg = createEl('div', { className: 'bg' });
  gridBg.style.marginBottom = '6px';
  gridBg.appendChild(createEl('button', { className: 'gb on', id: 'grid-btn', text: '\u{1F532} Tampilkan' }));
  worldTab.appendChild(gridBg);
  // Grid color & opacity
  const gridColorRow = createEl('div', { className: 'cr' });
  gridColorRow.style.cssText = 'margin-bottom:4px;gap:6px;display:flex;align-items:center';
  gridColorRow.appendChild(createSmallLabel('Warna'));
  const gridColor = createEl('input', { type: 'color', id: 'grid-color', value: '#5555aa' });
  gridColorRow.appendChild(gridColor);
  worldTab.appendChild(gridColorRow);
  const gridOpRow = createEl('div');
  gridOpRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px';
  gridOpRow.appendChild(createSmallLabel('Opacity'));
  const gridOp = createEl('input', { type: 'range', id: 'grid-opacity', min: '0', max: '1', step: '0.05', value: '0.6' });
  gridOp.style.cssText = 'flex:1;height:24px';
  gridOpRow.appendChild(gridOp);
  const gridOpVal = createEl('span', { id: 'grid-opacity-val', text: '0.6' });
  gridOpVal.style.cssText = 'font-size:11px;font-family:monospace;color:#444;min-width:24px;text-align:right';
  gridOpRow.appendChild(gridOpVal);
  worldTab.appendChild(gridOpRow);

  worldTab.appendChild(createHdr('Light'));
  const lightBg = createEl('div', { className: 'bg', style: '' });
  const lhGroup = createEl('div');
  lhGroup.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:4px;margin-bottom:8px';
  lhGroup.appendChild(createLabel('Sun Rotation H'));
  const lh = createEl('input', { type: 'range', id: 'light-h', min: '0', max: '360', value: '45' });
  lh.style.width = '100%';
  lhGroup.appendChild(lh);
  lightBg.appendChild(lhGroup);

  const lvGroup = createEl('div');
  lvGroup.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:4px;margin-bottom:8px';
  lvGroup.appendChild(createLabel('Sun Rotation V'));
  const lv = createEl('input', { type: 'range', id: 'light-v', min: '5', max: '85', value: '45' });
  lv.style.width = '100%';
  lvGroup.appendChild(lv);
  lightBg.appendChild(lvGroup);
  worldTab.appendChild(lightBg);

  const sunCr = createEl('div', { className: 'cr' });
  sunCr.style.marginBottom = '4px';
  sunCr.appendChild(createSmallLabel('Sun Color'));
  sunCr.appendChild(createEl('input', { type: 'color', id: 'sun-color', value: '#ffeedd' }));
  worldTab.appendChild(sunCr);

  worldTab.appendChild(createHdr('Shadows'));
  const shBg = createEl('div', { className: 'bg' });
  shBg.appendChild(createEl('button', { className: 'gb on', id: 'soft-shadow-btn', text: '\u2601\uFE0F Soft' }));
  shBg.appendChild(createEl('button', { className: 'gb', id: 'ao-btn', text: '\u{1F311} AO' }));
  worldTab.appendChild(shBg);

  worldTab.appendChild(createHdr('Environment'));
  const bgCr = createEl('div', { className: 'cr' });
  bgCr.style.marginBottom = '4px';
  bgCr.appendChild(createSmallLabel('Background'));
  bgCr.appendChild(createEl('input', { type: 'color', id: 'bg-color', value: '#1a1a2e' }));
  worldTab.appendChild(bgCr);

  const ambCr = createEl('div', { className: 'cr' });
  ambCr.appendChild(createSmallLabel('Ambient'));
  ambCr.appendChild(createEl('input', { type: 'color', id: 'ambient-color', value: '#404060' }));
  worldTab.appendChild(ambCr);

  content.appendChild(worldTab);

  panelBody.appendChild(content);
  panel.appendChild(panelBody);
  cv.appendChild(panel);
  panel.classList.add('collapsed');

  // ── JSON Modal ──
  const modal = createEl('div', { id: 'json-modal' });
  const box = createEl('div', { className: 'box' });
  const mt = document.createElement('div');
  mt.style.cssText = 'font-weight:600;font-size:13px';
  mt.id = 'modal-title';
  mt.textContent = 'JSON';
  box.appendChild(mt);
  const ta = document.createElement('textarea');
  ta.id = 'modal-json';
  ta.spellcheck = false;
  ta.setAttribute('wrap', 'off');
  box.appendChild(ta);
  const modalRow = createEl('div', { className: 'row' });
  modalRow.appendChild(createEl('button', { className: 'btn-sec', id: 'modal-cancel', text: 'Cancel' }));
  const okBtn = createEl('button', { className: 'btn-primary', id: 'modal-ok' });
  okBtn.style.display = 'none';
  okBtn.textContent = 'Import';
  modalRow.appendChild(okBtn);
  box.appendChild(modalRow);
  modal.appendChild(box);
  cv.appendChild(modal);

  // ── Wire simple (safe) handlers ──

  // Tab switching with height animation
  function animateTab(tabName) {
    const oldActive = content.querySelector('.tab-content:not([style*="display: none"])');
    const newTab = content.querySelector(`.tab-content[data-tab="${tabName}"]`);
    if (!newTab || oldActive === newTab) return;

    // Measure old height (old tab still visible, new tab hidden)
    const oldH = content.scrollHeight;

    // Temporarily show new tab to measure its height (position out of flow)
    newTab.style.display = '';
    const newH = newTab.scrollHeight;

    // Hide old tab, keep new tab visible
    if (oldActive) oldActive.style.display = 'none';

    // Animate height
    content.style.overflow = 'hidden';
    content.style.height = oldH + 'px';
    content.offsetHeight; // force reflow
    content.style.height = newH + 'px';

    // Reset after transition
    const onEnd = () => {
      content.style.height = '';
      content.style.overflow = '';
      content.removeEventListener('transitionend', onEnd);
    };
    content.addEventListener('transitionend', onEnd, { once: true });
  }

  tabs.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.querySelectorAll('button').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      animateTab(btn.dataset.tab);
    });
  });

  // Panel collapse — bar jadi toggle (kecuali undo/redo)
  document.getElementById('btn-undo').addEventListener('click', e => e.stopPropagation());
  document.getElementById('btn-redo').addEventListener('click', e => e.stopPropagation());
  // Color picker popup — anchored outside panel to avoid overflow: hidden clip
  const pickerAnchor = createEl('div', { id: 'picker-anchor' });
  pickerAnchor.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;width:0;height:0';
  document.body.appendChild(pickerAnchor);
  
  const picker = new Picker({
    parent: pickerAnchor,
    color: state.nextColor,
    popup: 'top',
    alpha: false,
    editorFormat: 'hex',
    onChange: function(color) {
      selectColor(color.hex);
    },
    onDone: function(color) {
      selectColorFinal(color.hex);
    },
  });
  
  function openPickerNear(el) {
    const r = el.getBoundingClientRect();
    pickerAnchor.style.left = r.left + 'px';
    pickerAnchor.style.top = r.top + 'px';
    picker.show();
  }
  document.getElementById('bar-color').addEventListener('click', e => {
    e.stopPropagation();
    openPickerNear(e.currentTarget);
  });
  document.getElementById('cp-preview').addEventListener('click', e => {
    e.stopPropagation();
    openPickerNear(e.currentTarget);
  });
  document.getElementById('ch').addEventListener('click', e => {
    e.stopPropagation();
    openPickerNear(e.currentTarget);
  });
  // Sync picker when color changes from outside (swatches, eyedropper)
  window._syncColorPicker = function(c) {
    picker.setColor(c, { silent: true });
  };
  panelBar.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    const icon = document.getElementById('pnl-toggle-icon');
    if (icon) icon.textContent = panel.classList.contains('collapsed') ? '\u25B2' : '\u25BC';
    setTimeout(() => { if (sceneRefs.resize) sceneRefs.resize(); }, 50);
  });

  // Gizmo mode toggle
  document.querySelectorAll('#panel .gb[data-mode]').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#panel .gb[data-mode]').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      state.gizmoMode = b.dataset.mode;
      updateXZSection();
      if (selected.size === 1) {
        detachGizmo();
        attachGizmo([...selected][0]);
      }
      syncPopupState();
    });
  });
  updateXZSection();

  // XZ Move mode
  document.querySelectorAll('#panel [data-xzmode]').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#panel [data-xzmode]').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      state.xzMode = b.dataset.xzmode;
    });
  });

  // Grid toggle
  document.getElementById('grid-btn').addEventListener('click', () => {
    const b = document.getElementById('grid-btn');
    sceneRefs.gridHelper.visible = !sceneRefs.gridHelper.visible;
    b.classList.toggle('on');
    b.textContent = sceneRefs.gridHelper.visible ? '\u{1F532} Tampilkan' : '\u{1F533} Sembunyikan';
  });

  // Grid color & opacity
  function updateGridColor() {
    const c = document.getElementById('grid-color').value;
    const gh = sceneRefs.gridHelper;
    if (!gh || !gh.geometry || !gh.geometry.attributes.color) return;
    const col = gh.geometry.attributes.color;
    const cMain = new THREE.Color(c);
    const cCenter = cMain.clone().multiplyScalar(1.3); // brighter for center axis
    const divs = 20, center = divs / 2;
    for (let i = 0, j = 0; i <= divs; i++) {
      const cc = i === center ? cCenter : cMain;
      for (let v = 0; v < 4; v++) {
        col.array[j++] = cc.r;
        col.array[j++] = cc.g;
        col.array[j++] = cc.b;
      }
    }
    col.needsUpdate = true;
  }
  
  document.getElementById('grid-color').addEventListener('input', updateGridColor);
  document.getElementById('grid-opacity').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    const mats = Array.isArray(sceneRefs.gridHelper.material) ? sceneRefs.gridHelper.material : [sceneRefs.gridHelper.material];
    mats.forEach(m => { m.transparent = true; m.opacity = v; m.needsUpdate = true; });
    document.getElementById('grid-opacity-val').textContent = v.toFixed(2);
  });

  // Lighting controls
  document.getElementById('light-h').addEventListener('input', e => {
    state.sunHA = parseFloat(e.target.value);
    updateSun();
  });
  document.getElementById('light-v').addEventListener('input', e => {
    state.sunVA = parseFloat(e.target.value);
    updateSun();
  });
  document.getElementById('sun-color').addEventListener('input', e => {
    sceneRefs.sun.color.set(e.target.value);
  });
  document.getElementById('bg-color').addEventListener('input', e => {
    sceneRefs.scene.background = new THREE.Color(e.target.value);
  });
  document.getElementById('ambient-color').addEventListener('input', e => {
    sceneRefs.ambient.color.set(e.target.value);
  });

  // Soft shadow toggle
  document.getElementById('soft-shadow-btn').addEventListener('click', () => {
    const b = document.getElementById('soft-shadow-btn');
    const on = b.classList.contains('on');
    document.querySelectorAll('#soft-shadow-btn,#ao-btn').forEach(x => x.classList.remove('on'));
    if (on) {
      sceneRefs.renderer.shadowMap.type = THREE.PCFShadowMap;
      b.classList.remove('on');
    } else {
      b.classList.add('on');
      sceneRefs.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
  });

  // AO toggle
  document.getElementById('ao-btn').addEventListener('click', () => {
    const b = document.getElementById('ao-btn');
    b.classList.toggle('on');
    state.ssaoEnabled = b.classList.contains('on');
    sceneRefs.ssaoPass.enabled = state.ssaoEnabled;
  });

  // Modal cancel / background click
  document.getElementById('modal-cancel').addEventListener('click', hideModal);
  modal.addEventListener('click', e => { if (e.target === modal) hideModal(); });

  // Change image button
  document.getElementById('btn-change-img').addEventListener('click', () => {
    document.getElementById('img-edit-file').click();
  });

  // Image edit file upload
  document.getElementById('img-edit-file').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f || !state.editingObject) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const src = ev.target.result;
      state.editingObject.userData.imageSrc = src;
      const tx = new THREE.TextureLoader().load(src);
      tx.colorSpace = 'srgb';
      state.editingObject.material.map = tx;
      state.editingObject.material.needsUpdate = true;
      const img = new Image();
      img.onload = () => {
        const a = img.width / img.height;
        state.editingObject.geometry.dispose();
        state.editingObject.geometry = new THREE.PlaneGeometry(1, a);
        state.editingObject.geometry.computeVertexNormals();
        document.getElementById('img-preview').src = src;
      };
      img.src = src;
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  });

  // Prevent context menu on panel
  document.getElementById('panel').addEventListener('contextmenu', e => e.preventDefault());

  function setTool(tool) {
    state.toolMode = tool;
    document.querySelectorAll('#tl-tools .tl-btn').forEach(b => b.classList.remove('on'));
    if (tool === 'select') {
      const selBtn = document.getElementById('sel-' + state.selectMode);
      if (selBtn) selBtn.classList.add('on');
    }
    syncPopupState();
  }

  // ── Selection tool toggles ──
  document.getElementById('sel-default').addEventListener('click', () => {
    setTool('select');
    state.selectMode = 'default';
    document.getElementById('sel-default').classList.add('on');
    document.getElementById('sel-overlay').style.display = 'none';
    state.rectDragging = false;
    state.rectStart = null;
    state.rectEnd = null;
    syncPopupState();
  });
  document.getElementById('sel-rect').addEventListener('click', () => {
    setTool('select');
    state.selectMode = 'rect';
    document.getElementById('sel-rect').classList.add('on');
    syncPopupState();
  });

  // ── Gizmo toggle popup ──
  document.getElementById('gizmo-toggle-tl').addEventListener('click', e => {
    e.stopPropagation();
    const popup = document.getElementById('gizmo-popup');
    popup.style.display = popup.style.display === 'none' ? '' : 'none';
    syncPopupState();
  });
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('#gizmo-popup') && !e.target.closest('#gizmo-toggle-tl')) {
      document.getElementById('gizmo-popup').style.display = 'none';
    }
  });
  document.querySelectorAll('#gizmo-popup .gp-btn[data-sel]').forEach(b => {
    b.addEventListener('click', () => {
      document.getElementById('gizmo-popup').style.display = 'none';
      if (b.dataset.sel === 'default') document.getElementById('sel-default').click();
      else document.getElementById('sel-rect').click();
    });
  });
  document.querySelectorAll('#gizmo-popup .gp-btn[data-giz]').forEach(b => {
    b.addEventListener('click', () => {
      state.gizmoMode = b.dataset.giz;
      document.getElementById('gizmo-popup').style.display = 'none';
      // Re-attach gizmo with new mode
      const sel = [...selected];
      detachGizmo();
      if (sel.length) attachGizmo(sel[0], sel.length > 1 ? sel : null);
      syncPopupState();
    });
  });

  // ── Samples popup ──
  document.getElementById('btn-samples').addEventListener('click', e => {
    e.stopPropagation();
    const popup = document.getElementById('samples-popup');
    const btn = e.currentTarget;
    const r = btn.getBoundingClientRect();
    popup.style.display = popup.style.display === 'none' ? '' : 'none';
    popup.style.position = 'fixed';
    popup.style.left = (r.right - popup.offsetWidth) + 'px';
    popup.style.top = (r.bottom + 6) + 'px';
  });
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('#samples-popup') && !e.target.closest('#btn-samples')) {
      document.getElementById('samples-popup').style.display = 'none';
    }
  });
  document.getElementById('samples-popup').addEventListener('click', e => {
    const btn = e.target.closest('.sp-btn');
    if (!btn) return;
    const name = btn.dataset.sample;
    if (confirm('Load sample "' + name + '"? Current scene will be cleared.')) {
      loadSample(name);
      document.getElementById('samples-popup').style.display = 'none';
    }
  });

  // ── Paint bucket tool ──
  document.getElementById('btn-paint').addEventListener('click', () => {
    setTool(state.toolMode === 'paint' ? 'select' : 'paint');
    document.getElementById('gizmo-popup').style.display = 'none';
  });

  // ── Eyedropper tool ──
  document.getElementById('btn-eyedrop').addEventListener('click', () => {
    setTool(state.toolMode === 'eyedrop' ? 'select' : 'eyedrop');
    document.getElementById('gizmo-popup').style.display = 'none';
  });

  // ── Number scrubbers for info inputs ──
  document.querySelectorAll('#si-editor input[type="number"]').forEach(inp => {
    setupScrubber(inp);
  });

  // ── Focus snapshot for info inputs ──
  document.querySelectorAll('#si-editor input').forEach(inp => {
    inp.addEventListener('focus', () => {
      if (state.editingObject) {
        state.focusSnapshot = {
          pos: state.editingObject.position.clone(),
          scl: state.editingObject.scale.clone(),
          name: state.editingObject.userData.type,
        };
      }
    });
  });
}

// ── Helpers ──

function createEl(tag, attrs = {}) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') el.textContent = v;
    else if (k === 'className') el.className = v;
    else if (k === 'disabled') el.disabled = v;
    else el.setAttribute(k, v);
  }
  return el;
}

function createHdr(text) {
  const el = document.createElement('div');
  el.className = 'hdr';
  el.textContent = text;
  return el;
}

function createLabel(text) {
  const el = document.createElement('label');
  el.style.cssText = 'font-size:9px;opacity:.8;display:block;margin-bottom:2px;color:#333';
  el.textContent = text;
  return el;
}

function createSmallLabel(text) {
  const el = document.createElement('span');
  el.style.cssText = 'font-size:10px;opacity:.7;min-width:70px;color:#444';
  el.textContent = text;
  return el;
}

function createNumInput(id, min) {
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.id = id;
  inp.step = '0.01';
  if (min !== undefined) inp.min = String(min);
  inp.style.cssText = 'width:100%;padding:5px 6px;background:#f5f5f7;border:1px solid #ddd;border-radius:4px;color:#333;font-size:11px;font-family:monospace';
  return inp;
}

function createGBtn(data) {
  let el;
  if (data.mode) {
    el = createEl('button', { className: 'gb' + (data.on ? ' on' : ''), 'data-mode': data.mode, text: data.label });
  } else if (data.xzmode) {
    el = createEl('button', { className: 'gb' + (data.on ? ' on' : ''), 'data-xzmode': data.xzmode, text: data.label });
  }
  return el;
}

// ── Sun update ──
function updateSun() {
  const h = state.sunHA * Math.PI / 180;
  const v = state.sunVA * Math.PI / 180;
  const r = 12;
  sceneRefs.sun.position.set(r * Math.cos(h) * Math.cos(v), r * Math.sin(v), r * Math.sin(h) * Math.cos(v));
}

// ── XZ section visibility ──
function updateXZSection() {
  const el = document.getElementById('xz-mode-section');
  if (el) el.style.display = state.gizmoMode === 'simple' ? '' : 'none';
}

// ── Scrubber setup ──
function setupScrubber(inp) {
  inp.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const val = parseFloat(inp.value) || 0;
    state.scrubState = {
      inp,
      startX: e.clientX,
      startVal: val,
      step: parseFloat(inp.step) || 0.01,
      scrubbing: false,
    };
    if (state.editingObject) {
      state.focusSnapshot = {
        pos: state.editingObject.position.clone(),
        scl: state.editingObject.scale.clone(),
        name: state.editingObject.userData.type,
      };
    }
  });

  inp.addEventListener('pointermove', e => {
    if (!state.scrubState || state.scrubState.inp !== inp) return;
    const dx = e.clientX - state.scrubState.startX;
    if (!state.scrubState.scrubbing && Math.abs(dx) > 4) {
      state.scrubState.scrubbing = true;
      inp.setPointerCapture(e.pointerId);
      inp.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }
    if (!state.scrubState.scrubbing) return;
    e.preventDefault();
    const step = state.scrubState.step;
    const newVal = Math.round((state.scrubState.startVal + dx * step * 0.5) / step) * step;
    inp.value = (inp.hasAttribute('min') ? Math.max(parseFloat(inp.min), newVal) : newVal).toFixed(2);
    if (state.editingObject) {
      const m = state.editingObject;
      m.position.set(
        parseFloat(document.getElementById('inp-px').value) || 0,
        parseFloat(document.getElementById('inp-py').value) || 0,
        parseFloat(document.getElementById('inp-pz').value) || 0
      );
      m.scale.set(
        Math.max(0.01, parseFloat(document.getElementById('inp-sx').value) || 0.01),
        Math.max(0.01, parseFloat(document.getElementById('inp-sy').value) || 0.01),
        Math.max(0.01, parseFloat(document.getElementById('inp-sz').value) || 0.01)
      );
      const g = getActiveGizmo();
      if (g.visible && state.targetObject) {
        if (selected.size > 1) {
          const c = new THREE.Vector3();
          for (const om of selected) c.add(om.position);
          c.divideScalar(selected.size);
          g.position.copy(c);
        } else {
          g.position.copy(state.targetObject.position);
        }
      }
    }
  });

  inp.addEventListener('pointerup', e => {
    if (!state.scrubState || state.scrubState.inp !== inp) return;
    if (state.scrubState.scrubbing) {
      inp.releasePointerCapture(e.pointerId);
      inp.dispatchEvent(new Event('change'));
    }
    inp.style.cursor = '';
    document.body.style.userSelect = '';
    state.scrubState = null;
  });

  inp.addEventListener('pointercancel', () => {
    if (!state.scrubState || state.scrubState.inp !== inp) return;
    if (state.scrubState.scrubbing) inp.releasePointerCapture(0);
    inp.style.cursor = '';
    document.body.style.userSelect = '';
    state.scrubState = null;
  });

  // ── Init color UI ──
  renderRecent();
  renderCustom();
  initColorSwatchEvents();

  // ── Sync initial popup state ──
  syncPopupState();

  // Add swatch button
  document.getElementById('add-swatch').addEventListener('click', () => {
    const cur = document.getElementById('cp').value;
    addColor(cur);
  });

  // Exit edit mode on tap outside inspector
  document.addEventListener('pointerdown', e => {
    if (!editMode) return;
    const pnl = document.getElementById('panel');
    if (pnl && !pnl.contains(e.target)) {
      exitEditMode();
    }
  });
}
