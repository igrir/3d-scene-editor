import * as THREE from 'three';
import { state, objects, dropTargets, selected, sceneRefs } from './state.js';
import { refreshSelection } from './selection.js';
import { history, actDelete, actDuplicate } from './history.js';
import { detachGizmo } from './gizmo/index.js';

export function getGeom(t) {
  switch (t) {
    case 'box': return new THREE.BoxGeometry(1, 1, 1);
    case 'sphere': return new THREE.SphereGeometry(0.6, 24, 24);
    case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
    case 'cone': return new THREE.ConeGeometry(0.6, 1, 24);
    case 'torus': return new THREE.TorusGeometry(0.5, 0.18, 16, 24);
    case 'plane': return new THREE.BoxGeometry(1, 0.06, 1);
    case 'image': return new THREE.PlaneGeometry(1, 1);
    default: return new THREE.BoxGeometry(1, 1, 1);
  }
}

export function halfHeight(t) {
  return { box: 0.5, sphere: 0.6, cylinder: 0.5, cone: 0.5, torus: 0.18, plane: 0.03, image: 0.005 }[t] ?? 0.5;
}

export function makePlaceholderTex() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2a4a';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 32) {
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  ctx.fillStyle = '#888';
  ctx.font = 'bold 48px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\u{1F5BC}\uFE0F', 128, 128);
  ctx.font = '14px system-ui';
  ctx.fillStyle = '#666';
  ctx.fillText('Image', 128, 190);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = 'srgb';
  return tx;
}

export function createObj(t, imgSrc) {
  const geo = getGeom(t);
  let mat, m;
  if (t === 'image') {
    const src = imgSrc || '';
    if (src) {
      const tx = new THREE.TextureLoader().load(src);
      tx.colorSpace = 'srgb';
      mat = new THREE.MeshStandardMaterial({
        map: tx, transparent: true, roughness: 0.5, metalness: 0,
        side: THREE.DoubleSide
      });
      const img = new Image();
      img.onload = () => {
        const a = img.width / img.height;
        geo.scale(1, a, 1);
      };
      img.src = src;
    } else {
      mat = new THREE.MeshStandardMaterial({
        map: makePlaceholderTex(), transparent: true, roughness: 0.5,
        metalness: 0, side: THREE.DoubleSide
      });
    }
    m = new THREE.Mesh(geo, mat);
    m.castShadow = false;
    m.receiveShadow = false;
  } else {
    mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(state.nextColor),
      roughness: 0.3,
      metalness: 0.05
    });
    m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
  }
  m.userData.type = t;
  m.userData.isDropTarget = true;
  if (imgSrc) m.userData.imageSrc = imgSrc;
  return m;
}

export function delSel() {
  if (!selected.size) return;
  history.execute(actDelete([...selected]));
  selected.clear();
  detachGizmo();
  refreshSelection();
}

export function dupSel() {
  if (!selected.size) return;
  const clones = [];
  for (const m of selected) {
    const c = new THREE.Mesh(m.geometry.clone(), m.material.clone());
    c.position.copy(m.position);
    c.position.x += 0.6;
    c.quaternion.copy(m.quaternion);
    c.scale.copy(m.scale);
    c.castShadow = true;
    c.receiveShadow = m.receiveShadow;
    c.userData.type = m.userData.type;
    c.userData.isDropTarget = true;
    c.userData.imageSrc = m.userData.imageSrc;
    sceneRefs.scene.add(c);
    objects.push(c);
    dropTargets.push(c);
    clones.push(c);
    history.execute(actDuplicate(m, c));
  }
  selected.clear();
  clones.forEach(c => selected.add(c));
  refreshSelection();
}
