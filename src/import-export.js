import { objects, selected, state } from './state.js';
import { createObj } from './objects.js';
import { history, actCreate } from './history.js';
import { refreshSelection } from './selection.js';
import { detachGizmo } from './gizmo/index.js';
import { showModal } from './panels.js';

export function setupImportExport() {
  document.getElementById('btn-export').addEventListener('click', () => {
    const data = objects.map(m => {
      const d = {
        type: m.userData.type,
        pos: m.position.toArray(),
        rot: [m.quaternion.x, m.quaternion.y, m.quaternion.z, m.quaternion.w],
        scl: m.scale.toArray(),
      };
      if (m.userData.type === 'image' && m.userData.imageSrc) {
        d.color = '#ffffff';
        d.img = m.userData.imageSrc;
      } else if (!m.isGroup) {
        d.color = '#' + m.material.color.getHexString();
      }
      return d;
    });
    showModal(
      '\u{1F4E4} Export Scene',
      JSON.stringify(data, null, 2),
      'Copy & Close',
      () => navigator.clipboard.writeText(JSON.stringify(data))
    );
  });

  document.getElementById('btn-import').addEventListener('click', () => {
    showModal(
      '\u{1F4E5} Import Scene',
      '[\n  {\n    "type": "box",\n    "pos": [0,0.5,0],\n    "rot": [0,0,0,1],\n    "scl": [1,1,1],\n    "color": "#e94560"\n  }\n]',
      'Import',
      json => {
        const data = JSON.parse(json);
        if (!Array.isArray(data)) throw new Error('Must be an array');
        for (const entry of data) {
          if (!entry.type) continue;
          const saved = state.nextColor;
          if (entry.color && entry.type !== 'image') {
            state.nextColor = entry.color;
          }
          const m = createObj(entry.type, entry.img || null);
          state.nextColor = saved;
          if (entry.pos) m.position.fromArray(entry.pos);
          if (entry.rot) m.quaternion.set(entry.rot[0], entry.rot[1], entry.rot[2], entry.rot[3]);
          if (entry.scl) m.scale.fromArray(entry.scl);
          if (entry.color && entry.type !== 'image' && !m.isGroup) {
            m.material.color.set(entry.color);
          }
          history.execute(actCreate(m));
        }
        selected.clear();
        detachGizmo();
        refreshSelection();
      }
    );
  });
}
