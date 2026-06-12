import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
    case 'pyramid': return new THREE.ConeGeometry(0.6, 1, 4);
    case 'halfdonut': return new THREE.TorusGeometry(0.5, 0.18, 16, 24, Math.PI);
    case 'donut': return new THREE.TorusGeometry(0.5, 0.18, 16, 24);
    case 'quarterdonut': return new THREE.TorusGeometry(0.5, 0.18, 16, 24, Math.PI / 2);
    case 'halfball': return new THREE.SphereGeometry(0.6, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    case 'quarterball': return new THREE.SphereGeometry(0.6, 24, 16, 0, Math.PI / 2, 0, Math.PI / 2);
    case 'bowl': return new THREE.BoxGeometry(0.7, 0.4, 0.7);
    case 'isotriangle': return makeTriShape([[-0.5, -0.5], [0.5, -0.5], [0, 0.5]]);
    case 'righttriangle': return makeTriShape([[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5]]);
    case 'torus': return new THREE.TorusGeometry(0.5, 0.18, 16, 24);
    case 'plane': return new THREE.BoxGeometry(1, 0.06, 1);
    case 'image': return new THREE.PlaneGeometry(1, 1);
    default: return new THREE.BoxGeometry(1, 1, 1);
  }
}

export function halfHeight(t) {
  return { box: 0.5, sphere: 0.6, cylinder: 0.5, cone: 0.5, pyramid: 0.5, torus: 0.18, plane: 0.03, image: 0.005, halfdonut: 0.18, donut: 0.18, quarterdonut: 0.18, halfball: 0.3, quarterball: 0.3, bowl: 0.5, isotriangle: 0.5, righttriangle: 0.5 }[t] ?? 0.5;
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

function makeTriShape(pts) {
  const shape = new THREE.Shape();
  pts.forEach((p, i) => i === 0 ? shape.moveTo(p[0], p[1]) : shape.lineTo(p[0], p[1]));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
  // Shift up so bottom sits at y=0
  const minY = Math.min(...pts.map(p => p[1]));
  geo.translate(0, -minY, -0.05);
  return smoothGeo(geo);
}

function smoothGeo(g) {
  try { g = mergeVertices(g, 0.001); } catch(e) {}
  g.computeVertexNormals();
  return g;
}

function getPrimitiveGeo(t) {
  switch (t) {
    case 'halfdonut': return smoothGeo(new THREE.TorusGeometry(0.5, 0.18, 24, 40, Math.PI));
    case 'donut': return new THREE.TorusGeometry(0.5, 0.18, 16, 24);
    case 'quarterdonut': return smoothGeo(new THREE.TorusGeometry(0.5, 0.18, 24, 40, Math.PI / 2));
    case 'halfball': return smoothGeo(new THREE.SphereGeometry(0.6, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2));
    case 'quarterball': return smoothGeo(new THREE.SphereGeometry(0.6, 32, 24, 0, Math.PI / 2, 0, Math.PI / 2));
    case 'bowl': {
      const pts = [];
      const R = 0.5;
      const thickness = 0.06;
      const innerR = R - thickness;
      const steps = 16;
      // Outer surface: outer rim → bottom (quarter circle)
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const a = t * Math.PI * 0.5;
        pts.push(new THREE.Vector2(R * Math.cos(a), -R * Math.sin(a)));
      }
      // Inner surface: bottom → inner rim (quarter circle, smaller radius)
      for (let i = steps; i >= 0; i--) {
        const t = i / steps;
        const a = t * Math.PI * 0.5;
        pts.push(new THREE.Vector2(innerR * Math.cos(a), -innerR * Math.sin(a)));
      }
      // Close rim: inner rim → outer rim
      pts.push(new THREE.Vector2(R, 0));
      return smoothGeo(new THREE.LatheGeometry(pts, 48));
    }
    case 'isotriangle': return makeTriShape([[-0.5, -0.5], [0.5, -0.5], [0, 0.5]]);
    case 'righttriangle': return makeTriShape([[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5]]);
    default: return null;
  }
}

export function getCreateGeom(t) {
  if (t === 'image' || t === 'bookshelf') return getGeom(t);
  return getPrimitiveGeo(t) || getGeom(t);
}

export function createObj(t, imgSrc) {
  const primGeo = (t !== 'image' && t !== 'bookshelf') ? getPrimitiveGeo(t) : null;
  if (primGeo) {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(state.nextColor),
      roughness: 0.7,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(primGeo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.type = t;
    m.userData.name = t;
    m.userData.isDropTarget = true;
    return m;
  }
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
      roughness: 0.7,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
  }
  m.userData.type = t;
  m.userData.name = t;
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
  cg.userData.name = g.userData.name || g.userData.type;
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
      c.userData.name = m.userData.name || m.userData.type;
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

// ── Icon generation ──

let _iconRenderer = null, _iconScene = null, _iconCam = null, _iconCvs = null;

function getIconRenderer() {
  if (!_iconRenderer) {
    _iconCvs = document.createElement('canvas');
    _iconCvs.width = 64; _iconCvs.height = 64;
    _iconRenderer = new THREE.WebGLRenderer({ canvas: _iconCvs, alpha: true, antialias: true });
    _iconRenderer.setPixelRatio(1);
    _iconScene = new THREE.Scene();
    _iconScene.background = new THREE.Color(0xE8E8F0);
    _iconCam = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  }
  return _iconRenderer;
}

export function generateAllIcons(color) {
  const icons = {};
  const iconTypes = ['box','sphere','cylinder','cone','pyramid','torus','halfdonut','quarterdonut','halfball','quarterball','bowl','isotriangle','righttriangle','plane'];
  
  const renderer = getIconRenderer();
  const sc = _iconScene;
  const cam = _iconCam;
  const cvs = _iconCvs;
  
  // Clear scene
  while (sc.children.length) sc.remove(sc.children[0]);
  
  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(2, 3, 2);
  sc.add(light);
  sc.add(new THREE.AmbientLight(0xffffff, 0.4));
  
  iconTypes.forEach(t => {
    // Remove previous mesh, keep lights
    while (sc.children.length > 2) sc.remove(sc.children[0]);
    
    const mesh = createObjIcon(t, color);
    if (!mesh) return;
    sc.add(mesh);
    
    // Center & scale to fit
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const maxD = Math.max(size.x, size.y, size.z);
    const s = 1.5 / maxD;
    mesh.scale.set(s, s, s);
    // Re-center after scale
    const bx2 = new THREE.Box3().setFromObject(mesh);
    const ctr = bx2.getCenter(new THREE.Vector3());
    mesh.position.sub(ctr);
    
    // Camera position based on type — pull back so the whole object fits nicely
    if (t === 'plane' || t === 'isotriangle' || t === 'righttriangle') {
      cam.position.set(2.5, 1.5, 3.5);
    } else {
      cam.position.set(3, 2, 3.5);
    }
    cam.lookAt(0, 0, 0);
    
    renderer.render(sc, cam);
    icons[t] = cvs.toDataURL('image/png');
    
    sc.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  });
  
  return icons;
}

function createObjIcon(t, color) {
  const primGeo = getPrimitiveGeo(t);
  const geo = primGeo || getGeom(t);
  const mat = new THREE.MeshStandardMaterial({
    color: color || 0x8888bb,
    roughness: 0.7,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
