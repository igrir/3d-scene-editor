import { DEFAULT_COLOR } from './constants.js';

// ── Shared mutable state for the entire app ──

export const objects = [];
export const selected = new Set();
export const dropTargets = [];

export const state = {
  targetObject: null,
  multiTargets: [],
  multiInitStates: null,
  nextColor: DEFAULT_COLOR,
  gizmoMode: 'simple',
  xzMode: 'surface',
  selectMode: 'default',
  toolMode: 'select',
  dropMode: null,
  editingObject: null,
  clipboard: [],
  focusSnapshot: null,
  scrubState: null,
  rectStart: null,
  rectEnd: null,
  rectDragging: false,
  sunHA: 45,
  sunVA: 45,
  ssaoEnabled: false,
  gizmoDragging: false,
  modalCallback: null,
};

export const sceneRefs = {
  selected: selected,
  scene: null,
  camera: null,
  renderer: null,
  orbit: null,
  composer: null,
  ssaoPass: null,
  sun: null,
  ambient: null,
  shadowPlane: null,
  gridHelper: null,
  raycaster: null,
  advGizmo: null,
  simGizmo: null,
  container: null,
  resize: null,
};
