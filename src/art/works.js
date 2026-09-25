import * as THREE from 'three';
import { scene, maxAniso } from '../engine.js';
import { state, emit, clamp } from '../state.js';
import { FRAME_STYLES } from '../config.js';
import { building, placeOnFace } from '../world/building.js';
import { frameMaterial, glowMat, isSharedMaterial, pictureLightParts } from '../world/materials.js';

const worksGroup = new THREE.Group();
scene.add(worksGroup);

export const workObjs = new Map();   // id -> { group, mat, hits }
let night = 0;

const texCache = new Map();
const loader = new THREE.TextureLoader();
loader.setCrossOrigin('anonymous');
function getTexture(src) {
  if (texCache.has(src)) return texCache.get(src);
  const p = new Promise((res, rej) => loader.load(src, t => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    res(t);
  }, undefined, err => { texCache.delete(src); rej(err); }));
  texCache.set(src, p);
  return p;
}

// Real size in meters. Area comes from the catalog; proportions come from the image itself.
export function workSize(w) {
  const aspect = w.aspect || 1;
  let H;
  if (w.hCm && w.wCm) H = Math.sqrt((w.hCm * w.wCm) / aspect) / 100;
  else if (w.hCm) H = w.hCm / 100;
  else H = 0.9;
  return { W: H * aspect, H };
}
export function outerSize(w) {
  const { W, H } = workSize(w);
  const b = FRAME_STYLES[state.frame].border;
  return { W: W + b * 2, H: H + b * 2 };
}

/* ---------------------------------------------------------------- labels */
export const labelCache = new Map();
function labelTexture(w) {
  if (labelCache.has(w.id)) return labelCache.get(w.id);
  const c = document.createElement('canvas'); c.width = 512; c.height = 340;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfbf9'; g.fillRect(0, 0, 512, 340);
  g.fillStyle = '#1f2023';
  g.font = '600 34px "Instrument Sans", system-ui, sans-serif';
  g.fillText(trimTo(g, w.artist || 'Unknown artist', 460), 26, 64);
  g.font = 'italic 38px "Instrument Serif", Georgia, serif';
  const lines = wrap(g, w.title || 'Untitled', 460).slice(0, 3);
  lines.forEach((l, i) => g.fillText(l, 26, 122 + i * 42));
  g.font = '26px "Instrument Sans", system-ui, sans-serif';
  g.fillStyle = '#5d5f66';
  let y = 122 + lines.length * 42 + 8;
  if (w.date) { g.fillText(trimTo(g, w.date, 460), 26, y); y += 36; }
  if (w.medium) g.fillText(trimTo(g, w.medium, 460), 26, y);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  labelCache.set(w.id, t);
  return t;
}
function wrap(g, text, max) {
  const out = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const test = line ? line + ' ' + word : word;
    if (g.measureText(test).width > max && line) { out.push(line); line = word; } else line = test;
  }
  if (line) out.push(line);
  return out;
}
function trimTo(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  while (text.length > 1 && g.measureText(text + '…').width > max) text = text.slice(0, -1);
  return text + '…';
}

/* ---------------------------------------------------------------- meshes */
export function makeWorkGroup(w, ghost = false) {
  const { W, H } = workSize(w);
  const fs = FRAME_STYLES[state.frame];
  const g = new THREE.Group();

  const fMat = ghost
    ? new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
    : frameMaterial(state.frame);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W + fs.border * 2, H + fs.border * 2, fs.depth), fMat);
  frame.position.z = fs.depth / 2 + 0.004;
  frame.castShadow = !ghost;
  frame.receiveShadow = true;
  g.add(frame);

  // A light varnish coat, so skylights catch on the surface like a real oil painting
  const mat = ghost
    ? new THREE.MeshBasicMaterial({ color: 0xd9d6cf, transparent: true, opacity: 0.8 })
    : new THREE.MeshPhysicalMaterial({ color: 0xd9d6cf, roughness: 0.7, clearcoat: 0.25, clearcoatRoughness: 0.35 });
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  canvas.position.z = fs.depth + 0.006;
  canvas.receiveShadow = !ghost;
  g.add(canvas);

  getTexture(w.src).then(t => {
    mat.map = t;
    mat.color.set(0xffffff);
    if (!ghost) {
      mat.emissiveMap = t;
      mat.emissive.set(0xffffff);
      mat.emissiveIntensity = emissiveFor(night);
    }
    mat.needsUpdate = true;
  }).catch(() => { if (!ghost) emit('toast', `Couldn't load the image for "${w.title}".`); });

  if (!ghost) {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(W + 1.4, H + 1.8), glowMat);
    glow.position.set(0, 0.2, 0.002);
    glow.renderOrder = 1;
    g.add(glow);
    canvas.userData.workId = w.id;
    frame.userData.workId = w.id;
    if (state.lighting.picture) addPictureLight(g, W, H + fs.border * 2, fs.depth);
  }
  return { group: g, mat, frameMat: fMat, hits: [canvas, frame] };
}

export function disposeGroup(g) {
  g.traverse(n => {
    if (n.geometry && !n.geometry.userData.shared) n.geometry.dispose();
    if (n.material && !isSharedMaterial(n.material)) n.material.dispose();
  });
}

function addLabel(obj, w, face) {
  const { W } = outerSize(w);
  const lw = 0.17, lh = lw * 340 / 512;
  let x = W / 2 + 0.2 + lw / 2;
  if (w.u + x + lw / 2 > face.len / 2 - 0.05) x = -x;
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(lw, lh),
    new THREE.MeshStandardMaterial({ map: labelTexture(w), roughness: 0.9 }),
  );
  label.position.set(x, 1.3 - w.v, 0.004);
  label.receiveShadow = true;
  obj.group.add(label);
}

export function syncWorks() {
  for (const o of workObjs.values()) { disposeGroup(o.group); worksGroup.remove(o.group); }
  workObjs.clear();
  for (const w of state.works) {
    const face = building.faces.get(w.faceId);
    if (!face) continue;
    const obj = makeWorkGroup(w);
    placeOnFace(obj.group, face, w.u, w.v, 0);
    if (state.labels) addLabel(obj, w, face);
    worksGroup.add(obj.group);
    workObjs.set(w.id, obj);
  }
  emit('works-synced');
}

export const workHitTargets = () => [...workObjs.values()].flatMap(o => o.hits);

// After the building changes, keep works on their walls or move them to storage.
export function refitWorks() {
  let moved = 0;
  const keep = [];
  for (const w of state.works) {
    const f = building.faces.get(w.faceId);
    const { W, H } = outerSize(w);
    if (!f || W > f.len - 0.2 || H > building.layout.h - 0.3) {
      const { faceId, u, v, ...rest } = w;
      state.storage.push(rest);
      labelCache.delete(w.id);
      moved++;
      continue;
    }
    const maxU = Math.max(0, f.len / 2 - W / 2 - 0.1);
    w.u = clamp(w.u, -maxU, maxU);
    w.v = clamp(w.v, H / 2 + 0.1, Math.max(H / 2 + 0.1, building.layout.h - H / 2 - 0.15));
    keep.push(w);
  }
  state.works = keep;
  return moved;
}

const emissiveFor = n => (state.lighting.picture ? 0.1 : 0.05) + n * 0.45;
export function applyNight(n) {
  night = n;
  glowMat.opacity = state.lighting.picture ? (0.14 + n * 0.45) * Math.min(1.3, state.lighting.brightness) : n * 0.3;
  for (const o of workObjs.values()) if (o.mat.map) o.mat.emissiveIntensity = emissiveFor(n);
}

// Brass picture light: an arm off the wall and a bar that washes the work from above
function addPictureLight(g, W, outerH, depth) {
  const { bar, arm, strip, brass, glow } = pictureLightParts();
  const len = clamp(W * 0.6, 0.3, 1.3);
  const y = outerH / 2 + 0.1, z = depth + 0.2;
  const b = new THREE.Mesh(bar, brass);
  b.scale.x = len;
  b.position.set(0, y, z);
  const a = new THREE.Mesh(arm, brass);
  a.position.set(0, y + 0.02, z / 2);
  a.rotation.x = -0.5;
  const s = new THREE.Mesh(strip, glow);
  s.scale.x = len * 0.92;
  s.position.set(0, y - 0.024, z - 0.005);
  s.rotation.x = Math.PI / 2 + 0.5;
  b.castShadow = a.castShadow = true;
  g.add(b, a, s);
}
