import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene, maxAniso } from '../engine.js';
import { state } from '../state.js';
import { WALL_T, DOOR_W, DOOR_H, MUSEUM_NAME } from '../config.js';
import { generateLayout } from './layout.js';
import { floorMaterial, worldUV, boxWorldUV, plasterTexture, facadeMaterial, glassMaterial } from './materials.js';

export const building = { layout: null, faces: new Map(), wallMeshes: [], wallRender: [], floorMeshes: [], colliders: [] };

const group = new THREE.Group();
scene.add(group);

export const wallMat = new THREE.MeshStandardMaterial({ color: state.wallColor, roughness: 0.92 });
const facadeMat = facadeMaterial();
const glassMat = glassMaterial();
{
  const t = plasterTexture();
  wallMat.map = t;
  wallMat.bumpMap = t;
  wallMat.bumpScale = 0.6;
}
const ceilMat = new THREE.MeshStandardMaterial({ color: 0xf2f1ed, roughness: 1, shadowSide: THREE.DoubleSide });
const wellMat = new THREE.MeshStandardMaterial({ color: 0xeeede8, roughness: 1 });
const mullionMat = new THREE.MeshStandardMaterial({ color: 0x2c2d30, roughness: 0.4, metalness: 0.6 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x2b2a27, roughness: 0.6 });
const benchWood = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.45 });
const benchSteel = new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.35, metalness: 0.8 });

// The ground and surroundings live in outside.js

let titleMesh = null;

const _t = new THREE.Vector3();
export function placeOnFace(obj, f, u, v, off) {
  obj.position.copy(f.center).addScaledVector(f.right, u).addScaledVector(f.normal, off);
  obj.position.y = v;
  obj.lookAt(_t.copy(obj.position).add(f.normal));
}

function box(w, h, d, mat, x, y, z, parent = group) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function buildBuilding() {
  group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  group.clear();

  const L = generateLayout({ layout: state.layout, ...state.room, windows: state.windows, skylight: state.skylight, partitions: state.partitions }, { wallT: WALL_T, doorW: DOOR_W, doorH: DOOR_H });
  building.layout = L;
  building.colliders = L.colliders;
  building.faces = new Map(Object.values(L.faces).map(f => [f.id, {
    ...f,
    center: new THREE.Vector3(f.cx, 0, f.cz),
    normal: new THREE.Vector3(f.nx, 0, f.nz),
    right: new THREE.Vector3(f.rx, 0, f.rz),
  }]));
  building.wallMeshes = [];
  building.wallRender = [];
  building.floorMeshes = [];

  const fm = floorMaterial(state.floor);
  for (const r of L.rooms) {
    const w = r.x1 - r.x0 + WALL_T, d = r.z1 - r.z0 + WALL_T;

    // Floor, textured in world space so rooms line up seamlessly through doorways
    const fg = new THREE.PlaneGeometry(w, d);
    fg.rotateX(-Math.PI / 2);
    fg.translate(r.cx, 0, r.cz);
    worldUV(fg, 4);
    const floor = new THREE.Mesh(fg, fm);
    floor.receiveShadow = true;
    group.add(floor);
    building.floorMeshes.push(floor);

    // Ceiling with skylight openings the sun can actually shine through
    const shape = new THREE.Shape();
    shape.moveTo(r.cx - w / 2, r.cz - d / 2);
    shape.lineTo(r.cx + w / 2, r.cz - d / 2);
    shape.lineTo(r.cx + w / 2, r.cz + d / 2);
    shape.lineTo(r.cx - w / 2, r.cz + d / 2);
    shape.closePath();
    const lights = L.skylights.filter(s => s.room === r.id);
    for (const s of lights) {
      const hole = new THREE.Path();
      hole.moveTo(s.x0, s.z0); hole.lineTo(s.x0, s.z1); hole.lineTo(s.x1, s.z1); hole.lineTo(s.x1, s.z0);
      hole.closePath();
      shape.holes.push(hole);
    }
    const cg = new THREE.ShapeGeometry(shape);
    cg.rotateX(Math.PI / 2);
    cg.translate(0, L.h, 0);
    const ceil = new THREE.Mesh(cg, ceilMat);
    ceil.castShadow = ceil.receiveShadow = true;
    group.add(ceil);

    // Skylight wells with steel mullions, which throw striped light on the floor
    for (const s of lights) {
      const sw = s.x1 - s.x0, sd = s.z1 - s.z0, cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
      const hh = 0.8, th = 0.08, y = L.h + hh / 2;
      box(sw + th * 2, hh, th, wellMat, cx, y, s.z0 - th / 2);
      box(sw + th * 2, hh, th, wellMat, cx, y, s.z1 + th / 2);
      box(th, hh, sd, wellMat, s.x0 - th / 2, y, cz);
      box(th, hh, sd, wellMat, s.x1 + th / 2, y, cz);
      if (s.giant) {
        // A steel grid both ways, deeper beams every third bar
        const nx = Math.max(1, Math.round(sw / 1.2)), nz = Math.max(1, Math.round(sd / 1.2));
        for (let i = 1; i < nx; i++) box(0.06, i % 3 ? 0.08 : 0.3, sd, mullionMat, s.x0 + (sw / nx) * i, L.h + hh - (i % 3 ? 0.05 : 0.15), cz);
        for (let j = 1; j < nz; j++) box(sw, j % 3 ? 0.08 : 0.3, 0.06, mullionMat, cx, L.h + hh - (j % 3 ? 0.05 : 0.15), s.z0 + (sd / nz) * j);
        continue;
      }
      const long = Math.max(sw, sd), n = Math.floor(long / 0.9);
      for (let i = 1; i < n; i++) {
        const k = -long / 2 + (long / n) * i;
        if (sd >= sw) box(sw, 0.06, 0.05, mullionMat, cx, L.h + hh - 0.05, cz + k);
        else box(0.05, 0.06, sd, mullionMat, cx + k, L.h + hh - 0.05, cz);
      }
      box(sd >= sw ? 0.05 : sw, 0.06, sd >= sw ? sd : 0.05, mullionMat, cx, L.h + hh - 0.05, cz);
    }

  }

  // Walls, including lintels over doors. Box faces: +x, -x, +y, -y, +z, -z.
  // Outside faces get stone cladding; everything is textured in world space.
  // Every wall face is merged into one plaster mesh and one stone mesh (two draw calls);
  // each wall also keeps an invisible box on layer 1 for aiming and hanging.
  const plaster = [], stone = [];
  for (const s of L.segments) {
    const g = new THREE.BoxGeometry(s.x1 - s.x0, s.y1 - s.y0, s.z1 - s.z0);
    g.translate((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2);
    boxWorldUV(g, 2.5);
    const outside = new Set();
    if (s.ext) {
      outside.add(s.o === 'h' ? (s.ext === 'pos' ? 4 : 5) : (s.ext === 'pos' ? 0 : 1)).add(2);
      for (const i of s.o === 'h' ? [0, 1] : [4, 5]) outside.add(i);
    }
    const flat = g.toNonIndexed();
    flat.groups.forEach((grp, i) => (outside.has(i) ? stone : plaster).push(slice(flat, grp.start, grp.count)));
    flat.dispose();
    const proxy = new THREE.Mesh(g, wallMat);
    proxy.layers.set(1);
    proxy.userData.seg = s;
    group.add(proxy);
    building.wallMeshes.push(proxy);
  }
  for (const [parts, mat] of [[plaster, wallMat], [stone, facadeMat]]) {
    if (!parts.length) continue;
    const m = new THREE.Mesh(mergeGeometries(parts), mat);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    building.wallRender.push(m);
    parts.forEach(p => p.dispose());
  }

  // Floating walls sit on a recessed dark plinth, which reads as a shadow gap
  for (const s of L.segments.filter(x => x.partition)) {
    box(s.x1 - s.x0 - 0.12, s.y0, s.z1 - s.z0 - 0.12, trimMat, (s.x0 + s.x1) / 2, s.y0 / 2, (s.z0 + s.z1) / 2);
  }

  // Glass in the clerestory windows and the entrance wall, with slim frames
  const pane = (o, c, a, b, y0, y1) => {
    const len = b - a, hh = y1 - y0, mid = (a + b) / 2;
    const g = new THREE.PlaneGeometry(len, hh);
    const m = new THREE.Mesh(g, glassMat);
    m.position.set(o === 'h' ? mid : c, (y0 + y1) / 2, o === 'h' ? c : mid);
    if (o === 'v') m.rotation.y = Math.PI / 2;
    m.renderOrder = 2;
    group.add(m);
  };
  const bar = (o, c, a, b, y0, y1, t = 0.05) => {
    const lx = o === 'h' ? b - a : t, lz = o === 'h' ? t : b - a;
    box(lx, y1 - y0, lz, mullionMat, o === 'h' ? (a + b) / 2 : c, (y0 + y1) / 2, o === 'h' ? c : (a + b) / 2).castShadow = true;
  };
  for (const w of L.windows) {
    pane(w.o, w.c, w.a, w.b, w.y0, w.y1);
    const mid = (w.a + w.b) / 2;
    bar(w.o, w.c, mid - 0.025, mid + 0.025, w.y0, w.y1);
    bar(w.o, w.c, w.a, w.b, (w.y0 + w.y1) / 2 - 0.025, (w.y0 + w.y1) / 2 + 0.025);
    bar(w.o, w.c, w.a, w.b, w.y0 - 0.03, w.y0 + 0.02, WALL_T + 0.1);   // sill
  }
  for (const w of L.glassWalls) {
    pane(w.o, w.c, w.a, w.b, w.y0, w.y1);
    bar(w.o, w.c, w.a, w.b, 2.6, 2.66, 0.12);                          // transom
  }

  // Baseboards on every hangable face
  for (const f of building.faces.values()) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(f.len, 0.1, 0.015), trimMat);
    placeOnFace(b, f, 0, 0.05, 0.0075);
    b.receiveShadow = true;
    group.add(b);
  }

  // Benches: wood slab on steel legs
  for (const b of L.benches) {
    const g = new THREE.Group();
    const lx = b.hx * 2, lz = b.hz * 2;
    box(lx, 0.07, lz, benchWood, 0, 0.44, 0, g);
    const leg = (x, z) => box(b.alongZ ? lx - 0.04 : 0.05, 0.4, b.alongZ ? 0.05 : lz - 0.04, benchSteel, x, 0.2, z, g);
    if (b.alongZ) { leg(0, -b.hz + 0.15); leg(0, b.hz - 0.15); }
    else { leg(-b.hx + 0.15, 0); leg(b.hx - 0.15, 0); }
    g.position.set(b.x, 0, b.z);
    group.add(g);
  }

  mergeStatic();
  buildTitle();
}

// Hundreds of small boxes (skylight wells, mullions, window frames, baseboards, benches)
// become one mesh per material. Walls and floors stay separate for aiming and hit tests.
function mergeStatic() {
  group.updateMatrixWorld(true);
  const keep = new Set([...building.wallMeshes, ...building.wallRender, ...building.floorMeshes]);
  const buckets = new Map();
  const drop = [];
  group.traverse(o => {
    if (!o.isMesh || keep.has(o)) return;
    const k = o.material.uuid + (o.castShadow ? '|s' : '');
    if (!buckets.has(k)) buckets.set(k, { mat: o.material, cast: o.castShadow, order: o.renderOrder, geos: [] });
    buckets.get(k).geos.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
    drop.push(o);
  });
  for (const o of drop) { o.geometry.dispose(); o.parent.remove(o); }
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos);
    for (const geo of merged ? [merged] : b.geos) {
      const m = new THREE.Mesh(geo, b.mat);
      m.castShadow = b.cast;
      m.receiveShadow = true;
      m.renderOrder = b.order;
      group.add(m);
    }
    if (merged) b.geos.forEach(g => g.dispose());
  }
}

export function setWallColor(hex) {
  wallMat.color.set(hex);
  buildTitle();
}

// The exhibition title in vinyl lettering on the wall you face as you walk in
export function buildTitle() {
  if (titleMesh) {
    group.remove(titleMesh);
    titleMesh.geometry.dispose(); titleMesh.material.map.dispose(); titleMesh.material.dispose();
    titleMesh = null;
  }
  const L = building.layout;
  if (!L) return;
  const t = L.title;
  let width = Math.min(t.width * 0.6, 7), height = width / 4, y;
  if (t.overDoor) {
    const avail = L.h - L.doorH - 0.25;
    height = Math.min(height, avail * 0.85);
    width = height * 4;
    y = L.doorH + 0.12 + avail / 2;
  } else {
    const maxTop = Math.min(L.h - 0.3, L.sill - 0.15);
    height = Math.min(height, Math.max(0.3, (maxTop - 2) * 0.9));
    width = Math.min(width, height * 4);
    y = Math.min(maxTop - height / 2, 3.3);
  }
  if (height < 0.3) return;

  const c = document.createElement('canvas'); c.width = 2048; c.height = 512;
  const g = c.getContext('2d');
  const col = new THREE.Color(state.wallColor);
  const lum = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
  g.fillStyle = lum > 0.35 ? '#1f2023' : '#f3f1ec';
  g.textAlign = 'center';
  g.font = '500 64px "Instrument Sans", system-ui, sans-serif';
  g.fillText(MUSEUM_NAME + ' presents', 1024, 150);
  const title = state.showTitle || 'Untitled Exhibition';
  let size = 200;
  const font = () => `${size}px "Instrument Serif", Georgia, serif`;
  g.font = font();
  while (g.measureText(title).width > 1900 && size > 60) { size -= 8; g.font = font(); }
  g.fillText(title, 1024, 360);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  titleMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9 }));
  titleMesh.position.set(t.x, y, t.z + 0.006);
  titleMesh.receiveShadow = true;
  group.add(titleMesh);
}

// Copy a run of vertices out of a non-indexed geometry
function slice(geo, start, count) {
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const a = geo.attributes[k];
    out.setAttribute(k, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize));
  }
  return out;
}
