import * as THREE from 'three';
import { state, sceneRefs, objects, selected, dropTargets } from './state.js';
import { getActiveGizmo, gizmoHitTest } from './gizmo/index.js';
import { gizmoStartDrag, gizmoDragUpdate, gizmoEndDrag, gizmoSetHover } from './transforms.js';
import { refreshSelection } from './selection.js';
import { refreshPanel, selectColorFinal } from './panels.js';
import { updateGhost, placeGhost, cancelDropMode } from './drop-mode.js';
import { history, actDelete, actColor, actCreate } from './history.js';
import { createObj, dupSel } from './objects.js';

export function setupInput() {
  const dom = sceneRefs.renderer.domElement;

  function getPtr(e) {
    const r = dom.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
  }

  function hitObjs(e) {
    const p = getPtr(e);
    sceneRefs.raycaster.setFromCamera(p, sceneRefs.camera);
    const hits = sceneRefs.raycaster.intersectObjects(objects, true);
    // Map child hits back to root group (for bookshelf etc.)
    return hits.map(h => {
      let obj = h.object;
      while (obj && !objects.includes(obj)) obj = obj.parent;
      if (obj && obj !== h.object) { h.object = obj; }
      return h;
    }).filter(h => objects.includes(h.object));
  }

  // ── pointerdown ──
  dom.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;

    // Drop mode
    if (state.dropMode) {
      placeGhost(e);
      return;
    }

    const p = getPtr(e);

    // Rect selection mode
    if (state.selectMode === 'rect') {
      sceneRefs.orbit.enabled = false;
      const r = dom.getBoundingClientRect();
      state.rectStart = { x: e.clientX - r.left, y: e.clientY - r.top };
      state.rectEnd = null;
      state.rectDragging = true;
      const ov = document.getElementById('sel-overlay');
      ov.style.display = '';
      ov.style.left = state.rectStart.x + 'px';
      ov.style.top = state.rectStart.y + 'px';
      ov.style.width = '0px';
      ov.style.height = '0px';
      return;
    }

    // Gizmo hit test
    const g = getActiveGizmo();
    if (g.visible && state.targetObject) {
      sceneRefs.raycaster.setFromCamera(p, sceneRefs.camera);
      const gh = gizmoHitTest(sceneRefs.raycaster);
      if (gh) {
        gizmoStartDrag(gh, p);
        state.gizmoDragging = true;
        return;
      }
    }

    // Object hit test
    const hits = hitObjs(e);
    if (hits.length > 0) {
      const obj = hits[0].object;

      // Paint bucket
      if (state.toolMode === 'paint') {
        if (!obj.isGroup && obj.material && obj.material.color) {
          const oc = obj.material.color.getHex();
          const nc = state.nextColor;
          obj.material.color.set(nc);
          history.execute(actColor([obj], [oc], nc));
          refreshPanel();
        }
        return;
      }

      // Eyedropper — pick color from object, then back to select
      if (state.toolMode === 'eyedrop') {
        if (!obj.isGroup && obj.material && obj.material.color) {
          const c = '#' + obj.material.color.getHexString();
          selectColorFinal(c);
          // Auto-reset to select mode
          state.toolMode = 'select';
          document.querySelectorAll('#tl-tools .tl-btn').forEach(b => b.classList.remove('on', 'active-tool'));
          document.getElementById('sel-default').classList.add('on');
        }
        return;
      }

      // Normal selection
      if (e.ctrlKey || e.metaKey) {
        if (selected.has(obj)) selected.delete(obj);
        else selected.add(obj);
      } else {
        selected.clear();
        selected.add(obj);
      }
    } else {
      if (!e.ctrlKey && !e.metaKey) selected.clear();
    }
    refreshSelection();
  });

  // ── pointermove ──
  dom.addEventListener('pointermove', e => {
    // Drop mode ghost
    if (state.dropMode) { updateGhost(e); return; }

    const p = getPtr(e);

    // Gizmo dragging
    if (state.gizmoDragging) { gizmoDragUpdate(p, e.ctrlKey||e.metaKey); refreshPanel(); return; }

    // Rect selection overlay
    if (state.rectDragging && state.rectStart) {
      const r = dom.getBoundingClientRect();
      state.rectEnd = { x: e.clientX - r.left, y: e.clientY - r.top };
      const ov = document.getElementById('sel-overlay');
      const x = Math.min(state.rectStart.x, state.rectEnd.x);
      const y = Math.min(state.rectStart.y, state.rectEnd.y);
      const w = Math.abs(state.rectEnd.x - state.rectStart.x);
      const h = Math.abs(state.rectEnd.y - state.rectStart.y);
      ov.style.left = x + 'px';
      ov.style.top = y + 'px';
      ov.style.width = w + 'px';
      ov.style.height = h + 'px';
      return;
    }

    // Gizmo hover
    const g = getActiveGizmo();
    if (g.visible && state.targetObject) {
      sceneRefs.raycaster.setFromCamera(p, sceneRefs.camera);
      gizmoSetHover(gizmoHitTest(sceneRefs.raycaster));
    } else {
      gizmoSetHover(null);
    }
  });

  // ── pointerup ──
  dom.addEventListener('pointerup', e => {
    if (state.gizmoDragging) {
      gizmoEndDrag();
      state.gizmoDragging = false;
    }

    if (state.rectDragging) {
      state.rectDragging = false;
      sceneRefs.orbit.enabled = true;
      const ov = document.getElementById('sel-overlay');
      ov.style.display = 'none';
      if (!state.rectStart || !state.rectEnd) return;

      const minX = Math.min(state.rectStart.x, state.rectEnd.x);
      const maxX = Math.max(state.rectStart.x, state.rectEnd.x);
      const minY = Math.min(state.rectStart.y, state.rectEnd.y);
      const maxY = Math.max(state.rectStart.y, state.rectEnd.y);
      const r = dom.getBoundingClientRect();
      const left = (minX / r.width) * 2 - 1;
      const right = (maxX / r.width) * 2 - 1;
      const bottom = -((maxY / r.height) * 2 - 1);
      const top = -((minY / r.height) * 2 - 1);

      const sel = [];
      for (const m of objects) {
        const vec = m.position.clone().project(sceneRefs.camera);
        if (vec.x >= left && vec.x <= right && vec.y >= bottom && vec.y <= top) sel.push(m);
      }
      selected.clear();
      sel.forEach(m => selected.add(m));
      state.rectStart = state.rectEnd = null;

      // Auto revert to default select mode
      state.toolMode = 'select';
      state.selectMode = 'default';
      document.querySelectorAll('#tl-tools .tl-btn').forEach(b => b.classList.remove('on', 'active-tool'));
      document.getElementById('sel-default').classList.add('on');
      refreshSelection();
    }
  });

  // ── pointerleave ──
  dom.addEventListener('pointerleave', () => {
    if (state.gizmoDragging) { gizmoEndDrag(); state.gizmoDragging = false; }
    if (state.rectDragging) {
      state.rectDragging = false;
      sceneRefs.orbit.enabled = true;
      document.getElementById('sel-overlay').style.display = 'none';
      state.rectStart = state.rectEnd = null;
    }
    gizmoSetHover(null);
  });

  // ── dblclick ──
  dom.addEventListener('dblclick', e => {
    const hits = hitObjs(e);
    if (hits.length > 0) {
      const p = new THREE.Vector3();
      hits[0].object.getWorldPosition(p);
      sceneRefs.orbit.target.copy(p);
    }
  });

  // ── keyboard ──
  document.addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey;

    // Duplicate (⌘D / Ctrl+D)
    if (mod && e.key === 'd') {
      e.preventDefault();
      if (!selected.size) return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      dupSel();
      return;
    }

    // Copy (⌘C / Ctrl+C)
    if (mod && e.key === 'c') {
      if (!selected.size) return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      state.clipboard = [];
      for (const m of selected) {
        if (m.isGroup) {
          const data = { isGroup: true, children: [], position: m.position.clone(), quaternion: m.quaternion.clone(), scale: m.scale.clone() };
          m.children.forEach(ch => {
            if (!ch.isMesh) return;
            data.children.push({
              type: ch.userData.type,
              position: ch.position.clone(),
              quaternion: ch.quaternion.clone(),
              scale: ch.scale.clone(),
              color: ch.material.color.getHex(),
              imageSrc: ch.userData.imageSrc || null,
              isDropTarget: ch.userData.isDropTarget,
            });
          });
          state.clipboard.push(data);
        } else {
          state.clipboard.push({
            isGroup: false,
            type: m.userData.type,
            position: m.position.clone(),
            quaternion: m.quaternion.clone(),
            scale: m.scale.clone(),
            color: m.material.color.getHex(),
            imageSrc: m.userData.imageSrc || null,
            isDropTarget: m.userData.isDropTarget,
          });
        }
      }
      return;
    }

    // Paste (⌘V / Ctrl+V)
    if (mod && e.key === 'v') {
      e.preventDefault();
      if (!state.clipboard || !state.clipboard.length) return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const clones = [];
      for (const data of state.clipboard) {
        let c;
        if (data.isGroup) {
          c = new THREE.Group();
          c.position.copy(data.position);
          c.quaternion.copy(data.quaternion);
          c.scale.copy(data.scale);
          c.userData.isGroup = true;
          for (const chData of data.children) {
            const cm = createObj(chData.type, chData.imageSrc || undefined);
            cm.position.copy(chData.position);
            cm.quaternion.copy(chData.quaternion);
            cm.scale.copy(chData.scale);
            cm.material.color.setHex(chData.color);
            cm.castShadow = true;
            cm.receiveShadow = chData.isDropTarget;
            cm.userData.type = chData.type;
            cm.userData.isDropTarget = chData.isDropTarget;
            if (chData.imageSrc) cm.userData.imageSrc = chData.imageSrc;
            c.add(cm);
          }
        } else {
          c = createObj(data.type, data.imageSrc || undefined);
          c.position.copy(data.position);
          c.quaternion.copy(data.quaternion);
          c.scale.copy(data.scale);
          c.material.color.setHex(data.color);
          c.castShadow = true;
          c.receiveShadow = data.isDropTarget;
          c.userData.type = data.type;
          c.userData.isDropTarget = data.isDropTarget;
          if (data.imageSrc) c.userData.imageSrc = data.imageSrc;
        }
        // Offset paste slightly
        c.position.x += 0.8;
        c.position.z += 0.8;
        sceneRefs.scene.add(c);
        objects.push(c);
        dropTargets.push(c);
        clones.push(c);
      }
      selected.clear();
      clones.forEach(c => selected.add(c));
      refreshSelection();
      return;
    }

    // Undo / Redo
    if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); history.undo(); return; }
    if (mod && e.key === 'y') { e.preventDefault(); history.redo(); return; }

    // Delete (skip when editing text fields)
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size > 0) {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (state.dropMode) cancelDropMode();
      e.preventDefault();
      history.execute(actDelete([...selected]));
      selected.clear();
      getActiveGizmo().detach();
      refreshSelection();
      return;
    }

    // Escape
    if (e.key === 'Escape') {
      if (state.dropMode) { cancelDropMode(); return; }
      if (state.rectDragging || state.selectMode === 'rect') {
        state.rectDragging = false;
        state.rectStart = state.rectEnd = null;
        document.getElementById('sel-overlay').style.display = 'none';
        state.selectMode = 'default';
        document.querySelectorAll('#tl-tools .tl-btn').forEach(b => b.classList.remove('on'));
        document.getElementById('sel-default').classList.add('on');
        return;
      }
      selected.clear();
      getActiveGizmo().detach();
      refreshSelection();
    }
  });

  // ── window resize ──
  window.addEventListener('resize', () => {
    if (sceneRefs.resize) sceneRefs.resize();
  });
}
