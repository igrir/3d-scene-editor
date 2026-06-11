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
    this.axisGroups = {};
    for (let i = 0; i < 3; i++) {
      const axis = ['x', 'y', 'z'][i];
      const col = [0xff4444, 0x44ff44, 0x4488ff][i];
      const grp = new THREE.Group();
      // Tip — bigger for touch
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 8), M(col, 0.9));
      tip.position.set(0, 1.22, 0);
      tip.userData = { axis, action: 'translate', gizmo: this };
      // Ring — thicker for touch
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.025, 16, 32), M(col, 0.55));
      ring.rotation.x = Math.PI / 2;
      ring.userData = { axis, action: 'rotate', gizmo: this };
      // Scale cube — below the cone, smaller
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), M(col, 0.85));
      cube.position.set(0, 0.85, 0);
      cube.userData = { axis, action: 'scale', gizmo: this };
      // Pie indicator — hidden by default
      const pie = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 0.7, 32, 1, 0, 0),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })
      );
      pie.rotation.x = Math.PI / 2;
      pie.visible = false;
      pie.userData = { axis, role: 'pie' };

      grp.add(tip, ring, cube, pie);
      if (axis === 'x') grp.rotation.z = -Math.PI / 2;
      else if (axis === 'z') grp.rotation.x = Math.PI / 2;
      this.add(grp);
      this.axisGroups[axis] = grp;
      this.parts.push(tip, ring, cube);
    }
    // Center sphere — bigger
    this.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), M(0xffffff, 0.4)));
  }

  buildHelpers() {
    // Long axis lines — shown during translate/scale/rotate drag
    this.axisLines = {};
    ['x','y','z'].forEach(a => {
      const cols = { x: 0xff4444, y: 0x44ff44, z: 0x4488ff };
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3));
      const m = new THREE.LineBasicMaterial({ color: cols[a], transparent: true, opacity: 0.5, depthWrite: false });
      const l = new THREE.Line(g, m);
      l.visible = false;
      this.add(l);
      this.axisLines[a] = l;
    });
    // Ground projection helpers
    const M = (c, o) =>
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false });
    this.groundRing = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.5, 32), M(0x88aaff, 0.1));
    this.groundRing.rotation.x = -Math.PI / 2;
    this.groundRing.visible = false;
    this.add(this.groundRing);
    this.groundDot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), M(0x88aaff, 0.25));
    this.groundDot.rotation.x = -Math.PI / 2;
    this.groundDot.visible = false;
    this.add(this.groundDot);
  }

  hitTest(rc) {
    const h = rc.intersectObjects(this.parts, false);
    return h.length ? h[0].object : null;
  }

  setHover(p) {
    const defOp = { rotate: 0.55, scale: 0.85 }[this.hovered?.userData?.action] ?? 0.9;
    if (this.hovered && this.hovered !== p) this.hovered.material.opacity = defOp;
    this.hovered = p;
    if (p) { p.material.opacity = 1; sceneRefs.renderer.domElement.style.cursor = 'grab'; }
    else { sceneRefs.renderer.domElement.style.cursor = 'default'; }
  }

  // ── Axis line helper ──
  _showAxisLine(axis) {
    const ai = { x: 0, y: 1, z: 2 }[axis];
    const dir = new THREE.Vector3(ai === 0 ? 1 : 0, ai === 1 ? 1 : 0, ai === 2 ? 1 : 0);
    const line = this.axisLines[axis];
    if (!line) return;
    const pos = line.geometry.attributes.position.array;
    pos[0] = -dir.x * 10; pos[1] = -dir.y * 10; pos[2] = -dir.z * 10;
    pos[3] = dir.x * 10; pos[4] = dir.y * 10; pos[5] = dir.z * 10;
    line.geometry.attributes.position.needsUpdate = true;
    line.visible = true;
  }

  _hideAxisLines() {
    Object.values(this.axisLines).forEach(l => l.visible = false);
  }

  _getPie(axis) {
    const grp = this.axisGroups[axis];
    if (!grp) return null;
    return grp.children.find(c => c.userData?.role === 'pie') || null;
  }

  // ── Reset all children to default visibility ──
  _resetVisibility() {
    for (const grp of Object.values(this.axisGroups)) {
      for (const child of grp.children) {
        child.visible = !child.userData || child.userData.role !== 'pie';
      }
    }
    this._hideAxisLines();
    this.groundRing.visible = false;
    this.groundDot.visible = false;
  }

  startDrag(p, mp) {
    if (!state.targetObject) return;
    const act = p.userData.action;
    const ax = p.userData.axis;
    this.dragging = {
      part: p, axis: ax, action: act, mouse: mp.clone(),
      startPos: state.targetObject.position.clone(),
      startRot: state.targetObject.quaternion.clone(),
      startScale: state.targetObject.scale.clone(),
    };
    sceneRefs.orbit.enabled = false;
    sceneRefs.renderer.domElement.style.cursor = 'grabbing';
    this._hideAxisLines();

    if (act === 'translate' || act === 'scale') {
      this._showAxisLine(ax);
      if (act === 'translate') { this.groundRing.visible = true; this.groundDot.visible = true; }
    }

    if (act === 'rotate') {
      // Show only the active ring + pie; hide everything else
      for (const [otherAx, grp] of Object.entries(this.axisGroups)) {
        for (const child of grp.children) {
          if (child.userData?.role === 'pie') continue;
          child.visible = (otherAx === ax && child.userData?.action === 'rotate');
        }
      }
      this._showAxisLine(ax);

      // Compute initial mouse angle on the ring plane
      const localAxis = new THREE.Vector3(ax === 'x' ? 1 : 0, ax === 'y' ? 1 : 0, ax === 'z' ? 1 : 0);
      const wAxis = localAxis.clone().applyQuaternion(this.quaternion);
      const apl = new THREE.Plane().setFromNormalAndCoplanarPoint(wAxis, state.targetObject.position);
      const sv = new THREE.Vector3();
      const rc2 = new THREE.Raycaster().setFromCamera(mp, sceneRefs.camera);
      if (rc2 && rc2.ray) rc2.ray.intersectPlane(apl, sv);
      const initDir = sv.length() > 0
        ? sv.clone().sub(state.targetObject.position).normalize()
        : new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion).normalize();
      const refDir = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion).normalize();
      const ref = refDir.clone().sub(wAxis.clone().multiplyScalar(refDir.dot(wAxis))).normalize();
      this.dragging.initAngle = (ref.length() > 0.01)
        ? Math.atan2(wAxis.dot(ref.clone().cross(initDir)), ref.dot(initDir))
        : 0;
      this.dragging.ang = 0;

      // Show pie (zero-size initially)
      const pie = this._getPie(ax);
      if (pie) {
        pie.visible = true;
        pie.geometry.dispose();
        pie.geometry = new THREE.RingGeometry(0.6, 0.7, 32, 1, 0, 0);
      }
    }
  }

  dragUpdate(mp) {
    if (!this.dragging || !state.targetObject) return;
    const { axis, action, mouse, startPos, startRot, startScale, initAngle } = this.dragging;
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
          if (this.userData.snapRotation) ang = Math.round(ang / (Math.PI / 4)) * Math.PI / 4;
          state.targetObject.quaternion.copy(startRot.clone().multiply(new THREE.Quaternion().setFromAxisAngle(localAxis, ang)));
          this.dragging.ang = ang;

          // Update pie indicator
          const pie = this._getPie(axis);
          if (pie && Math.abs(ang) > 0.005) {
            const startA = initAngle;
            const endA = initAngle + ang;
            const r = 0.65;
            const w = 0.05;
            pie.geometry.dispose();
            pie.geometry = new THREE.RingGeometry(r - w, r + w, 48, 1, Math.min(startA, endA), Math.abs(ang));
          }
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
    this.groundRing.visible = false; this.groundDot.visible = false;
    this._hideAxisLines();
    this._resetVisibility();

    if (!this.dragging || !state.targetObject) return null;
    const r = {
      startPos: this.dragging.startPos, startRot: this.dragging.startRot, startScale: this.dragging.startScale,
      endPos: state.targetObject.position.clone(), endRot: state.targetObject.quaternion.clone(), endScale: state.targetObject.scale.clone(),
    };
    this.dragging = null;
    sceneRefs.orbit.enabled = true;
    sceneRefs.renderer.domElement.style.cursor = 'default';
    return r;
  }

  attach(obj) {
    state.targetObject = obj;
    this.position.copy(obj.position);
    this.quaternion.copy(obj.quaternion);
    this._resetVisibility();
    this.dragging = null;
    this.visible = true;
  }

  detach() {
    state.targetObject = null;
    this.dragging = null;
    this.visible = false;
  }
}
