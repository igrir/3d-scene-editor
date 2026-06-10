import * as THREE from 'three';
import { state, sceneRefs, selected } from './state.js';
import { getActiveGizmo } from './gizmo/index.js';
import { history, actTransform, actUniformScale } from './history.js';
import { refreshPanel } from './panels.js';

export function gizmoStartDrag(p, mp) {
  if (selected.size > 1) {
    state.multiInitStates = { pos: [], rot: [], scl: [] };
    for (const m of selected) {
      state.multiInitStates.pos.push(m.position.clone());
      state.multiInitStates.rot.push(m.quaternion.clone());
      state.multiInitStates.scl.push(m.scale.clone());
    }
  } else {
    state.multiInitStates = null;
  }
  getActiveGizmo().startDrag(p, mp);
}

export function gizmoDragUpdate(mp) {
  if (selected.size > 1 && state.targetObject && state.multiInitStates) {
    const g = getActiveGizmo();
    const isRot = g.dragging && (g.dragging.action === 'rotate' || g.dragging.action === 'rotateY');
    if (isRot) {
      const axis = g.dragging.axis || 'y';
      const localAxis = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
      const wAxis = localAxis.clone().applyQuaternion(g.quaternion);
      const center = new THREE.Vector3();
      for (let i = 0; i < selected.size; i++) center.add(state.multiInitStates.pos[i]);
      center.divideScalar(selected.size);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(wAxis, center);
      const rc = new THREE.Raycaster();
      const sp = new THREE.Vector3(); rc.setFromCamera(g.dragging.mouse, sceneRefs.camera); rc.ray.intersectPlane(plane, sp);
      const cp = new THREE.Vector3(); rc.setFromCamera(mp, sceneRefs.camera); rc.ray.intersectPlane(plane, cp);
      if (sp && cp) {
        const ds = sp.sub(center).normalize();
        const dc = cp.sub(center).normalize();
        if (ds.length() > 0.01 && dc.length() > 0.01) {
          const ang = Math.atan2(wAxis.dot(ds.clone().cross(dc)), ds.dot(dc));
          const dRot = new THREE.Quaternion().setFromAxisAngle(wAxis, ang);
          let idx = 0;
          for (const m of selected) {
            const initPos = state.multiInitStates.pos[idx];
            const initQuat = state.multiInitStates.rot[idx];
            const offset = initPos.clone().sub(center);
            const newOffset = offset.clone().applyQuaternion(dRot);
            m.position.copy(center.clone().add(newOffset));
            m.quaternion.copy(dRot.clone().multiply(initQuat));
            idx++;
          }
        }
      }
      const c = new THREE.Vector3();
      for (const om of selected) c.add(om.position);
      c.divideScalar(selected.size);
      g.position.copy(c);
    } else if (g.dragging && g.dragging.action === 'scale') {
      const prevScl = state.targetObject.scale.clone();
      g.dragUpdate(mp);
      state.targetObject.position.copy(g.dragging.startPos);
      const dScl = new THREE.Vector3(
        prevScl.x > 0 ? state.targetObject.scale.x / prevScl.x : 1,
        prevScl.y > 0 ? state.targetObject.scale.y / prevScl.y : 1,
        prevScl.z > 0 ? state.targetObject.scale.z / prevScl.z : 1
      );
      for (const m of selected) {
        if (m === state.targetObject) continue;
        m.scale.multiply(dScl);
      }
      const c = new THREE.Vector3();
      for (const om of selected) c.add(om.position);
      c.divideScalar(selected.size);
      g.position.copy(c);
      g.quaternion.copy(state.targetObject.quaternion);
    } else {
      const prevPos = state.targetObject.position.clone();
      g.dragUpdate(mp);
      const dPos = state.targetObject.position.clone().sub(prevPos);
      for (const m of selected) {
        if (m === state.targetObject) continue;
        m.position.add(dPos);
      }
      const c = new THREE.Vector3();
      for (const om of selected) c.add(om.position);
      c.divideScalar(selected.size);
      g.position.copy(c);
    }
  } else {
    getActiveGizmo().dragUpdate(mp);
    const g = getActiveGizmo();
    if (g.visible && state.targetObject) g.quaternion.copy(state.targetObject.quaternion);
  }
}

export function gizmoEndDrag() {
  const g = getActiveGizmo();
  const r = g.endDrag();
  if (r && state.targetObject) {
    const moved = !r.startPos.equals(r.endPos) || !r.startRot.equals(r.endRot) || !r.startScale.equals(r.endScale);
    if (moved) {
      if (selected.size > 1 && state.multiInitStates) {
        const allM = [...selected];
        const st = { pos: [], rot: [], scl: [] };
        const en = { pos: [], rot: [], scl: [] };
        for (let i = 0; i < allM.length; i++) {
          st.pos.push(state.multiInitStates.pos[i]);
          st.rot.push(state.multiInitStates.rot[i]);
          st.scl.push(state.multiInitStates.scl[i]);
          en.pos.push(allM[i].position.clone());
          en.rot.push(allM[i].quaternion.clone());
          en.scl.push(allM[i].scale.clone());
        }
        history.execute({
          do() { for (let i = 0; i < allM.length; i++) { allM[i].position.copy(en.pos[i]); allM[i].quaternion.copy(en.rot[i]); allM[i].scale.copy(en.scl[i]); } },
          undo() { for (let i = 0; i < allM.length; i++) { allM[i].position.copy(st.pos[i]); allM[i].quaternion.copy(st.rot[i]); allM[i].scale.copy(st.scl[i]); } },
        });
        state.multiInitStates = null;
      } else if (r.action === 'scale') {
        history.execute(actUniformScale(state.targetObject, r.startScale, r.endScale));
      } else {
        history.execute(actTransform(state.targetObject, r.startPos, r.startRot, r.startScale, r.endPos, r.endRot, r.endScale));
      }
    }
  }
  state.multiInitStates = null;
  refreshPanel();
  return r;
}

export function gizmoSetHover(p) {
  getActiveGizmo().setHover(p);
}
