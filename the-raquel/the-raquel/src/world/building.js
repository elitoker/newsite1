import * as THREE from 'three';
import { scene, maxAniso } from '../engine.js';
import { state } from '../state.js';
import { WALL_T, DOOR_W, DOOR_H, MUSEUM_NAME } from '../config.js';
import { generateLayout } from './layout.js';
import { floorMaterial, groundMaterial, worldUV } from './materials.js';

export const building = { layout: null, faces: new Map(), wallMeshes: [], colliders: [] };

const group = new THREE.Group();
scene.add(group);

export const wallMat = new THREE.MeshStandardMaterial({ color: state.wallColor, roughness: 0.92 });
const ceilMat = new THREE.MeshStandardMaterial({ color: 0xf2f1ed, roughness: 1, shadowSide: THREE.DoubleSide });
const wellMat = new THREE.MeshStandardMaterial({ color: 0xeeede8, roughness: 1 });
const mullionMat = new THREE.MeshStandardMaterial({ color: 0x2c2d30, roughness: 0.4, metalness: 0.6 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x2b2a27, roughness: 0.6 });
const benchWood = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.45 });
const benchSteel = new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.35, metalness: 0.8 });

// The plaza the building sits on
{
  const g = new THREE.PlaneGeometry(800, 800);
  g.rotateX(-Math.PI / 2);
  worldUV(g, 8);
  const ground = new THREE.Mesh(g, groundMaterial());
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);
}

let lamps = [];
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
  lamps = [];

  const L = generateLayout({ layout: state.layout, ...state.room }, { wallT: WALL_T, doorW: DOOR_W, doorH: DOOR_H });
  building.layout = L;
  building.colliders = L.colliders;
  building.faces = new Map(Object.values(L.faces).map(f => [f.id, {
    ...f,
    center: new THREE.Vector3(f.cx, 0, f.cz),
    normal: new THREE.Vector3(f.nx, 0, f.nz),
    right: new THREE.Vector3(f.rx, 0, f.rz),
  }]));
  building.wallMeshes = [];

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
      const long = Math.max(sw, sd), n = Math.floor(long / 0.9);
      for (let i = 1; i < n; i++) {
        const k = -long / 2 + (long / n) * i;
        if (sd >= sw) box(sw, 0.06, 0.05, mullionMat, cx, L.h + hh - 0.05, cz + k);
        else box(0.05, 0.06, sd, mullionMat, cx + k, L.h + hh - 0.05, cz);
      }
      box(sd >= sw ? 0.05 : sw, 0.06, sd >= sw ? sd : 0.05, mullionMat, cx, L.h + hh - 0.05, cz);
    }

    // A warm lamp per room for after dark (capped, since every light costs shader time)
    if (lamps.length < 8) {
      const lamp = new THREE.PointLight(0xffd7a8, 0, 0, 2);
      lamp.position.set(r.cx, L.h - 0.6, r.cz);
      lamp.userData.area = (r.x1 - r.x0) * (r.z1 - r.z0);
      group.add(lamp);
      lamps.push(lamp);
    }
  }

  // Walls, including lintels over doors
  for (const s of L.segments) {
    const m = box(s.x1 - s.x0, s.y1 - s.y0, s.z1 - s.z0, wallMat, (s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2);
    m.userData.seg = s;
    building.wallMeshes.push(m);
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

  buildTitle();
}

export function applyNight(night) {
  for (const l of lamps) l.intensity = night * Math.min(40, 8 + l.userData.area * 0.05);
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
    y = Math.min(L.h - height / 2 - 0.3, 3.3);
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
