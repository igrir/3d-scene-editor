import * as THREE from 'three';
import { state, sceneRefs } from '../state.js';

export class AdvancedGizmo extends THREE.Group {
  constructor() {
    super();
    this.parts = [];
    this.hovered = null;
    this.dragging = null;
    this.build();
    this.buildHelpers();
  }

  build() {
    const M = (c, o) =>
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const axis = ['x', 'y', 'z'][i];
      const col = [0xff4444, 0x44ff44, 0x4488ff][i];
      const grp = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.75, 8), M(col, 0.9));
      shaft.position.set(0, 0.675, 0);
      shaft.userData = { axis, action: 'translate', gizmo: this };
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 8), M(col, 0.9));
      tip.position.set(0, 1.16, 0);
      tip.userData = { axis, action: 'translate', gizmo: this };
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.025, 16, 32), M(col, 0.55));
      ring.rotation.x = Math.PI / 2;
      ring.userData = { axis, action: 'rotate', gizmo: this };
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), M(col, 0.85));
      cube.position.set(0, 0.34, 0);
      cube.userData = { axis, action: 'scale', gizmo: this };
      grp.add(shaft, tip, ring, cube);
      if (axis === 'x') grp.rotation.z = -Math.PI / 2;
      else if (axis === 'z') grp.rotation.x = Math.PI / 2;
      this.add(grp);
      this.parts.push(shaft, tip, ring, cube);
    }
    this.add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), M(0xffffff, 0.4)));
  }

  buildHelpers() {
    const M = (c, o) =>
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false });
    const L = new THREE.LineDashedMaterial({ color: 0x88aaff, dashSize: 0.06, gapSize: 0.06, transparent: true, opacity: 0.5, depthWrite: false });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -5, 0], 3));
    this.dashLine = new THREE.Line(lg, L);
    this.dashLine.computeLineDistances();
    this.dashLine.visible = false;
    this.add(this.dashLine);
    this.groundRing = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.5, 32), M(0x88aaff, 0.1));
    this.groundRing.rotation.x = -Math.PI / 2;
    this.groundRing.visible = false;
    this.add(this.groundRing);
    this.groundDot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), M(0x88aaff, 0.25));
    this.groundDot.rotation.x = -Math.PI / 2;
    this.groundDot.visible = false;
    this.add(this.groundDot);
  }

  hitTest(rc) {
    const h = rc.intersectObjects(this.parts, false);
    return h.length ? h[0].object : null;
  }

  setHover(p) {
    if (this.hovered && this.hovered !== p)
      this.hovered.material.opacity = { rotate: 0.55, scale: 0.85 }[this.hovered.userData.action] ?? 0.9;
    this.hovered = p;
    if (p) { p.material.opacity = 1; sceneRefs.renderer.domElement.style.cursor = 'grab'; }
    else { sceneRefs.renderer.domElement.style.cursor = 'default'; }
  }

  startDrag(p, mp) {
    if (!state.targetObject) return;
    this.dragging = {
      part: p, axis: p.userData.axis, action: p.userData.action, mouse: mp.clone(),
      startPos: state.targetObject.position.clone(),
      startRot: state.targetObject.quaternion.clone(),
      startScale: state.targetObject.scale.clone(),
    };
    sceneRefs.orbit.enabled = false;
    sceneRefs.renderer.domElement.style.cursor = 'grabbing';
    if (p.userData.action === 'translate') { this.dashLine.visible = true; this.groundRing.visible = true; this.groundDot.visible = true; }
  }

  dragUpdate(mp) {
    if (!this.dragging || !state.targetObject) return;
    const { axis, action, mouse, startPos, startRot, startScale } = this.dragging;
    const ai = { x: 0, y: 1, z: 2 }[axis];
    const cd = new THREE.Vector3();
    sceneRefs.camera.getWorldDirection(cd);
    const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(cd, state.targetObject.position);
    const rc = new THREE.Raycaster();
    const sp = new THREE.Vector3();
    rc.setFromCamera(mouse, sceneRefs.camera);
    rc.ray.intersectPlane(pl, sp);
    const cp = new THREE.Vector3();
    rc.setFromCamera(mp, sceneRefs.camera);
    rc.ray.intersectPlane(pl, cp);
    if (!sp || !cp) return;
    const d = cp.clone().sub(sp);

    if (action === 'translate') {
      const transAxis = new THREE.Vector3(ai === 0 ? 1 : 0, ai === 1 ? 1 : 0, ai === 2 ? 1 : 0).applyQuaternion(this.quaternion);
      state.targetObject.position.copy(startPos.clone().add(transAxis.clone().multiplyScalar(d.dot(transAxis))));
      const y = state.targetObject.position.y;
      this.groundRing.position.set(0, -y + 0.02, 0);
      this.groundDot.position.set(0, -y + 0.02, 0);
      const pos = this.dashLine.geometry.attributes.position.array;
      pos[1] = 0; pos[4] = -y;
      this.dashLine.geometry.attributes.position.needsUpdate = true;
      this.dashLine.computeLineDistances();
    } else if (action === 'rotate') {
      const localAxis = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
      const wAxis = localAxis.clone().applyQuaternion(this.quaternion);
      const apl = new THREE.Plane().setFromNormalAndCoplanarPoint(wAxis, state.targetObject.position);
      const sv = new THREE.Vector3(); rc.setFromCamera(mouse, sceneRefs.camera); rc.ray.intersectPlane(apl, sv);
      const cv = new THREE.Vector3(); rc.setFromCamera(mp, sceneRefs.camera); rc.ray.intersectPlane(apl, cv);
      if (sv && cv) {
        const ds = sv.sub(state.targetObject.position).normalize();
        const dc = cv.sub(state.targetObject.position).normalize();
        if (ds.length() > 0.01 && dc.length() > 0.01) {
          let ang = Math.atan2(wAxis.dot(ds.clone().cross(dc)), ds.dot(dc));
          if(this.userData.snapRotation)ang=Math.round(ang/(Math.PI/4))*Math.PI/4;
          state.targetObject.quaternion.copy(startRot.clone().multiply(new THREE.Quaternion().setFromAxisAngle(localAxis, ang)));
        }
      }
    } else if (action === 'scale') {
      const os = startScale.getComponent(ai);
      const sclAxis2 = new THREE.Vector3(ai === 0 ? 1 : 0, ai === 1 ? 1 : 0, ai === 2 ? 1 : 0).applyQuaternion(this.quaternion);
      const ns = Math.max(0.1, os * (1 + d.dot(sclAxis2) * 1.5));
      state.targetObject.scale.setComponent(ai, ns);
      state.targetObject.position.copy(startPos.clone().add(sclAxis2.clone().multiplyScalar((ns - os) * 0.5)));
    }
    this.position.copy(state.targetObject.position);
  }

  endDrag() {
    this.dashLine.visible = false; this.groundRing.visible = false; this.groundDot.visible = false;
    if (!this.dragging) return null;
    const r = {
      startPos: this.dragging.startPos, startRot: this.dragging.startRot, startScale: this.dragging.startScale,
      endPos: state.targetObject.position.clone(), endRot: state.targetObject.quaternion.clone(), endScale: state.targetObject.scale.clone(),
    };
    this.dragging = null;
    sceneRefs.orbit.enabled = true;
    sceneRefs.renderer.domElement.style.cursor = 'default';
    return r;
  }

  attach(obj) { state.targetObject = obj; this.position.copy(obj.position); this.quaternion.copy(obj.quaternion); this.visible = true; }
  detach() { state.targetObject = null; this.visible = false; this.endDrag(); }
}
