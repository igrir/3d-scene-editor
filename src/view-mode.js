// Scene definitions for viewer mode
// Each scene is an array of { type, pos, rot, scale, color }

export const SCENES = {
  chair: [
    // Seat
    { type: 'box', pos: [0, 0.4, 0], rot: [0, 0, 0], scale: [0.8, 0.1, 0.8], color: '#8B4513' },
    // Backrest
    { type: 'box', pos: [0, 0.75, -0.35], rot: [0.1, 0, 0], scale: [0.8, 0.5, 0.08], color: '#8B4513' },
    // Legs
    { type: 'cylinder', pos: [-0.35, 0.15, -0.35], rot: [0, 0, 0], scale: [0.06, 0.3, 0.06], color: '#5C3A1E' },
    { type: 'cylinder', pos: [0.35, 0.15, -0.35], rot: [0, 0, 0], scale: [0.06, 0.3, 0.06], color: '#5C3A1E' },
    { type: 'cylinder', pos: [-0.35, 0.15, 0.35], rot: [0, 0, 0], scale: [0.06, 0.3, 0.06], color: '#5C3A1E' },
    { type: 'cylinder', pos: [0.35, 0.15, 0.35], rot: [0, 0, 0], scale: [0.06, 0.3, 0.06], color: '#5C3A1E' },
  ],

  ball: [
    { type: 'sphere', pos: [0, 0.6, 0], rot: [0, 0, 0], scale: [1, 1, 1], color: '#FF6B35' },
    // Lines/accents using torus
    { type: 'torus', pos: [0, 0.6, 0], rot: [0, 0, 0], scale: [0.6, 0.05, 0.6], color: '#FFFFFF' },
    { type: 'torus', pos: [0, 0.6, 0], rot: [Math.PI / 2, 0, 0], scale: [0.6, 0.05, 0.6], color: '#FFFFFF' },
    { type: 'torus', pos: [0, 0.6, 0], rot: [0, 0, Math.PI / 2], scale: [0.6, 0.05, 0.6], color: '#FFFFFF' },
  ],

  tree: [
    // Trunk
    { type: 'cylinder', pos: [0, 0.5, 0], rot: [0, 0, 0], scale: [0.12, 1, 0.12], color: '#6B4226' },
    // Foliage layers — cones layered with some spread
    { type: 'cone', pos: [0, 1.3, 0], rot: [0, 0, 0], scale: [0.8, 0.4, 0.8], color: '#2D8A2D' },
    { type: 'cone', pos: [0, 1.7, 0], rot: [0, 0, 0], scale: [0.65, 0.35, 0.65], color: '#3AA33A' },
    { type: 'cone', pos: [0, 2.1, 0], rot: [0, 0, 0], scale: [0.5, 0.3, 0.5], color: '#4CBB4C' },
    { type: 'cone', pos: [0, 2.45, 0], rot: [0, 0, 0], scale: [0.3, 0.25, 0.3], color: '#5FD35F' },
  ],
};

export function getSceneNames() {
  return Object.keys(SCENES);
}
