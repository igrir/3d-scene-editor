import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { sceneRefs, dropTargets } from './state.js';
import { DEFAULT_BG, CAMERA_POS, CAMERA_TARGET } from './constants.js';

export function initScene(container) {
  const W = container.clientWidth;
  const H = container.clientHeight;
  sceneRefs.container = container;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(DEFAULT_BG);

  const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
  camera.position.set(...CAMERA_POS);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.minDistance = 1.5;
  orbit.maxDistance = 30;
  orbit.target.set(...CAMERA_TARGET);
  orbit.update();

  // Lights
  const ambient = new THREE.AmbientLight(0x404060, 0.4);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffeedd, 3);
  sun.position.set(8, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);

  scene.add(new THREE.DirectionalLight(0x8888ff, 0.4).position.set(-4, 3, -4));
  scene.add(new THREE.HemisphereLight(0x4466ff, 0x443322, 0.4));

  // SSAO
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const ssaoPass = new SSAOPass(scene, camera, W, H);
  ssaoPass.kernelRadius = 0.5;
  ssaoPass.minDistance = 0.01;
  ssaoPass.maxDistance = 0.5;
  ssaoPass.enabled = false;
  composer.addPass(ssaoPass);

  // Grid
  const gridHelper = new THREE.GridHelper(20, 20, 0x5555aa, 0x333366);
  scene.add(gridHelper);

  // Shadow plane
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.ShadowMaterial({ opacity: 0.25 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.receiveShadow = true;
  shadowPlane.userData.isDropTarget = true;
  scene.add(shadowPlane);
  dropTargets.push(shadowPlane);

  // Raycaster
  const raycaster = new THREE.Raycaster();

  // Store all refs
  Object.assign(sceneRefs, {
    scene, camera, renderer, orbit, composer, ssaoPass,
    sun, ambient, shadowPlane, gridHelper, raycaster,
  });

  // Resize function stored so panels / input can call it
  sceneRefs.resize = () => {
    const w = sceneRefs.container.clientWidth;
    const h = sceneRefs.container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    ssaoPass.setSize(w, h);
  };

  return sceneRefs;
}
