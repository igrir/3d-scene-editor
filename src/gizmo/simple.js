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
    // Scale up on touch devices for easier tapping
    if ('ontouchstart' in window) {
      this.scale.set(1.8, 1.8, 1.8);
    }
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
    // Larger invisible hit zone for X arrow (touch-friendly)
    const gXZone = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 6), M(0xff6666, 0));
    gXZone.position.set(0.45, 0, 0);
    gXZone.userData = { action: 'xz', gizmo: this, zone: true, visiblePart: gX };
    this.add(gXZone); this.parts.push(gXZone);

    // Z arrow
    const gZ = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.15, 6), M(0x6688ff, 0.6));
    gZ.rotation.x = Math.PI / 2; gZ.position.set(0, 0, 0.45);
    gZ.userData = { action: 'xz', gizmo: this };
    this.add(gZ); this.parts.push(gZ);
    // Larger invisible hit zone for Z arrow (touch-friendly)
    const gZZone = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 6), M(0x6688ff, 0));
    gZZone.position.set(0, 0, 0.45);
    gZZone.userData = { action: 'xz', gizmo: this, zone: true, visiblePart: gZ };
    this.add(gZZone); this.parts.push(gZZone);

    // Y tip (no shaft)
    const yTip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 8), M(0x66ff66, 0.85));
    yTip.position.set(0, 0.95, 0);
    yTip.userData = { action: 'y', gizmo: this };
    this.add(yTip); this.parts.push(yTip);
    // Larger invisible hit zone for Y (touch-friendly)
    const yZone = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), M(0x66ff66, 0));
    yZone.position.set(0, 0.95, 0);
    yZone.userData = { action: 'y', gizmo: this, zone: true, visiblePart: yTip };
    this.add(yZone); this.parts.push(yZone);

    // Y rotation ring
    const yRing = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 16, 32), M(0x66ff66, 0.45));
    yRing.rotation.x = Math.PI / 2; yRing.position.y = 0.1;
    yRing.userData = { action: 'rotateY', gizmo: this };
    this.add(yRing); this.parts.push(yRing);

    // Uniform scale — bigger cube
    const sc = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), M(0xffffff, 0.85));
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
    if (!h.length) return null;
    const obj = h[0].object;
    // If we hit an invisible touch zone, return its visual part instead
    if (obj.userData.zone && obj.userData.visiblePart) return obj.userData.visiblePart;
    return obj;
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
    const objPos = state.targetObject.position.clone();
    const gizmoUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);

    // Compute start anchor: where the mouse hits the horizontal plane at object Y
    const rc = new THREE.Raycaster();
    rc.setFromCamera(mp, sceneRefs.camera);
    const hPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(gizmoUp, objPos);
    const startHit = new THREE.Vector3();
    rc.ray.intersectPlane(hPlane, startHit);

    const drag = {
      part: p, action: act, mouse: mp.clone(),
      startPos: objPos,
      startHit: startHit || objPos.clone(),
      startRot: state.targetObject.quaternion.clone(),
      startScale: state.targetObject.scale.clone(),
    };
    if (act === 'xz' || act === 'y') {
      this.dashLine.visible = true; this.groundRing.visible = true; this.groundDot.visible = true;
      // Position ground helpers at world Y=0.02 — update world matrix first so worldToLocal is correct
      this.updateMatrixWorld(true);
      const initTarget = new THREE.Vector3(objPos.x, 0.02, objPos.z);
      this.worldToLocal(initTarget);
      this.groundRing.position.set(initTarget.x, initTarget.y, initTarget.z);
      this.groundDot.position.set(initTarget.x, initTarget.y, initTarget.z);
      // Dash line from gizmo origin to ground (in local space)
      const initPos = this.dashLine.geometry.attributes.position.array;
      initPos[1] = 0; initPos[4] = initTarget.y;
      this.dashLine.geometry.attributes.position.needsUpdate = true;
      this.dashLine.computeLineDistances();
    }
    this.dragging = drag;
    sceneRefs.orbit.enabled = false;
    sceneRefs.renderer.domElement.style.cursor = 'grabbing';
  }

  dragUpdate(mp) {
    if (!this.dragging || !state.targetObject) return;
    const { action, mouse, startPos, startHit, startRot, startScale } = this.dragging;
    const gizmoUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);
    const rc = new THREE.Raycaster();
    const refPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(gizmoUp, state.targetObject.position);

    // Current mouse position on the horizontal plane
    const hp = new THREE.Vector3();
    rc.setFromCamera(mp, sceneRefs.camera);
    rc.ray.intersectPlane(refPlane, hp);
    if (!hp) return;

    // Delta from where we started dragging = delta from anchor startHit to current hp
    const delta = hp.clone().sub(startHit);

    if (action === 'xz') {
      if (state.xzMode === 'surface') {
        rc.setFromCamera(mp, sceneRefs.camera);
        const targets = dropTargets.filter(t => !selected.has(t));
        const hits = rc.intersectObjects(targets, true);
        if (hits.length > 0) {
          const hit = hits[0];
          const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
          const hOff = state.targetObject ? halfHeight(state.targetObject.userData.type) : 0.5;
          const hitPoint = hit.point.clone().add(normal.clone().multiplyScalar(hOff));
          // Apply the drag delta to get smooth offset-based movement
          state.targetObject.position.x = startPos.x + delta.x;
          state.targetObject.position.z = startPos.z + delta.z;
          state.targetObject.position.y = hitPoint.y;
          if (hit.object !== sceneRefs.shadowPlane) {
            if (Math.abs(normal.y) < 0.99) {
              state.targetObject.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal));
            } else {
              state.targetObject.quaternion.identity();
            }
          } else {
            state.targetObject.quaternion.identity();
          }
        }
      } else {
        // Constrain delta to gizmo X/Z axes
        const gizmoX = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion);
        const gizmoZ = new THREE.Vector3(0, 0, 1).applyQuaternion(this.quaternion);
        const projX = delta.dot(gizmoX);
        const projZ = delta.dot(gizmoZ);
        state.targetObject.position.copy(startPos.clone().add(gizmoX.clone().multiplyScalar(projX)).add(gizmoZ.clone().multiplyScalar(projZ)));
      }
      // Ground marker at world Y=0.02 — update matrix then worldToLocal for correct position
      this.updateMatrixWorld(true);
      const xzTarget = new THREE.Vector3(state.targetObject.position.x, 0.02, state.targetObject.position.z);
      this.worldToLocal(xzTarget);
      this.groundRing.position.set(xzTarget.x, xzTarget.y, xzTarget.z);
      this.groundDot.position.set(xzTarget.x, xzTarget.y, xzTarget.z);
      const xzPos = this.dashLine.geometry.attributes.position.array; xzPos[1] = 0; xzPos[4] = xzTarget.y;
      this.dashLine.geometry.attributes.position.needsUpdate = true; this.dashLine.computeLineDistances();
    } else if (action === 'y') {
      // Use screen-space Y delta for intuitive vertical drag on mobile
      const camDist = state.targetObject.position.distanceTo(sceneRefs.camera.position);
      const screenDy = (mp.y - mouse.y) * camDist * 1.2;
      state.targetObject.position.y = startPos.y + screenDy;
      this.position.y = state.targetObject.position.y;
      // Ground marker at world Y=0.02 — update matrix then worldToLocal
      this.updateMatrixWorld(true);
      const yTarget = new THREE.Vector3(state.targetObject.position.x, 0.02, state.targetObject.position.z);
      this.worldToLocal(yTarget);
      this.groundRing.position.set(yTarget.x, yTarget.y, yTarget.z);
      this.groundDot.position.set(yTarget.x, yTarget.y, yTarget.z);
      // Dash line from gizmo local origin down to ground
      const pos = this.dashLine.geometry.attributes.position.array;
      pos[1] = 0; pos[4] = yTarget.y;
      this.dashLine.geometry.attributes.position.needsUpdate = true;
      this.dashLine.computeLineDistances();
    } else if (action === 'rotateY') {
      const yAxis = new THREE.Vector3(0, 1, 0);
      const apl = new THREE.Plane().setFromNormalAndCoplanarPoint(yAxis, state.targetObject.position);
      const sv = new THREE.Vector3(); rc.setFromCamera(mouse, sceneRefs.camera); rc.ray.intersectPlane(apl, sv);
      const cv = new THREE.Vector3(); rc.setFromCamera(mp, sceneRefs.camera); rc.ray.intersectPlane(apl, cv);
      if (sv && cv) {
        const ds = sv.sub(state.targetObject.position).normalize();
        const dc = cv.sub(state.targetObject.position).normalize();
        if (ds.length() > 0.01 && dc.length() > 0.01) {
          let ang = Math.atan2(ds.clone().cross(dc).dot(yAxis), ds.dot(dc)); if(this.userData.snapRotation)ang=Math.round(ang/(Math.PI/4))*Math.PI/4;
          state.targetObject.quaternion.copy(startRot.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(yAxis, ang)));
        }
      }
    } else if (action === 'scale') {
      // Scale uses camera-facing plane delta for up/down motion
      const cd = new THREE.Vector3();
      sceneRefs.camera.getWorldDirection(cd);
      const camPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(cd, state.targetObject.position);
      const sp2 = new THREE.Vector3(); rc.setFromCamera(mouse, sceneRefs.camera); rc.ray.intersectPlane(camPlane, sp2);
      const cp2 = new THREE.Vector3(); rc.setFromCamera(mp, sceneRefs.camera); rc.ray.intersectPlane(camPlane, cp2);
      if (sp2 && cp2) {
        const scaleDelta = cp2.clone().sub(sp2);
        const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);
        const dy = scaleDelta.dot(localUp);
        const factor = 1 + dy * 1.5;
        const magnitude = Math.max(0.1, Math.abs(startScale.x) * factor);
        state.targetObject.scale.set(
          Math.sign(startScale.x) * magnitude,
          Math.sign(startScale.y) * magnitude,
          Math.sign(startScale.z) * magnitude
        );
      }
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

  attach(obj) { state.targetObject = obj; this.position.copy(obj.position); this.quaternion.identity(); this.visible = true; }
  detach() { state.targetObject = null; this.visible = false; this.endDrag(); }
}
