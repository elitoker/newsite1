import * as THREE from 'three';
import { scene } from '../engine.js';
import { state } from '../state.js';
import { building } from './building.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { roomAt } from '../actors/nav.js';

// Furniture the curator places: benches, sofas, plants, rugs, plinths and more.
// Each piece is built from simple shapes and has a footprint used for collisions.

const M = {};
const mat = (k, o) => M[k] || (M[k] = new THREE.MeshStandardMaterial(o));
const wood = () => mat('wood', { color: 0x6b4a32, roughness: 0.5 });
const darkWood = () => mat('darkWood', { color: 0x3a2a1e, roughness: 0.45 });
const steel = () => mat('steel', { color: 0x1d1d1f, roughness: 0.35, metalness: 0.8 });
const chrome = () => mat('chrome', { color: 0xdddddd, roughness: 0.15, metalness: 1 });
const leather = () => mat('leather', { color: 0x2a2320, roughness: 0.55 });
const tan = () => mat('tan', { color: 0x9a6a44, roughness: 0.6 });
const white = () => mat('white', { color: 0xf2f0ea, roughness: 0.8 });
const terracotta = () => mat('terracotta', { color: 0xb46a45, roughness: 0.9 });
const concrete = () => mat('concrete', { color: 0x9c9993, roughness: 0.95 });
const soil = () => mat('soil', { color: 0x2e2419, roughness: 1 });
const leaf = () => mat('leaf', { color: 0x3f6b35, roughness: 0.8, side: THREE.DoubleSide });
const palm = () => mat('palm', { color: 0x4f7a3a, roughness: 0.8, side: THREE.DoubleSide });
const marble = () => mat('marble', { color: 0xeeebe4, roughness: 0.35 });
const bronze = () => mat('bronze', { color: 0x8a5a2b, roughness: 0.3, metalness: 0.9 });
const brass = () => mat('brass', { color: 0xb08d57, roughness: 0.3, metalness: 0.9 });
const rope = () => mat('rope', { color: 0x7a1f24, roughness: 0.7 });
const glass = () => {
  if (!M.glass) { M.glass = new THREE.MeshStandardMaterial({ color: 0xdbe8ec, transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false }); M.glass.userData.envScale = 3; }
  return M.glass;
};
const rugMat = (k, draw) => {
  if (M[k]) return M[k];
  const c = document.createElement('canvas'); c.width = c.height = 256;
  draw(c.getContext('2d'), 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (M[k] = new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
};

function part(g, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.castShadow = o.receiveShadow = true;
  g.add(o);
  return o;
}
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C = (rt, rb, h, s = 16) => new THREE.CylinderGeometry(rt, rb, h, s);

function leafyPlant(g, height, spread, m) {
  // Stems with flat leaves fanned around them, like a fiddle leaf fig
  const lg = new THREE.PlaneGeometry(0.22, 0.34);
  lg.translate(0, 0.17, 0);
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const y = 0.5 + r() * (height - 0.6), a = r() * Math.PI * 2, out = spread * (0.3 + r() * 0.7) * (1 - (y / height) * 0.4);
    const l = part(g, lg, m, Math.cos(a) * out * 0.5, y, Math.sin(a) * out * 0.5, -0.6 - r() * 0.5, a, 0);
    l.rotation.order = 'YXZ';
    l.rotation.set(-0.5 - r() * 0.6, -a + Math.PI / 2, 0);
  }
  part(g, C(0.015, 0.02, height - 0.3, 6), darkWood(), 0, 0.5 + (height - 0.3) / 2 - 0.15, 0);
}

export const FURNITURE = {
  bench: {
    label: 'Gallery bench', w: 1.8, d: 0.5,
    build(g) {
      part(g, B(1.8, 0.07, 0.5), darkWood(), 0, 0.44, 0);
      part(g, B(0.05, 0.4, 0.46), steel(), -0.72, 0.2, 0);
      part(g, B(0.05, 0.4, 0.46), steel(), 0.72, 0.2, 0);
    },
  },
  sofa: {
    label: 'Leather sofa', w: 2.1, d: 0.9,
    build(g) {
      part(g, B(2.1, 0.22, 0.9), leather(), 0, 0.3, 0);
      part(g, B(1.0, 0.14, 0.78), leather(), -0.5, 0.48, 0.03);
      part(g, B(1.0, 0.14, 0.78), leather(), 0.5, 0.48, 0.03);
      for (const x of [-0.95, 0.95]) for (const z of [-0.38, 0.38]) part(g, C(0.02, 0.02, 0.2, 8), chrome(), x, 0.1, z);
    },
  },
  lounge: {
    label: 'Lounge chair', w: 0.8, d: 0.8,
    build(g) {
      part(g, B(0.72, 0.12, 0.7), tan(), 0, 0.4, 0.04);
      part(g, B(0.72, 0.6, 0.12), tan(), 0, 0.7, -0.3, -0.25);
      part(g, B(0.04, 0.04, 0.8), chrome(), -0.36, 0.3, 0, 0.3);
      part(g, B(0.04, 0.04, 0.8), chrome(), 0.36, 0.3, 0, 0.3);
      part(g, B(0.04, 0.4, 0.04), chrome(), -0.36, 0.2, 0.34);
      part(g, B(0.04, 0.4, 0.04), chrome(), 0.36, 0.2, 0.34);
    },
  },
  fig: {
    label: 'Fiddle leaf fig', w: 0.6, d: 0.6,
    build(g) {
      part(g, C(0.26, 0.2, 0.5, 20), terracotta(), 0, 0.25, 0);
      part(g, C(0.24, 0.24, 0.02, 20), soil(), 0, 0.49, 0);
      leafyPlant(g, 1.9, 1.1, leaf());
    },
  },
  palm: {
    label: 'Palm in a planter', w: 0.7, d: 0.7,
    build(g) {
      part(g, B(0.6, 0.55, 0.6), concrete(), 0, 0.275, 0);
      part(g, B(0.54, 0.02, 0.54), soil(), 0, 0.55, 0);
      const frond = new THREE.PlaneGeometry(0.28, 1.1);
      frond.translate(0, 0.55, 0);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const f = part(g, frond, palm(), 0, 0.9 + (i % 3) * 0.25, 0);
        f.rotation.order = 'YXZ';
        f.rotation.set(-0.9 + (i % 3) * 0.2, a, 0);
      }
      part(g, C(0.025, 0.04, 1.3, 8), wood(), 0, 1.1, 0);
    },
  },
  rug: {
    label: 'Wool rug', w: 3, d: 2, flat: true,
    build(g) {
      const m = rugMat('rug', (c, S) => {
        c.fillStyle = '#8a3b2f'; c.fillRect(0, 0, S, S);
        c.strokeStyle = '#e3cfa6'; c.lineWidth = 8; c.strokeRect(14, 14, S - 28, S - 28);
        c.strokeStyle = '#2d3a4f'; c.lineWidth = 5; c.strokeRect(30, 30, S - 60, S - 60);
        c.fillStyle = '#d9b26e';
        for (let i = 0; i < 5; i++) { c.save(); c.translate(S / 2, S / 2); c.rotate(i * Math.PI / 5); c.fillRect(-70, -6, 140, 12); c.restore(); }
      });
      part(g, B(3, 0.012, 2), m, 0, 0.006, 0).castShadow = false;
    },
  },
  roundRug: {
    label: 'Round rug', w: 2.4, d: 2.4, flat: true,
    build(g) {
      const m = rugMat('roundRug', (c, S) => {
        c.fillStyle = '#d8d1c2'; c.fillRect(0, 0, S, S);
        for (let r = 120; r > 0; r -= 18) { c.strokeStyle = r % 36 ? '#b9ad96' : '#8f8472'; c.lineWidth = 4; c.beginPath(); c.arc(S / 2, S / 2, r, 0, Math.PI * 2); c.stroke(); }
      });
      part(g, C(1.2, 1.2, 0.012, 48), m, 0, 0.006, 0).castShadow = false;
    },
  },
  plinth: {
    label: 'Sculpture on a plinth', w: 0.6, d: 0.6,
    build(g) {
      part(g, B(0.55, 1.0, 0.55), white(), 0, 0.5, 0);
      part(g, new THREE.TorusKnotGeometry(0.16, 0.05, 90, 12, 2, 3), bronze(), 0, 1.28, 0);
    },
  },
  vitrine: {
    label: 'Display case', w: 1.3, d: 0.7,
    build(g) {
      part(g, B(1.3, 0.85, 0.7), white(), 0, 0.425, 0);
      part(g, B(1.26, 0.5, 0.66), glass(), 0, 1.1, 0).castShadow = false;
      part(g, new THREE.SphereGeometry(0.12, 20, 14), brass(), -0.3, 0.97, 0);
      part(g, B(0.3, 0.08, 0.22), bronze(), 0.25, 0.9, 0);
    },
  },
  stanchions: {
    label: 'Rope stanchions', w: 2.2, d: 0.3,
    build(g) {
      for (const x of [-1, 0, 1]) {
        part(g, C(0.14, 0.14, 0.03, 20), brass(), x, 0.015, 0);
        part(g, C(0.025, 0.025, 0.95, 10), brass(), x, 0.48, 0);
        part(g, new THREE.SphereGeometry(0.04, 12, 8), brass(), x, 0.97, 0);
      }
      for (const x of [-0.5, 0.5]) {
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x - 0.5, 0.9, 0), new THREE.Vector3(x, 0.72, 0), new THREE.Vector3(x + 0.5, 0.9, 0)]);
        part(g, new THREE.TubeGeometry(curve, 16, 0.018, 8), rope(), 0, 0, 0);
      }
    },
  },
  desk: {
    label: 'Reception desk', w: 2.4, d: 0.8,
    build(g) {
      part(g, B(2.4, 1.05, 0.8), white(), 0, 0.525, 0);
      part(g, B(2.5, 0.04, 0.9), darkWood(), 0, 1.07, 0);
      part(g, B(0.4, 0.3, 0.02), steel(), 0.6, 1.24, -0.2, -0.3);
    },
  },
  table: {
    label: 'Coffee table with catalogs', w: 1.2, d: 0.6,
    build(g) {
      part(g, B(1.2, 0.04, 0.6), glass(), 0, 0.42, 0).castShadow = false;
      for (const x of [-0.56, 0.56]) part(g, B(0.03, 0.4, 0.56), chrome(), x, 0.2, 0);
      const cover = ['#c9442c', '#1f2f4f', '#e8e2d2'];
      cover.forEach((c, i) => part(g, B(0.28, 0.02 + i * 0.005, 0.22), mat('cat' + i, { color: c, roughness: 0.6 }), -0.25 + i * 0.05, 0.45 + i * 0.022, -0.02 + i * 0.03, 0, i * 0.3, 0));
    },
  },

  /* Sculpture */
  bust: {
    label: 'Marble bust', cat: 'sculpture', w: 0.6, d: 0.6,
    build(g) {
      part(g, B(0.5, 1.15, 0.5), white(), 0, 0.575, 0);
      part(g, C(0.12, 0.15, 0.1, 20), marble(), 0, 1.2, 0);
      const chest = part(g, new THREE.SphereGeometry(0.2, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), marble(), 0, 1.25, 0);
      chest.scale.set(1.2, 0.9, 0.7);
      part(g, C(0.05, 0.06, 0.12, 12), marble(), 0, 1.47, 0);
      const head = part(g, new THREE.SphereGeometry(0.11, 24, 18), marble(), 0, 1.62, 0.01);
      head.scale.set(0.9, 1.15, 1);
      part(g, new THREE.SphereGeometry(0.115, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), marble(), 0, 1.66, -0.01).scale.set(0.95, 1, 1.02);
    },
  },
  figure: {
    label: 'Standing figure', cat: 'sculpture', w: 0.8, d: 0.8,
    build(g) {
      part(g, B(0.75, 0.4, 0.75), white(), 0, 0.2, 0);
      const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 14);
      part(g, cap(0.07, 0.75), marble(), -0.09, 0.85, 0, 0, 0, 0.06);
      part(g, cap(0.07, 0.75), marble(), 0.1, 0.87, 0.04, -0.12, 0, -0.03);
      part(g, cap(0.17, 0.4), marble(), 0, 1.55, 0, 0, 0, 0.05).scale.set(1.1, 1, 0.7);
      part(g, cap(0.045, 0.55), marble(), -0.25, 1.5, 0, 0, 0, 0.15);
      part(g, cap(0.045, 0.55), marble(), 0.25, 1.62, 0.08, -0.9, 0, -0.3);
      part(g, new THREE.SphereGeometry(0.1, 20, 16), marble(), 0.02, 2.05, 0.01);
    },
  },
  reclining: {
    label: 'Reclining form', cat: 'sculpture', w: 2.2, d: 1,
    build(g) {
      part(g, B(2.2, 0.35, 1), concrete(), 0, 0.175, 0);
      part(g, new THREE.TorusGeometry(0.42, 0.2, 20, 40, Math.PI * 1.3), bronze(), -0.4, 0.75, 0, 0, 0, 0.2);
      part(g, new THREE.SphereGeometry(0.32, 24, 18), bronze(), 0.55, 0.6, 0).scale.set(1.5, 0.75, 0.9);
      part(g, new THREE.SphereGeometry(0.16, 20, 14), bronze(), -0.85, 1.15, 0).scale.set(1, 1.2, 0.9);
    },
  },
  column: {
    label: 'Endless column', cat: 'sculpture', w: 0.6, d: 0.6,
    build(g) {
      const bead = new THREE.OctahedronGeometry(0.28, 0);
      bead.scale(1, 1.4, 1);
      for (let i = 0; i < 6; i++) part(g, bead, bronze(), 0, 0.2 + i * 0.56 + 0.28, 0, 0, Math.PI / 4, 0);
      part(g, B(0.3, 0.2, 0.3), bronze(), 0, 0.1, 0);
    },
  },
  balloonDog: {
    label: 'Balloon dog', cat: 'sculpture', w: 1.4, d: 0.6,
    build(g) {
      const m = mat('balloon', { color: 0xd4247a, roughness: 0.08, metalness: 1 });
      const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 8, 18);
      part(g, cap(0.15, 0.55), m, 0, 0.85, 0, 0, 0, Math.PI / 2);
      for (const [x, z] of [[-0.3, -0.13], [-0.3, 0.13], [0.3, -0.13], [0.3, 0.13]]) part(g, cap(0.11, 0.45), m, x, 0.38, z, z * 1.2, 0, x * 0.3);
      part(g, cap(0.13, 0.28), m, 0.42, 1.1, 0, 0, 0, -0.4);
      part(g, cap(0.11, 0.25), m, 0.62, 1.3, 0, 0, 0, Math.PI / 2 - 0.2);
      for (const z of [-0.08, 0.08]) part(g, cap(0.06, 0.18), m, 0.5, 1.45, z, z * 2, 0, 0.3);
      part(g, cap(0.07, 0.2), m, -0.42, 1.0, 0, 0, 0, 0.6);
    },
  },
  stabile: {
    label: 'Steel stabile', cat: 'sculpture', w: 1.8, d: 1.2,
    build(g) {
      const black = mat('stabileBlack', { color: 0x151515, roughness: 0.5, metalness: 0.4 });
      const red = mat('stabileRed', { color: 0xc4261d, roughness: 0.5 });
      const yellow = mat('stabileYellow', { color: 0xe8b21e, roughness: 0.5 });
      part(g, new THREE.TorusGeometry(0.9, 0.03, 8, 40, Math.PI), black, 0, 0, 0);
      part(g, C(0.02, 0.02, 1.9, 8), black, 0, 1.35, 0, 0, 0, 0.35);
      part(g, C(0.015, 0.015, 1.2, 8), black, 0.5, 2.15, 0, 0, 0, 1.2);
      part(g, C(0.28, 0.28, 0.02, 30), red, -0.35, 2.3, 0, Math.PI / 2, 0.2, 0);
      part(g, C(0.2, 0.2, 0.02, 30), yellow, 1.05, 2.0, 0, Math.PI / 2, -0.3, 0);
      part(g, C(0.16, 0.16, 0.02, 30), black, 0.7, 2.55, 0, Math.PI / 2, 0.5, 0);
    },
  },
  cairn: {
    label: 'Stacked stones', cat: 'sculpture', w: 0.7, d: 0.7,
    build(g) {
      const stone = mat('stone', { color: 0x6d6a64, roughness: 0.9, flatShading: true });
      let y = 0;
      [0.34, 0.3, 0.26, 0.22, 0.18, 0.14].forEach((r, i) => {
        const s = part(g, new THREE.IcosahedronGeometry(r, 1), stone, (i % 2 ? 0.03 : -0.02), y + r * 0.55, 0, 0, i, 0);
        s.scale.set(1, 0.55, 0.9);
        y += r * 1.05;
      });
    },
  },
  bean: {
    label: 'Mirror bean', cat: 'sculpture', w: 2.6, d: 1.6,
    build(g) {
      const m = mat('mirror', { color: 0xffffff, roughness: 0.04, metalness: 1 });
      m.userData.envScale = 2.5;
      const b = part(g, new THREE.SphereGeometry(1, 48, 32), m, 0, 0.72, 0);
      b.scale.set(1.3, 0.72, 0.8);
    },
  },

  /* Architecture */
  pool: {
    label: 'Reflecting pool', cat: 'arch', w: 5, d: 2.4,
    build(g) {
      const rim = mat('poolRim', { color: 0x8f8a80, roughness: 0.7 });
      part(g, B(5, 0.18, 0.2), rim, 0, 0.09, -1.1);
      part(g, B(5, 0.18, 0.2), rim, 0, 0.09, 1.1);
      part(g, B(0.2, 0.18, 2), rim, -2.4, 0.09, 0);
      part(g, B(0.2, 0.18, 2), rim, 2.4, 0.09, 0);
      const water = mat('water', { color: 0x0e1a1f, roughness: 0.02, metalness: 0.3 });
      water.userData.envScale = 3;
      part(g, B(4.6, 0.02, 2), water, 0, 0.13, 0).castShadow = false;
    },
  },
  wall: {
    label: 'Floating wall', cat: 'arch', w: 4, d: 0.3, partition: true,
    build(g) {
      part(g, B(4, 3.4, 0.3), mat('ghostWall', { color: 0xf1efea, roughness: 0.9 }), 0, 0.15 + 1.7, 0);
    },
  },
};

/* ---------------------------------------------------------------- scene objects */
const group = new THREE.Group();
scene.add(group);
export const furnitureObjs = new Map();   // id -> group

export function makeFurniture(type, ghost = false) {
  const def = FURNITURE[type];
  const g = new THREE.Group();
  def.build(g);
  if (!ghost) return mergeByMaterial(g);
  {
    g.traverse(o => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.55;
      o.material.depthWrite = false;
      o.castShadow = false;
    });
  }
  return g;
}

// Footprint as an axis-aligned box once rotated (rotations snap to 15 degrees)
export function footprint(f) {
  const def = FURNITURE[f.type];
  const c = Math.abs(Math.cos(f.rot)), s = Math.abs(Math.sin(f.rot));
  const hx = (def.w * c + def.d * s) / 2, hz = (def.w * s + def.d * c) / 2;
  return { x0: f.x - hx, x1: f.x + hx, z0: f.z - hz, z1: f.z + hz };
}

export function fits(f, ignoreId = null) {
  const L = building.layout;
  const box = footprint(f);
  const inset = 0.2;
  const corners = [[box.x0 + inset, box.z0 + inset], [box.x1 - inset, box.z0 + inset], [box.x0 + inset, box.z1 - inset], [box.x1 - inset, box.z1 - inset]];
  if (!corners.every(([x, z]) => roomAt(L, x, z))) return false;
  const hit = b => box.x0 < b.x1 && box.x1 > b.x0 && box.z0 < b.z1 && box.z1 > b.z0;
  if (L.colliders.some(b => !(ignoreId && b.partition === ignoreId) && hit(b))) return false;
  if (FURNITURE[f.type].flat) return true;
  // Keep doorways clear
  const doorZone = d => d.o === 'h'
    ? { x0: d.x - d.width / 2 - 0.3, x1: d.x + d.width / 2 + 0.3, z0: d.z - 1.3, z1: d.z + 1.3 }
    : { x0: d.x - 1.3, x1: d.x + 1.3, z0: d.z - d.width / 2 - 0.3, z1: d.z + d.width / 2 + 0.3 };
  if (L.doors.some(d => hit(doorZone(d)))) return false;
  return !state.furniture.some(o => o.id !== ignoreId && !FURNITURE[o.type]?.flat && hit(footprint(o)));
}

export function syncFurniture() {
  let reflectors = 0;
  for (const g of furnitureObjs.values()) { g.traverse(o => { o.geometry?.dispose(); if (o.isReflector) o.dispose(); }); group.remove(g); }
  furnitureObjs.clear();
  for (const f of state.furniture) {
    if (!FURNITURE[f.type]) continue;
    const g = makeFurniture(f.type);
    g.position.set(f.x, 0, f.z);
    g.rotation.y = f.rot;
    if (f.type === 'pool' && state.quality === 'high' && reflectors++ < 2) addReflection(g);
    g.traverse(o => { if (o.isMesh) o.userData.furnitureId = f.id; });
    group.add(g);
    furnitureObjs.set(f.id, g);
  }
  refreshColliders();
}

// Walls, the layout's own benches, and every piece that isn't flat on the floor
export function refreshColliders() {
  const L = building.layout;
  if (!L) return;
  building.colliders = [
    ...L.colliders,
    ...state.furniture.filter(f => FURNITURE[f.type] && !FURNITURE[f.type].flat).map(footprint),
  ];
}

// After the building changes, drop pieces that ended up outside every room
export function refitFurniture() {
  const before = state.furniture.length;
  state.furniture = state.furniture.filter(f => FURNITURE[f.type] && roomAt(building.layout, f.x, f.z));
  return before - state.furniture.length;
}

export const furnitureHitTargets = () => {
  const out = [];
  for (const g of furnitureObjs.values()) g.traverse(o => { if (o.isMesh) out.push(o); });
  return out;
};

// One mesh per material instead of one per part: far fewer draw calls
function mergeByMaterial(g) {
  g.updateMatrixWorld(true);
  const byMat = new Map();
  g.traverse(o => {
    if (!o.isMesh) return;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    const e = byMat.get(o.material) || { geos: [], shadow: false };
    e.geos.push(geo);
    e.shadow ||= o.castShadow;
    byMat.set(o.material, e);
  });
  const out = new THREE.Group();
  for (const [m, e] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(e.geos), m);
    mesh.castShadow = e.shadow;
    mesh.receiveShadow = true;
    out.add(mesh);
    e.geos.forEach(x => x.dispose());
  }
  return out;
}

// Little product shots of each piece for the Furnish tab, rendered once on demand
let thumbs = null;
export function furnitureThumbs(size = 160) {
  if (thumbs) return thumbs;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 2.2));
  const key = new THREE.DirectionalLight(0xfff1dd, 2.4);
  key.position.set(3, 5, 4);
  sc.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  thumbs = {};
  for (const type of Object.keys(FURNITURE)) {
    const g = makeFurniture(type);
    sc.add(g);
    const box = new THREE.Box3().setFromObject(g);
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).length();
    cam.position.set(c.x + s * 0.9, c.y + s * 0.75, c.z + s * 1.3);
    cam.lookAt(c);
    r.render(sc, cam);
    thumbs[type] = r.domElement.toDataURL('image/png');
    sc.remove(g);
    g.traverse(o => o.geometry?.dispose());
  }
  r.dispose();
  r.forceContextLoss();
  return thumbs;
}

// A real mirror on the pool's surface (costs a second render of the scene, so High quality only)
function addReflection(g) {
  const r = new Reflector(new THREE.PlaneGeometry(4.6, 2), {
    textureWidth: 1024, textureHeight: 512, color: 0x6f8189, clipBias: 0.003,
  });
  r.rotation.x = -Math.PI / 2;
  r.position.y = 0.142;
  g.add(r);
}
