import * as THREE from 'three';
import { sceneRefs, objects, selected, dropTargets } from './state.js';
import { refreshSelection } from './selection.js';
import { refreshPanel } from './panels.js';
import { cancelDropMode } from './drop-mode.js';
import { HISTORY_MAX_SIZE } from './constants.js';

export const history = {
  undoStack: [],
  redoStack: [],
  maxSize: HISTORY_MAX_SIZE,

  execute(a) {
    a.do();
    this.undoStack.push(a);
    this.redoStack = [];
    if (this.undoStack.length > this.maxSize) this.undoStack.shift();
    this.updateButtons();
  },

  undo() {
    if (!this.undoStack.length) return;
    cancelDropMode();
    const a = this.undoStack.pop();
    a.undo();
    this.redoStack.push(a);
    refreshSelection();
    refreshPanel();
    this.updateButtons();
  },

  redo() {
    if (!this.redoStack.length) return;
    cancelDropMode();
    const a = this.redoStack.pop();
    a.do();
    this.undoStack.push(a);
    refreshSelection();
    refreshPanel();
    this.updateButtons();
  },

  updateButtons() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.disabled = !this.undoStack.length;
    if (btnRedo) btnRedo.disabled = !this.redoStack.length;
  },
};

// ── action factories ──

export function actCreate(m) {
  return {
    do() {
      sceneRefs.scene.add(m);
      objects.push(m);
      dropTargets.push(m);
    },
    undo() {
      sceneRefs.scene.remove(m);
      selected.delete(m);
      const i = objects.indexOf(m);
      if (i >= 0) objects.splice(i, 1);
      const j = dropTargets.indexOf(m);
      if (j >= 0) dropTargets.splice(j, 1);
    },
  };
}

export function actDelete(ms) {
  const s = ms.map(m => ({
    mesh: m,
    pos: m.position.clone(),
    quat: m.quaternion.clone(),
    scl: m.scale.clone(),
    color: m.isGroup ? null : m.material.color.getHex(),
    type: m.userData.type,
  }));
  return {
    do() {
      for (const x of s) {
        sceneRefs.scene.remove(x.mesh);
        selected.delete(x.mesh);
        const i = objects.indexOf(x.mesh);
        if (i >= 0) objects.splice(i, 1);
        const j = dropTargets.indexOf(x.mesh);
        if (j >= 0) dropTargets.splice(j, 1);
      }
    },
    undo() {
      for (const x of s) {
        x.mesh.position.copy(x.pos);
        x.mesh.quaternion.copy(x.quat);
        x.mesh.scale.copy(x.scl);
        if (x.color !== null) x.mesh.material.color.setHex(x.color);
        sceneRefs.scene.add(x.mesh);
        objects.push(x.mesh);
        dropTargets.push(x.mesh);
      }
    },
  };
}

export function actDuplicate(o, c) {
  return {
    do() {
      sceneRefs.scene.add(c);
      objects.push(c);
      dropTargets.push(c);
    },
    undo() {
      sceneRefs.scene.remove(c);
      selected.delete(c);
      const i = objects.indexOf(c);
      if (i >= 0) objects.splice(i, 1);
      const j = dropTargets.indexOf(c);
      if (j >= 0) dropTargets.splice(j, 1);
    },
  };
}

export function actTransform(m, op, oq, os, np, nq, ns) {
  return {
    do() {
      m.position.copy(np);
      m.quaternion.copy(nq);
      m.scale.copy(ns);
    },
    undo() {
      m.position.copy(op);
      m.quaternion.copy(oq);
      m.scale.copy(os);
    },
  };
}

export function actColor(ms, oc, nc) {
  return {
    do() {
      const c = new THREE.Color(nc);
      ms.forEach(m => m.material.color.copy(c));
    },
    undo() {
      ms.forEach((m, i) => m.material.color.setHex(oc[i]));
    },
  };
}

export function actUniformScale(m, os, ns) {
  return {
    do() { m.scale.copy(ns); },
    undo() { m.scale.copy(os); },
  };
}
