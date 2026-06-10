// ── Shared mutable state for the entire app ──

export const objects = [];
export const selected = new Set();
export const dropTargets = [];

export const state = {
  targetObject: null,
  multiTargets: [],
  multiInitStates: null,
  nextColor: '#e94560',
  gizmoMode: 'advanced',
  xzMode: 'plane',
  selectMode: 'default',
  dropMode: null,
  editingObject: null,
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
