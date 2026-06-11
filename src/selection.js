import * as THREE from 'three';
import { objects, selected, state, sceneRefs } from './state.js';
import { attachGizmo, detachGizmo } from './gizmo/index.js';
import { refreshPanel, syncBarColorToSelection } from './panels.js';

export function unhighlight() {
  objects.forEach(m => {
    if (m.isGroup) return;
    m.material.emissive = new THREE.Color(0);
    m.material.emissiveIntensity = 0;
  });
}

export function doHighlight() {
  unhighlight();
  selected.forEach(m => {
    if (m.isGroup) return;
    m.material.emissive = new THREE.Color(0x4466ff);
    m.material.emissiveIntensity = 0.15;
  });
}

export function refreshSelection() {
  doHighlight();
  const arr = [...selected];
  if (arr.length === 1) {
    attachGizmo(arr[0]);
  } else if (arr.length > 1) {
    attachGizmo(arr[0], arr.slice(1));
  } else {
    detachGizmo();
  }
  refreshPanel();
  syncBarColorToSelection();
}
