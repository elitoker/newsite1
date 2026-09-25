// Everything tunable in one place.

export const MUSEUM_NAME = 'Museum Machine';
export const STORE_KEY = 'curate-museum-v2';
export const OLD_STORE_KEY = 'curate-museum-v1';

// Human scale, in meters
export const EYE = 1.65;
export const CENTERLINE = 1.45;   // standard museum hanging height
export const PLAYER_R = 0.3;

// Architecture
export const WALL_T = 0.3;
export const DOOR_W = 2.6;
export const DOOR_H = 3.2;

export const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export const WALL_COLORS = [
  { name: 'Gallery white', hex: '#f1efea' },
  { name: 'Warm gray', hex: '#c9c3b8' },
  { name: 'Salon red', hex: '#7a2a2a' },
  { name: 'Verdigris', hex: '#3e5b50' },
  { name: 'Prussian blue', hex: '#26344d' },
  { name: 'Charcoal', hex: '#34332f' },
];

export const LAYOUTS = { hall: 'Grand hall', enfilade: 'Enfilade', single: 'One room' };
export const FLOORS = { oak: 'Oak', walnut: 'Walnut', concrete: 'Concrete' };
export const FRAME_STYLES = {
  none:  { label: 'None',  border: 0,     depth: 0.035, color: 0x2a2a2a, metal: 0,   rough: 0.8 },
  black: { label: 'Black', border: 0.035, depth: 0.045, color: 0x141414, metal: 0,   rough: 0.55 },
  oak:   { label: 'Oak',   border: 0.05,  depth: 0.05,  color: 0xa07448, metal: 0,   rough: 0.65 },
  gold:  { label: 'Gilt',  border: 0.08,  depth: 0.065, color: 0xc29a48, metal: 0.85, rough: 0.32 },
};
export const CAMERA_MODES = { first: 'First person', third: 'Third person', drone: 'Drone' };
export const QUALITY = { high: 'High', balanced: 'Balanced', fast: 'Fast' };

// Time of day, from noon (0) to night (1)
export const TIME_KEYS = [
  { t: 0,   name: 'Noon',        top: '#3a78c9', horizon: '#cfe2f3', ground: '#8c8a84', sun: '#fff4e0', sunI: 3.2, elev: 62,  hemiSky: '#dfeaf5', hemiI: 1.1,  night: 0 },
  { t: 0.4, name: 'Golden hour', top: '#4d7cc0', horizon: '#f6cf98', ground: '#7f7266', sun: '#ffd49a', sunI: 2.8, elev: 16,  hemiSky: '#f3dcc0', hemiI: 0.95, night: 0 },
  { t: 0.6, name: 'Sunset',      top: '#34487f', horizon: '#f07f52', ground: '#5d4a44', sun: '#ff9a5c', sunI: 2.0, elev: 3,   hemiSky: '#e8a888', hemiI: 0.7,  night: 0.2 },
  { t: 0.8, name: 'Dusk',        top: '#191c45', horizon: '#6e4a78', ground: '#2c2630', sun: '#b58ad0', sunI: 0,   elev: -8,  hemiSky: '#6c5f9a', hemiI: 0.32, night: 0.7 },
  { t: 1,   name: 'Night',       top: '#03071a', horizon: '#10183a', ground: '#08090e', sun: '#8090c0', sunI: 0,   elev: -30, hemiSky: '#2c3558', hemiI: 0.12, night: 1 },
];

export const SUGGESTIONS = ['Monet', 'Seurat', 'Van Gogh', 'Cassatt', 'Hokusai', 'Caillebotte', 'El Greco', 'Rembrandt'];

export const DEFAULTS = {
  layout: 'hall',
  room: { w: 28, d: 36, h: 5.5 },
  wallColor: WALL_COLORS[0].hex,
  floor: 'oak',
  frame: 'black',
  time: 0.15,
  labels: true,
  showTitle: 'Untitled Exhibition',
  works: [],     // hung: { id, faceId, u, v, src, title, artist, ... }
  storage: [],   // taken down or displaced by a layout change
  patrons: 10,
  quality: isTouch ? 'fast' : 'high',
  camera: 'first',
  lighting: { brightness: 1, warmth: 0.6, picture: true, fixture: 'track', spots: [] },
  backdrop: 'park',
  windows: true,
  furniture: [],  // { id, type, x, z, rot }
  guards: true,
};
