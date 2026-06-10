import * as THREE from 'three';
import { state, sceneRefs, selected, dropTargets } from '../state.js';
import { halfHeight } from '../objects.js';

export class SimpleGizmo extends THREE.Group {
  constructor() {
    super();
    this.parts = [];
    this.hovered = null;
    this.dragging = null;
    this.build();
  }

  build() {
    const M = (c, o) =>
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false });

    // XZ ground plane
    const groundMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
    const groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -0.01;
    groundPlane.userData = { action: 'xz', gizmo: this };
    this.add(groundPlane);
    this.parts.push(groundPlane);

    // Border
    const borderMat = new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.25 });
    const borderPts = [
      new THREE.Vector3(-0.6, 0, -0.6), new THREE.Vector3(0.6, 0, -0.6),
      new THREE.Vector3(0.6, 0, 0.6), new THREE.Vector3(-0.6, 0, 0.6),
      new THREE.Vector3(-0.6, 0, -0.6),
    ];
    const border = new THREE.Line(new THREE.BufferGeometry().setFromPoints(borderPts), borderMat);
    border.position.y = -0.01;
    this.add(border);

    // X arrow
    const gX = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.15, 6), M(0xff6666, 0.6));
    gX.rotation.z = -Math.PI / 2; gX.position.set(0.45, 0, 0);
    gX.userData = { action: 'xz', gizmo: this };
    this.add(gX); this.parts.push(gX);

    // Z arrow
    const gZ = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.15, 6), M(0x6688ff, 0.6));
    gZ.rotation.x = Math.PI / 2; gZ.position.set(0, 0, 0.45);
    gZ.userData = { action: 'xz', gizmo: this };
    this.add(gZ); this.parts.push(gZ);

    // Y shaft
    const yShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.65, 8), M(0x66ff66, 0.85));
    yShaft.position.set(0, 0.525, 0);
    yShaft.userData = { action: 'y', gizmo: this };
    this.add(yShaft); this.parts.push(yShaft);

    // Y tip
    const yTip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 8), M(0x66ff66, 0.85));
    yTip.position.set(0, 0.95, 0);
    yTip.userData = { action: 'y', gizmo: this };
    this.add(yTip); this.parts.push(yTip);

    // Y rotation ring
    const yRing = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 16, 32), M(0x66ff66, 0.45));
    yRing.rotation.x = Math.PI / 2; yRing.position.y = 0.1;
    yRing.userData = { action: 'rotateY', gizmo: this };
    this.add(yRing); this.parts.push(yRing);

    // Uniform scale
    const sc = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), M(0xffffff, 0.85));
    sc.position.y = 0.02;
    sc.userData = { action: 'scale', gizmo: this };
    this.add(sc); this.parts.push(sc);

    // Center dot
    this.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), M(0xffffff, 0.35)));

    // Helpers
    const LM = new THREE.LineDashedMaterial({ color: 0x88aaff, dashSize: 0.06, gapSize: 0.06, transparent: true, opacity: 0.5, depthWrite: false });
    const LG = new THREE.BufferGeometry();
    LG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -5, 0], 3));
    this.dashLine = new THREE.Line(LG, LM);
    this.dashLine.computeLineDistances();
    this.dashLine.visible = false;
    this.add(this.dashLine);

    this.groundRing = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.5, 32), new THREE.MeshBasicMaterial({ color: 0x88aaff, transparent: true, opacity: 0.1, depthWrite: false }));
    this.groundRing.rotation.x = -Math.PI / 2;
    this.groundRing.visible = false;
    this.add(this.groundRing);

    this.groundDot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), new THREE.MeshBasicMaterial({ color: 0x88aaff, transparent: true, opacity: 0.25, depthWrite: false }));
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
      this.hovered.material.opacity = { y: 0.85, rotateY: 0.45, scale: 0.85, xz: 0.08 }[this.hovered.userData.action] ?? 0.85;
    this.hovered = p;
    if (p) { p.material.opacity = { xz: 0.2 }[p.userData.action] ?? 1; sceneRefs.renderer.domElement.style.cursor = 'grab'; }
    else { sceneRefs.renderer.domElement.style.cursor = 'default'; }
  }

  startDrag(p, mp) {
    if (!state.targetObject) return;
    const act = p.userData.action;
    const drag = {
      part: p, action: act, mouse: mp.clone(),
      startPos: state.targetObject.position.clone(),
      startRot: state.targetObject.quaternion.clone(),
      startScale: state.targetObject.scale.clone(),
    };
    if (act === 'xz' || act === 'y') {
      const gizmoUp2 = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);
      const rc = new THREE.Raycaster();
      const hPlane2 = new THREE.Plane().setFromNormalAndCoplanarPoint(gizmoUp2, state.targetObject.position);
      rc.setFromCamera(mp, sceneRefs.camera);
      const hp2 = new THREE.Vector3();
      rc.ray.intersectPlane(hPlane2, hp2);
      drag.startHit = hp2;
      this.dashLine.visible = true; this.groundRing.visible = true; this.groundDot.visible = true;
    }
    this.dragging = drag;
    sceneRefs.orbit.enabled = false;
    sceneRefs.renderer.domElement.style.cursor = 'grabbing';
  }

  dragUpdate(mp) {
    if (!this.dragging || !state.targetObject) return;
    const { action, mouse, startPos, startRot, startScale } = this.dragging;
    const cd = new THREE.Vector3();
    sceneRefs.camera.getWorldDirection(cd);
    const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(cd, state.targetObject.position);
    const rc = new THREE.Raycaster();
    const sp = new THREE.Vector3(); rc.setFromCamera(mouse, sceneRefs.camera); rc.ray.intersectPlane(pl, sp);
    const cp = new THREE.Vector3(); rc.setFromCamera(mp, sceneRefs.camera); rc.ray.intersectPlane(pl, cp);
    if (!sp || !cp) return;
    const d = cp.clone().sub(sp);

    if (action === 'xz') {
      if (state.xzMode === 'surface') {
        const hitPoint = new THREE.Vector3();
        rc.setFromCamera(mp, sceneRefs.camera);
        const targets = dropTargets.filter(t => !selected.has(t));
        const hits = rc.intersectObjects(targets, false);
        if (hits.length > 0) {
          const hit = hits[0];
          const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
          const offset = state.targetObject ? halfHeight(state.targetObject.userData.type) : 0.5;
          hitPoint.copy(hit.point.clone().add(normal.clone().multiplyScalar(offset)));
          state.targetObject.position.x = hitPoint.x;
          state.targetObject.position.z = hitPoint.z;
          state.targetObject.position.y = hitPoint.y;
          if (hit.object !== sceneRefs.shadowPlane) {
            if (Math.abs(normal.y) < 0.99) {
              state.targetObject.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal));
            }
          } else {
            state.targetObject.quaternion.identity();
          }
        }
      } else {
        const gizmoUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);
        const hPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(gizmoUp, state.targetObject.position);
        const hp = new THREE.Vector3(); rc.setFromCamera(mp, sceneRefs.camera); rc.ray.intersectPlane(hPlane, hp);
        if (hp && this.dragging.startHit) {
          const dPos = hp.sub(this.dragging.startHit);
          const gizmoX = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion);
          const gizmoZ = new THREE.Vector3(0, 0, 1).applyQuaternion(this.quaternion);
          state.targetObject.position.copy(startPos.clone().add(gizmoX.clone().multiplyScalar(dPos.dot(gizmoX))).add(gizmoZ.clone().multiplyScalar(dPos.dot(gizmoZ))));
        }
      }
      const y = state.targetObject.position.y;
      this.groundRing.position.set(0, -y + 0.02, 0); this.groundDot.position.set(0, -y + 0.02, 0);
      const pos = this.dashLine.geometry.attributes.position.array; pos[1] = 0; pos[4] = -y;
      this.dashLine.geometry.attributes.position.needsUpdate = true; this.dashLine.computeLineDistances();
    } else if (action === 'y') {
      state.targetObject.position.y = startPos.y + d.y;
      const y = state.targetObject.position.y;
      this.groundRing.position.set(0, -y + 0.02, 0); this.groundDot.position.set(0, -y + 0.02, 0);
      const pos = this.dashLine.geometry.attributes.position.array; pos[1] = 0; pos[4] = -y;
      this.dashLine.geometry.attributes.position.needsUpdate = true; this.dashLine.computeLineDistances();
    } else if (action === 'rotateY') {
      const yAxis = new THREE.Vector3(0, 1, 0);
      const apl = new THREE.Plane().setFromNormalAndCoplanarPoint(yAxis, state.targetObject.position);
      const sv = new THREE.Vector3(); rc.setFromCamera(mouse, sceneRefs.camera); rc.ray.intersectPlane(apl, sv);
      const cv = new THREE.Vector3(); rc.setFromCamera(mp, sceneRefs.camera); rc.ray.intersectPlane(apl, cv);
      if (sv && cv) {
        const ds = sv.sub(state.targetObject.position).normalize();
        const dc = cv.sub(state.targetObject.position).normalize();
        if (ds.length() > 0.01 && dc.length() > 0.01) {
          const ang = Math.atan2(ds.clone().cross(dc).dot(yAxis), ds.dot(dc));
          state.targetObject.quaternion.copy(startRot.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(yAxis, ang)));
        }
      }
    } else if (action === 'scale') {
      const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);
      const dy = d.dot(localUp);
      const factor = 1 + dy * 1.5;
      const s = Math.max(0.1, startScale.x * factor);
      const os = startScale.x;
      state.targetObject.scale.set(s, s, s);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(state.targetObject.quaternion);
      state.targetObject.position.copy(startPos.clone().add(up.clone().multiplyScalar((s - os) * 0.5)));
    }
    this.position.copy(state.targetObject.position);
  }

  endDrag() {
    this.dashLine.visible = false; this.groundRing.visible = false; this.groundDot.visible = false;
    if (!this.dragging) return null;
    const r = {
      startPos: this.dragging.startPos, startRot: this.dragging.startRot, startScale: this.dragging.startScale,
      endPos: state.targetObject.position.clone(), endRot: state.targetObject.quaternion.clone(), endScale: state.targetObject.scale.clone(),
      action: this.dragging.action,
    };
    this.dragging = null;
    sceneRefs.orbit.enabled = true;
    sceneRefs.renderer.domElement.style.cursor = 'default';
    return r;
  }

  attach(obj) { state.targetObject = obj; this.position.copy(obj.position); this.quaternion.copy(obj.quaternion); this.visible = true; }
  detach() { state.targetObject = null; this.visible = false; this.endDrag(); }
}
