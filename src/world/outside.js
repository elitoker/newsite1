import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene } from '../engine.js';
import { state } from '../state.js';
import { building } from './building.js';
import { worldUV, groundMaterial, lawnMaterial, asphaltMaterial, pathMaterial, towerTextures, facadeMaterial } from './materials.js';
import { bulbMat } from './lighting.js';

// What you see out the windows: a park, a city block, or a stone plaza.
// Everything repeated is instanced or merged, so the whole backdrop is a handful of draw calls.

export const BACKDROPS = { park: 'Park', city: 'City', plaza: 'Plaza' };

const group = new THREE.Group();
scene.add(group);

const mats = {};
const mat = (k, make) => mats[k] || (mats[k] = make());
let towerMat = null;

// Seeded random so the view out the window stays the same between visits
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const between = (a, b) => a + rnd() * (b - a);

function ground(material, size = 900) {
  const g = new THREE.PlaneGeometry(size, size);
  g.rotateX(-Math.PI / 2);
  worldUV(g, material === mats.lawn ? 6 : 8);
  const m = new THREE.Mesh(g, material);
  m.position.y = -0.02;
  m.receiveShadow = true;
  group.add(m);
}

function strip(material, x0, z0, x1, z1, y = 0) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  worldUV(g, 4);
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  group.add(m);
}

// Is (x, z) clear of the building plus a margin?
const clearOf = (B, x, z, m) => x < B.x0 - m || x > B.x1 + m || z < B.z0 - m || z > B.z1 + m;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
function instances(geo, material, list, { shadow = false, colors = null } = {}) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, material, list.length);
  list.forEach((t, i) => {
    _q.setFromAxisAngle(_p.set(0, 1, 0), t.ry || 0);
    im.setMatrixAt(i, _m.compose(_p.set(t.x, t.y || 0, t.z), _q, _s.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1)));
    if (colors) im.setColorAt(i, _c.set(colors[i]));
  });
  im.castShadow = shadow;
  im.receiveShadow = true;
  group.add(im);
  return im;
}

const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 7).translate(0, 0.5, 0);
const crownGeo = new THREE.IcosahedronGeometry(1, 1);
const LEAVES = ['#4f6f35', '#5e7d3c', '#3f5f2c', '#6c8a45', '#56743a', '#7a8f4a'];

function trees(list) {
  const trunk = mat('trunk', () => new THREE.MeshStandardMaterial({ color: 0x5a4432, roughness: 1 }));
  const leaf = mat('leaf', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }));
  instances(trunkGeo, trunk, list.map(t => ({ x: t.x, z: t.z, sx: t.s, sz: t.s, sy: t.h * 0.55 })), { shadow: true });
  // Two overlapping crowns per tree read as a fuller canopy
  const crowns = [], colors = [];
  for (const t of list) {
    const c = LEAVES[Math.floor(rnd() * LEAVES.length)];
    crowns.push({ x: t.x, y: t.h * 0.62, z: t.z, sx: t.r, sy: t.r * 0.85, sz: t.r, ry: rnd() * 6 });
    crowns.push({ x: t.x + between(-0.6, 0.6), y: t.h * 0.82, z: t.z + between(-0.6, 0.6), s: t.r * 0.7, ry: rnd() * 6 });
    colors.push(c, c);
  }
  instances(crownGeo, leaf, crowns, { shadow: true, colors });
}

function streetLamps(list) {
  const pole = mat('pole', () => new THREE.MeshStandardMaterial({ color: 0x222326, roughness: 0.5, metalness: 0.6 }));
  instances(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 8).translate(0, 2.1, 0), pole, list);
  instances(new THREE.SphereGeometry(0.22, 12, 8), bulbMat, list.map(p => ({ ...p, y: 4.3 })));
}

/* ---------------------------------------------------------------- park */
function park(B) {
  ground(mat('lawn', lawnMaterial));
  const path = mat('path', pathMaterial);
  const cx = (B.x0 + B.x1) / 2;
  // A gravel walk from the entrance, a crossing path, and a loop around the building
  strip(path, cx - 2.2, B.z1, cx + 2.2, B.z1 + 90, 0.005);
  strip(path, B.x0 - 90, B.z1 + 22, B.x1 + 90, B.z1 + 26, 0.006);
  strip(path, B.x0 - 5, B.z0 - 5, B.x1 + 5, B.z0 - 2, 0.004);
  strip(path, B.x0 - 5, B.z1 + 2, B.x1 + 5, B.z1 + 5, 0.004);
  strip(path, B.x0 - 5, B.z0 - 5, B.x0 - 2, B.z1 + 5, 0.004);
  strip(path, B.x1 + 2, B.z0 - 5, B.x1 + 5, B.z1 + 5, 0.004);

  // Clipped hedges around the building, open at the entrance walk
  const hedge = mat('hedge', () => new THREE.MeshStandardMaterial({ color: 0x3f5a2c, roughness: 1 }));
  const hedges = [];
  const run = (x0, z0, x1, z1) => hedges.push({ x: (x0 + x1) / 2, y: 0.5, z: (z0 + z1) / 2, sx: Math.max(0.8, x1 - x0), sy: 1, sz: Math.max(0.8, z1 - z0) });
  run(B.x0 - 7, B.z0 - 7, B.x1 + 7, B.z0 - 6.2);
  run(B.x0 - 7, B.z0 - 7, B.x0 - 6.2, B.z1 + 7);
  run(B.x1 + 6.2, B.z0 - 7, B.x1 + 7, B.z1 + 7);
  run(B.x0 - 7, B.z1 + 6.2, cx - 4, B.z1 + 7);
  run(cx + 4, B.z1 + 6.2, B.x1 + 7, B.z1 + 7);
  instances(new THREE.BoxGeometry(1, 1, 1), hedge, hedges, { shadow: true });

  const list = [];
  for (let i = 0; i < 420 && list.length < 300; i++) {
    const a = rnd() * Math.PI * 2, r = 14 + Math.pow(rnd(), 0.7) * 150;
    const x = cx + Math.cos(a) * r, z = (B.z0 + B.z1) / 2 + Math.sin(a) * r;
    if (!clearOf(B, x, z, 10)) continue;
    if (Math.abs(x - cx) < 5 && z > B.z1) continue;           // keep the walk clear
    if (Math.abs(z - (B.z1 + 24)) < 4) continue;
    const h = between(6, 13);
    list.push({ x, z, h, r: between(2, 3.6), s: between(0.9, 1.5) });
  }
  trees(list);

  const lamps = [];
  for (let z = B.z1 + 8; z < B.z1 + 90; z += 12) lamps.push({ x: cx - 3.2, z }, { x: cx + 3.2, z });
  streetLamps(lamps);

  // Low hills on the horizon
  const hill = mat('hill', () => new THREE.MeshStandardMaterial({ color: 0x5f7654, roughness: 1, flatShading: true }));
  const hills = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rnd() * 0.2;
    hills.push({ x: cx + Math.cos(a) * 260, y: -6, z: Math.sin(a) * 260, sx: between(50, 90), sy: between(16, 34), sz: between(40, 70) });
  }
  instances(new THREE.IcosahedronGeometry(1, 2), hill, hills);
}

/* ---------------------------------------------------------------- city */
function towers(B, { near, far, minH, maxH, gap = 26 }) {
  if (!towerMat) {
    const t = towerTextures();
    towerMat = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6, metalness: 0.2 });
  }
  const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
  const geos = [];
  for (let gx = -far; gx <= far; gx += gap) {
    for (let gz = -far; gz <= far; gz += gap) {
      const x = cx + gx, z = cz + gz;
      if (!clearOf(B, x, z, near)) continue;
      if (Math.hypot(gx, gz) > far) continue;
      const w = between(12, gap - 8), d = between(12, gap - 8);
      const dist = Math.hypot(gx, gz);
      const h = between(minH, minH + (maxH - minH) * Math.min(1, dist / far + 0.2));
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, h / 2, z);
      // Windows follow world position; roofs sample a plain corner of the texture
      const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(n.getY(i)) > 0.5) { uv.setXY(i, 0.005, 0.005); continue; }
        const u = Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i);
        uv.setXY(i, u / 25.6, p.getY(i) / 56);
      }
      geos.push(g);
    }
  }
  if (!geos.length) return;
  const m = new THREE.Mesh(mergeGeometries(geos), towerMat);
  m.receiveShadow = true;
  group.add(m);
  geos.forEach(g => g.dispose());
}

function city(B) {
  ground(mat('asphalt', asphaltMaterial));
  const stone = mat('plaza', groundMaterial);
  // Sidewalk around the museum, then a road ring
  strip(stone, B.x0 - 9, B.z0 - 9, B.x1 + 9, B.z1 + 9, 0.01);
  const line = mat('line', () => new THREE.MeshStandardMaterial({ color: 0xe8d9a0, roughness: 0.8 }));
  const dash = [];
  for (let x = B.x0 - 30; x < B.x1 + 30; x += 6) dash.push({ x, z: B.z1 + 17, y: 0.012, sx: 2.5, sz: 0.15 }, { x, z: B.z0 - 17, y: 0.012, sx: 2.5, sz: 0.15 });
  for (let z = B.z0 - 30; z < B.z1 + 30; z += 6) dash.push({ x: B.x0 - 17, z, y: 0.012, sx: 0.15, sz: 2.5 }, { x: B.x1 + 17, z, y: 0.012, sx: 0.15, sz: 2.5 });
  instances(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), line, dash);

  towers(B, { near: 30, far: 190, minH: 14, maxH: 110 });

  const cx = (B.x0 + B.x1) / 2;
  const list = [], lamps = [];
  for (let x = B.x0 - 6; x <= B.x1 + 6; x += 8) {
    list.push({ x, z: B.z1 + 7.5, h: between(6, 8), r: between(1.6, 2.2), s: 0.9 }, { x, z: B.z0 - 7.5, h: between(6, 8), r: between(1.6, 2.2), s: 0.9 });
    lamps.push({ x: x + 4, z: B.z1 + 8.2 }, { x: x + 4, z: B.z0 - 8.2 });
  }
  for (let z = B.z0 - 6; z <= B.z1 + 6; z += 8) {
    list.push({ x: B.x0 - 7.5, z, h: between(6, 8), r: between(1.6, 2.2), s: 0.9 }, { x: B.x1 + 7.5, z, h: between(6, 8), r: between(1.6, 2.2), s: 0.9 });
  }
  trees(list.filter(t => Math.abs(t.x - cx) > 4 || t.z < B.z1));
  streetLamps(lamps);
}

/* ---------------------------------------------------------------- plaza */
function plaza(B) {
  ground(mat('plaza', groundMaterial));
  const cx = (B.x0 + B.x1) / 2;
  // Planters with trees in a formal grid, and low buildings framing the square
  const planter = mat('planter', facadeMaterial);
  const spots = [];
  for (let x = B.x0 - 16; x <= B.x1 + 16; x += 10) for (let z = B.z0 - 16; z <= B.z1 + 40; z += 10) {
    if (!clearOf(B, x, z, 8) || Math.abs(x - cx) < 6) continue;
    spots.push({ x, z, h: between(5, 7), r: between(1.5, 2.1), s: 0.8 });
  }
  instances(new THREE.BoxGeometry(2, 0.6, 2).translate(0, 0.3, 0), planter, spots, { shadow: true });
  trees(spots);
  const lamps = spots.filter((_, i) => i % 3 === 0).map(s => ({ x: s.x + 2.5, z: s.z }));
  streetLamps(lamps);
  towers(B, { near: 70, far: 200, minH: 10, maxH: 45, gap: 30 });
}

/* ---------------------------------------------------------------- build and night */
export function buildOutside() {
  group.traverse(o => { if (o.geometry && o.geometry !== trunkGeo && o.geometry !== crownGeo) o.geometry.dispose(); });
  group.clear();
  const B = building.layout?.bounds;
  if (!B) return;
  seed = 12345;
  ({ park, city, plaza }[state.backdrop] || park)(B);
  if (state.landmark === 'pyramid') pyramid(B);
}

export function applyOutsideNight(night) {
  if (towerMat) towerMat.emissiveIntensity = night * 1.4;
}

// A glass pyramid in the forecourt, for the Louvre look
function pyramid(B) {
  const cx = (B.x0 + B.x1) / 2, z = B.z1 + 34, r = 17, h = 21;
  const glass = mat('pyramidGlass', () => {
    const m = new THREE.MeshStandardMaterial({ color: 0xbcd3dc, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.5, side: THREE.DoubleSide, depthWrite: false });
    m.userData.envScale = 3;
    return m;
  });
  const geo = new THREE.ConeGeometry(r, h, 4, 1, true);
  geo.rotateY(Math.PI / 4);
  geo.translate(cx, h / 2, z);
  const m = new THREE.Mesh(geo, glass);
  m.renderOrder = 3;
  group.add(m);
  // Steel lattice lines on each face
  const pts = [];
  const apex = new THREE.Vector3(cx, h, z);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new THREE.Vector3(cx + a * r * Math.SQRT1_2, 0, z + b * r * Math.SQRT1_2));
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    for (let k = 0; k <= 10; k++) {
      const p = a.clone().lerp(b, k / 10);
      pts.push(p, apex);
      const q = a.clone().lerp(apex, k / 10), s = b.clone().lerp(apex, k / 10);
      pts.push(q, s);
    }
  }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat('lattice', () => new THREE.LineBasicMaterial({ color: 0x3a3f44, transparent: true, opacity: 0.6 })));
  group.add(lines);
  // Fountain pools around it
  const water = mat('fountain', () => { const w = new THREE.MeshStandardMaterial({ color: 0x1d3440, roughness: 0.03, metalness: 0.4 }); w.userData.envScale = 3; return w; });
  for (const [dx, dz] of [[-1, 0], [1, 0]]) strip(water, cx + dx * (r + 4) - 7, z - 7, cx + dx * (r + 4) + 7, z + 7, 0.03);
}
