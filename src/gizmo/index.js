import * as THREE from 'three';
import { sceneRefs, state, selected } from '../state.js';
import { AdvancedGizmo } from './advanced.js';
import { SimpleGizmo } from './simple.js';

export function getActiveGizmo() {
  return state.gizmoMode === 'advanced' ? sceneRefs.advGizmo : sceneRefs.simGizmo;
}

export function attachGizmo(obj, multi) {
  sceneRefs.advGizmo.detach();
  sceneRefs.simGizmo.detach();
  const g = getActiveGizmo();
  g.attach(obj);
  if (multi && multi.length > 0) {
    const c = new THREE.Vector3();
    let n = 1;
    c.copy(obj.position);
    for (const m of multi) { c.add(m.position); n++; }
    c.divideScalar(n);
    g.position.copy(c);
    g.quaternion.identity();
  }
}

export function detachGizmo() {
  sceneRefs.advGizmo.detach();
  sceneRefs.simGizmo.detach();
}

export function gizmoHitTest(rc) {
  return getActiveGizmo().hitTest(rc);
}

export function createGizmoInstances() {
  const adv = new AdvancedGizmo();
  adv.visible = false;
  sceneRefs.scene.add(adv);
  sceneRefs.advGizmo = adv;

  const sim = new SimpleGizmo();
  sim.visible = false;
  sceneRefs.scene.add(sim);
  sceneRefs.simGizmo = sim;
}
