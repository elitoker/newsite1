import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Simple jointed figures for now. The rig (hips, shoulders, head) matches what a
// rigged glTF model would need, so these can be swapped for real models later.

const geoCache = {};
const geo = (k, make) => geoCache[k] || (geoCache[k] = Object.assign(make(), { userData: { key: k } }));
const matCache = new Map();
function mat(hex, rough = 0.8) {
  const k = hex + '|' + rough;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: hex, roughness: rough }));
  return matCache.get(k);
}

const SKIN = ['#f1c9a5', '#e0ac85', '#c68863', '#a0674a', '#7a4a32', '#5a3524'];
const HAIR = ['#1b1512', '#3b2618', '#6b4a2e', '#a67b4f', '#d9c08a', '#8c8c8c', '#e8e2d6'];
const TOPS = ['#1c1c1e', '#2b3a55', '#6e2f2f', '#c9b79c', '#e9e5dc', '#4d5b3f', '#8a5a3b', '#3e3a5e', '#b9483a', '#2d5f63'];
const BOTTOMS = ['#1c1c1e', '#2e2e33', '#3c4452', '#6b5d4f', '#c8bfae', '#23324a'];
const COATS = ['#1c1c1e', '#6b5842', '#a88a62', '#34393f', '#5a2a2a', '#2e3a2e'];

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

export function makeCharacter(seed = Math.random() * 1e9, look = {}) {
  const r = rng(Math.floor(seed));
  const skin = look.skin || pick(r, SKIN);
  const hair = look.hair || pick(r, HAIR);
  const top = look.top || pick(r, TOPS);
  const bottom = look.bottom || pick(r, BOTTOMS);
  const coat = 'coat' in look ? look.coat : (r() < 0.3 ? pick(r, COATS) : null);
  const height = look.height || 1.58 + r() * 0.3;
  const hairStyle = look.hairStyle || (r() < 0.12 ? 'none' : r() < 0.4 ? 'long' : 'short');

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.scale.setScalar(height / 1.78);

  // Only the big parts cast shadows; hands, noses and ties are too small to see in a shadow
  const BIG = new Set(['leg', 'torso', 'coat', 'arm', 'head']);
  const mesh = (g, m, parent, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = BIG.has(g.userData.key);
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };

  // Legs hang from hip joints
  const hipL = new THREE.Group(), hipR = new THREE.Group();
  hipL.position.set(-0.095, 0.9, 0);
  hipR.position.set(0.095, 0.9, 0);
  for (const hp of [hipL, hipR]) {
    mesh(geo('leg', () => new THREE.CapsuleGeometry(0.068, 0.74, 4, 10)), mat(bottom), hp, 0, -0.44, 0);
    mesh(geo('shoe', () => new THREE.BoxGeometry(0.1, 0.07, 0.25)), mat('#161412', 0.5), hp, 0, -0.855, 0.04);
    body.add(hp);
  }

  const torso = mesh(geo('torso', () => new THREE.CapsuleGeometry(0.16, 0.36, 4, 14)), mat(top), body, 0, 1.2, 0);
  torso.scale.set(1.15, 1, 0.72);
  if (look.suit) {
    // Shirt front, tie and a lapel line on a dark jacket
    // A V of white shirt at the collar with a slim tie down the middle
    mesh(geo('shirt', () => new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.075, 0), new THREE.Vector2(0.075, 0), new THREE.Vector2(0, -0.2)]))), mat('#f2f0ea', 0.6), body, 0, 1.5, 0.121);
    mesh(geo('tie', () => new THREE.BoxGeometry(0.03, 0.26, 0.012)), mat(look.tie || '#1a1c24', 0.5), body, 0, 1.36, 0.126);
    mesh(geo('earpiece', () => new THREE.SphereGeometry(0.018, 8, 6)), mat('#e8e4dc', 0.4), body, 0.108, 1.66, 0);
  }
  if (coat) {
    const c = mesh(geo('coat', () => new THREE.CylinderGeometry(0.19, 0.27, 0.72, 14)), mat(coat, 0.85), body, 0, 0.98, 0);
    c.scale.z = 0.78;
  }

  // Arms hang from shoulder joints
  const shL = new THREE.Group(), shR = new THREE.Group();
  shL.position.set(-0.215, 1.46, 0);
  shR.position.set(0.215, 1.46, 0);
  for (const sh of [shL, shR]) {
    mesh(geo('arm', () => new THREE.CapsuleGeometry(0.05, 0.5, 4, 10)), mat(coat || top), sh, 0, -0.3, 0);
    mesh(geo('hand', () => new THREE.SphereGeometry(0.048, 12, 8)), mat(skin, 0.7), sh, 0, -0.6, 0);
    body.add(sh);
  }

  mesh(geo('neck', () => new THREE.CylinderGeometry(0.05, 0.055, 0.12, 10)), mat(skin, 0.7), body, 0, 1.56, 0);
  const head = new THREE.Group();
  head.position.set(0, 1.66, 0);
  body.add(head);
  mesh(geo('head', () => new THREE.SphereGeometry(0.112, 20, 16)), mat(skin, 0.7), head);
  mesh(geo('nose', () => new THREE.SphereGeometry(0.02, 8, 6)), mat(skin, 0.7), head, 0, -0.005, 0.108);
  if (look.beret) {
    // A soft beret, tipped to one side
    const b = mesh(geo('beret', () => new THREE.CylinderGeometry(0.13, 0.12, 0.05, 20)), mat(look.beret, 0.9), head, 0.02, 0.1, -0.01);
    b.rotation.z = -0.25;
    b.scale.z = 1.05;
  }
  if (hairStyle !== 'none') {
    const cap = mesh(geo('hairCap', () => new THREE.SphereGeometry(0.12, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52)), mat(hair, 0.9), head, 0, 0.012, -0.012);
    cap.rotation.x = -0.35;
    if (hairStyle === 'long') mesh(geo('hairLong', () => new THREE.BoxGeometry(0.22, 0.28, 0.08)), mat(hair, 0.9), head, 0, -0.13, -0.08);
  }

  // Merge each joint's parts into one mesh with the colors baked in, so a person is
  // six draw calls instead of fifteen. The joints themselves still move.
  for (const joint of [body, hipL, hipR, shL, shR, head]) bakeJoint(joint);

  // Animation: characters face +z; set root.rotation.y to turn them
  let phase = r() * 10, t = r() * 10;
  const cur = { l: 0, r: 0, al: 0, ar: 0, az: 0.06, hx: 0 };
  function animate(dt, speed, pose = 'idle') {
    t += dt;
    const moving = speed > 0.08;
    const amp = Math.min(0.6, speed * 0.45);
    if (moving) phase += dt * (3 + speed * 3.2);
    const s = Math.sin(phase);
    const look = pose === 'look' && !moving;
    const guard = pose === 'guard' && !moving;
    const k = 1 - Math.exp(-dt * 12);
    const target = {
      l: moving ? s * amp : 0,
      r: moving ? -s * amp : 0,
      al: moving ? -s * amp * 0.8 : (look ? 0.3 : guard ? -0.32 : 0.02),   // hands clasped behind the back while looking, in front on guard
      ar: moving ? s * amp * 0.8 : (look ? 0.3 : guard ? -0.32 : 0.02),
      az: look ? -0.15 : guard ? -0.22 : 0.06,
      hx: look ? -0.08 : 0,
    };
    for (const key in cur) cur[key] += (target[key] - cur[key]) * k;
    hipL.rotation.x = cur.l; hipR.rotation.x = cur.r;
    shL.rotation.x = cur.al; shR.rotation.x = cur.ar;
    shL.rotation.z = -cur.az; shR.rotation.z = cur.az;
    head.rotation.x = cur.hx;
    body.position.y = moving ? Math.abs(Math.cos(phase)) * 0.03 * (amp / 0.6) : 0;
    torso.scale.y = 1 + Math.sin(t * 1.6) * 0.012;
  }

  return { root, head, height, animate };
}

// One shared material for every person; each vertex carries its own color
const skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
const _c = new THREE.Color();
function bakeJoint(joint) {
  const parts = joint.children.filter(o => o.isMesh);
  if (parts.length < 2) return;
  const geos = [];
  let cast = false;
  for (const o of parts) {
    o.updateMatrix();
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    _c.copy(o.material.color);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = _c.r; col[i + 1] = _c.g; col[i + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
    cast ||= o.castShadow;
    joint.remove(o);
  }
  const m = new THREE.Mesh(mergeGeometries(geos), skinMat);
  m.castShadow = cast;
  m.receiveShadow = true;
  joint.add(m);
  geos.forEach(g => g.dispose());
}

// Free a character's merged geometry when it leaves the scene
export function disposeCharacter(ch) {
  ch.root.parent?.remove(ch.root);
  ch.root.traverse(o => { if (o.isMesh && o.material === skinMat) o.geometry.dispose(); });
}
