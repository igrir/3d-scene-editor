import { selected, sceneRefs } from './state.js';
import { attachGizmo, detachGizmo } from './gizmo/index.js';
import { refreshPanel, syncBarColorToSelection } from './panels.js';

export function refreshSelection() {
  // Update OutlinePass selection
  if (sceneRefs.outlinePass) {
    sceneRefs.outlinePass.selectedObjects = [...selected].filter(m => !m.isGroup);
  }
  const arr = [...selected];
  if (arr.length === 1) {
    attachGizmo(arr[0]);
  } else if (arr.length > 1) {
    attachGizmo(arr[0], arr.slice(1));
  } else {
    detachGizmo();
  }
  refreshPanel();
  syncBarColorToSelection();
}
