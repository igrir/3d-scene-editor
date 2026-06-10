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
    case 'bookshelf': return new THREE.BoxGeometry(1, 1, 1);
    default: return new THREE.BoxGeometry(1, 1, 1);
  }
}

export function halfHeight(t) {
  return { box: 0.5, sphere: 0.6, cylinder: 0.5, cone: 0.5, torus: 0.18, plane: 0.03, image: 0.005, bookshelf: 0.7 }[t] ?? 0.5;
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

function makeBookshelf() {
  'use strict';
  const g = new THREE.Group();
  g.userData.type = 'bookshelf';
  g.userData.isDropTarget = true;
  // Shelf dimensions
  const sw = 1.8, sh = 1.4, sd = 0.35;
  const thick = 0.05;
  const woodColor = 0x8B5E3C;
  const darkWood = 0x5C3A1E;
  // Helper: add a shelf board
  function addBoard(w, h, d, x, y, z, color) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData._root = g;
    g.add(mesh);
  }
  // Back panel
  addBoard(sw, sh, thick, 0, sh / 2, -sd / 2 + thick / 2, darkWood);
  // Side panels
  addBoard(thick, sh, sd, -sw / 2 + thick / 2, sh / 2, 0, darkWood);
  addBoard(thick, sh, sd, sw / 2 - thick / 2, sh / 2, 0, darkWood);
  // Shelves (4 shelves including bottom)
  const shelfYs = [0, sh / 3, sh * 2 / 3, sh - thick / 2];
  shelfYs.forEach(y => addBoard(sw - thick * 2, thick, sd - 0.02, 0, y, 0, woodColor));
  // Books
  const bookColors = [0xCC3333, 0x3366CC, 0x33AA55, 0xCC6633, 0x9933CC, 0xCC9933, 0x3399CC, 0xCC3366, 0x66CC33, 0x336699];
  const sections = [
    { startX: -sw / 2 + thick + 0.05, shelfY: shelfYs[1] + thick, maxW: sw / 3 - thick },
    { startX: -sw / 2 + thick + 0.05 + sw / 3, shelfY: shelfYs[2] + thick, maxW: sw / 3 - thick },
    { startX: -sw / 2 + thick + 0.05, shelfY: shelfYs[3] + thick, maxW: sw - thick * 2 - 0.1 },
  ];
  let ci = 0;
  sections.forEach(sec => {
    let cx = sec.startX;
    let tries = 0;
    while (cx < sec.startX + sec.maxW - 0.08 && tries < 12 && ci < bookColors.length) {
      tries++;
      const bw = 0.08 + Math.random() * 0.08;
      if (cx + bw > sec.startX + sec.maxW - 0.03) break;
      const bh = 0.15 + Math.random() * 0.2;
      const bd = sd - 0.08;
      const bGeo = new THREE.BoxGeometry(bw, bh, bd);
      const bMat = new THREE.MeshStandardMaterial({ color: bookColors[ci % bookColors.length], roughness: 0.4, metalness: 0.05 });
      const bMesh = new THREE.Mesh(bGeo, bMat);
      const tilt = (Math.random() - 0.5) * 0.06;
      bMesh.position.set(cx + bw / 2, sec.shelfY + bh / 2, Math.random() * 0.02 - 0.01);
      bMesh.rotation.z = tilt;
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
      bMesh.userData._root = g;
      g.add(bMesh);
      cx += bw + 0.01 + Math.random() * 0.015;
      ci++;
    }
  });
  // Reset ci for another batch if we have more colors
  ci = 0;
  // Top shelf books (leaning)
  const topSec = { startX: -sw / 2 + thick + 0.05 + sw / 3, shelfY: shelfYs[1] + thick, maxW: sw / 3 - thick };
  let cx2 = topSec.startX;
  let tries2 = 0;
  while (cx2 < topSec.startX + topSec.maxW - 0.08 && tries2 < 10 && ci < 5) {
    tries2++;
    const bw = 0.07 + Math.random() * 0.06;
    if (cx2 + bw > topSec.startX + topSec.maxW - 0.03) break;
    const bh = 0.25 + Math.random() * 0.15;
    const bGeo = new THREE.BoxGeometry(bw, bh, sd - 0.08);
    const bMat = new THREE.MeshStandardMaterial({ color: bookColors[(ci + 5) % bookColors.length], roughness: 0.4, metalness: 0.05 });
    const bMesh = new THREE.Mesh(bGeo, bMat);
    bMesh.position.set(cx2 + bw / 2, topSec.shelfY + bh / 2, -0.04);
    bMesh.rotation.z = 0.08 * (ci % 2 === 0 ? 1 : -1);
    bMesh.castShadow = true;
    bMesh.receiveShadow = true;
    bMesh.userData._root = g;
    g.add(bMesh);
    cx2 += bw + 0.01;
    ci++;
  }
  return g;
}

export function createObj(t, imgSrc) {
  if (t === 'bookshelf') return makeBookshelf();
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

function cloneGroup(g) {
  const cg = new THREE.Group();
  cg.userData.type = g.userData.type;
  cg.userData.isDropTarget = true;
  cg.position.copy(g.position);
  cg.quaternion.copy(g.quaternion);
  cg.scale.copy(g.scale);
  g.children.forEach(ch => {
    if (ch.isMesh) {
      const cm = new THREE.Mesh(ch.geometry.clone(), ch.material.clone());
      cm.position.copy(ch.position);
      cm.quaternion.copy(ch.quaternion);
      cm.scale.copy(ch.scale);
      cm.castShadow = ch.castShadow;
      cm.receiveShadow = ch.receiveShadow;
      cm.userData._root = cg;
      cg.add(cm);
    }
  });
  return cg;
}

export function dupSel() {
  if (!selected.size) return;
  const clones = [];
  for (const m of selected) {
    let c;
    if (m.isGroup) {
      c = cloneGroup(m);
      c.position.x += 0.6;
    } else {
      c = new THREE.Mesh(m.geometry.clone(), m.material.clone());
      c.position.copy(m.position);
      c.position.x += 0.6;
      c.quaternion.copy(m.quaternion);
      c.scale.copy(m.scale);
      c.castShadow = true;
      c.receiveShadow = m.receiveShadow;
      c.userData.type = m.userData.type;
      c.userData.isDropTarget = true;
      c.userData.imageSrc = m.userData.imageSrc;
    }
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
