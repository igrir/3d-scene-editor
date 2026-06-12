import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
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
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  container.appendChild(renderer.domElement);

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.minDistance = 1.5;
  orbit.maxDistance = 30;
  orbit.target.set(...CAMERA_TARGET);
  orbit.update();

  // Lights
  const ambient = new THREE.AmbientLight(0x8888bb, 0.6);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffeecc, 2.5);
  sun.position.set(8, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.0002;
  scene.add(sun);

  const fillLight = new THREE.DirectionalLight(0xaaaaff, 0.5);
  fillLight.position.set(-4, 3, -4);
  scene.add(fillLight);
  const hemiLight = new THREE.HemisphereLight(0x7799ee, 0x887766, 0.5);
  scene.add(hemiLight);

  // SSAO
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // FXAA — smooths jagged edges from post-processing
  const fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.uniforms['resolution'].value.set(1 / (W * renderer.getPixelRatio()), 1 / (H * renderer.getPixelRatio()));
  composer.addPass(fxaaPass);

  const ssaoPass = new SSAOPass(scene, camera, W, H);
  ssaoPass.kernelRadius = 0.5;
  ssaoPass.minDistance = 0.01;
  ssaoPass.maxDistance = 0.5;
  ssaoPass.enabled = false;
  composer.addPass(ssaoPass);

  // OutlinePass — after SSAO so it doesn't mess up depth/clearState for other passes
  const outlinePass = new OutlinePass(new THREE.Vector2(W, H), scene, camera, []);
  outlinePass.visibleEdgeColor = new THREE.Color(0xffee00);
  outlinePass.hiddenEdgeColor = new THREE.Color(0x885500);
  outlinePass.edgeStrength = 12;
  outlinePass.edgeThickness = 2;
  outlinePass.edgeGlow = 0;
  outlinePass.downSampleRatio = 1;

  // Replace overlay material with dashed-animated version
  outlinePass.overlayMaterial = buildDashedOverlayMaterial();
  outlinePass._dashTime = 0;

  composer.addPass(outlinePass);

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
    scene, camera, renderer, orbit, composer, ssaoPass, outlinePass, fxaaPass,
    sun, ambient, fillLight, hemiLight, shadowPlane, gridHelper, raycaster,
  });

  // Resize function — standard resizeRendererToDisplaySize pattern
  sceneRefs.resize = () => {
    const canvas = renderer.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const pixelRatio = renderer.getPixelRatio();
    const needResize = canvas.width !== Math.floor(w * pixelRatio) || canvas.height !== Math.floor(h * pixelRatio);
    if (needResize) {
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      ssaoPass.setSize(w, h);
      outlinePass.setSize(w, h);
      fxaaPass.uniforms['resolution'].value.set(1 / (w * pixelRatio), 1 / (h * pixelRatio));
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  return sceneRefs;
}

/** Create a custom overlay material for OutlinePass that adds scrolling dashes */
function buildDashedOverlayMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      maskTexture: { value: null },
      edgeTexture1: { value: null },
      edgeTexture2: { value: null },
      patternTexture: { value: null },
      edgeStrength: { value: 1.0 },
      edgeGlow: { value: 1.0 },
      usePatternTexture: { value: 0.0 },
      dashTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;

      uniform sampler2D maskTexture;
      uniform sampler2D edgeTexture1;
      uniform sampler2D edgeTexture2;
      uniform sampler2D patternTexture;
      uniform float edgeStrength;
      uniform float edgeGlow;
      uniform bool usePatternTexture;
      uniform float dashTime;

      void main() {
        vec4 edgeValue1 = texture2D(edgeTexture1, vUv);
        vec4 edgeValue2 = texture2D(edgeTexture2, vUv);
        vec4 maskColor = texture2D(maskTexture, vUv);
        vec4 edgeValue = edgeValue1 + edgeValue2 * edgeGlow;
        vec4 finalColor = edgeStrength * maskColor.r * edgeValue;

        // Scrolling dashed pattern — small dashes, dense, no glow
        float dashCoord = (vUv.x * 0.7 + vUv.y * 0.7) * 500.0 + dashTime * 8.0;
        float pattern = 1.0 - step(mod(dashCoord, 2.0), 1.0);

        float outlineIntensity = length(finalColor);
        if (outlineIntensity > 0.01) {
          finalColor *= pattern;
        }

        if (usePatternTexture) {
          vec4 patternColor = texture2D(patternTexture, 6.0 * vUv);
          float visibilityFactor = 1.0 - maskColor.g > 0.0 ? 1.0 : 0.5;
          finalColor += visibilityFactor * (1.0 - maskColor.r) * (1.0 - patternColor.r);
        }

        gl_FragColor = finalColor;
      }
    `,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
}
