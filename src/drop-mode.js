import * as THREE from 'three';
import { state, sceneRefs, dropTargets, selected } from './state.js';
import { getGeom, halfHeight, createObj } from './objects.js';
import { history, actCreate } from './history.js';
import { refreshSelection } from './selection.js';

export function cancelDropMode() {
  if (!state.dropMode) return;
  sceneRefs.scene.remove(state.dropMode.ghost);
  state.dropMode.ghost.geometry.dispose();
  state.dropMode.ghost.material.dispose();
  state.dropMode = null;
  sceneRefs.renderer.domElement.style.cursor = 'default';
  document.querySelectorAll('.ob[data-t]').forEach(b => b.classList.remove('pending'));
  const ht = document.getElementById('ht');
  if (ht) {
    ht.classList.remove('active');
    ht.innerHTML = '<kbd>Click</kbd> pilih &bull; Toolbar &rarr; drop &bull; <kbd>&#8984;Z</kbd> undo &bull; <kbd>&#8984;Y</kbd> redo';
  }
}

export function startDropMode(t) {
  cancelDropMode();
  const geo = getGeom(t);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(state.nextColor), transparent: true, opacity: 0.35,
    depthTest: false, depthWrite: false,
  });
  const ghost = new THREE.Mesh(geo, mat);
  ghost.visible = false;
  ghost.renderOrder = 998;
  sceneRefs.scene.add(ghost);
  state.dropMode = { type: t, ghost };
  sceneRefs.renderer.domElement.style.cursor = 'crosshair';
  document.querySelectorAll('.ob[data-t]').forEach(b => b.classList.toggle('pending', b.dataset.t === t));
  const ht = document.getElementById('ht');
  if (ht) {
    ht.classList.add('active');
    ht.textContent = '\u{1F4CD} Arahkan & klik letakkan \u00B7 Esc batal';
  }
}

export function updateGhost(e) {
  if (!state.dropMode) return;
  const r = sceneRefs.renderer.domElement.getBoundingClientRect();
  const p = new THREE.Vector2(
    ((e.clientX - r.left) / r.width) * 2 - 1,
    -((e.clientY - r.top) / r.height) * 2 + 1
  );
  const rc = new THREE.Raycaster();
  rc.setFromCamera(p, sceneRefs.camera);
  const hits = rc.intersectObjects(dropTargets, true);
  if (hits.length > 0) {
    const hit = hits[0];
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const o = halfHeight(state.dropMode.type);
    state.dropMode.ghost.position.copy(hit.point.clone().add(n.clone().multiplyScalar(o)));
    state.dropMode.ghost.visible = true;
    if (hit.object !== sceneRefs.shadowPlane && Math.abs(n.y) < 0.99) {
      state.dropMode.ghost.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
    } else {
      state.dropMode.ghost.quaternion.identity();
    }
  } else {
    state.dropMode.ghost.visible = false;
  }
}

export function placeGhost() {
  if (!state.dropMode || !state.dropMode.ghost.visible) return;
  const pos = state.dropMode.ghost.position.clone();
  const quat = state.dropMode.ghost.quaternion.clone();
  const mesh = createObj(state.dropMode.type);
  mesh.position.copy(pos);
  mesh.quaternion.copy(quat);
  history.execute(actCreate(mesh));
  selected.clear();
  selected.add(mesh);
  refreshSelection();
  cancelDropMode();
}
