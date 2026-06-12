import { selected, sceneRefs } from './state.js';
import { attachGizmo, detachGizmo } from './gizmo/index.js';
import { refreshPanel, syncBarColorToSelection } from './panels.js';

/** Get all meshes to outline from a selection set.
 *  Groups are expanded to their individual mesh children. */
function getOutlineTargets(sel) {
  const out = [];
  for (const m of sel) {
    if (m.isGroup) {
      m.children.forEach(c => {
        if (!c.isGroup) out.push(c);
        else c.children.forEach(cc => { if (!cc.isGroup) out.push(cc); });
      });
    } else {
      out.push(m);
    }
  }
  return out;
}

export function refreshSelection() {
  // Update OutlinePass selection — expand groups to their children
  if (sceneRefs.outlinePass) {
    sceneRefs.outlinePass.selectedObjects = getOutlineTargets(selected);
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
