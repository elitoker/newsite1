import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { scene, renderer, camera, hemi, amb, setExposure } from '../engine.js';
import { state, clamp } from '../state.js';
import { building } from './building.js';
import { outerSize } from '../art/works.js';

// Gallery lighting that doesn't depend on the sun: room lamps, picture lights,
// spotlights the curator adds, ceiling fixtures, and a soft environment for
// reflections and bounce light.
//
// Every real light costs shader time on every pixel, so room lamps and picture
// lights come from small pools that follow the camera: the rooms and works
// nearest to you get real lights, and everything farther away gets a cheap glow.

const group = new THREE.Group();
scene.add(group);

// Soft studio environment: reflections on frames and floors, and bounce light into corners
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
pmrem.dispose();

export const POOLS = {
  high:     { lamps: 8, picture: 6 },
  balanced: { lamps: 5, picture: 3 },
  fast:     { lamps: 3, picture: 0 },
};
export const FIXTURES = { track: 'Track lights', pendant: 'Pendants', chandelier: 'Chandeliers', none: 'None' };
export const MAX_SPOTS = 8;

// Warmth 0..1 maps to 5200 K (neutral daylight) down to 2700 K (warm incandescent)
const kelvinColor = (k, out = new THREE.Color()) => {
  const t = k / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
    b = 255;
  }
  return out.setRGB(clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(b, 0, 255) / 255, THREE.SRGBColorSpace);
};
export const lampColor = new THREE.Color();
const bounceColor = new THREE.Color();

let lampSpots = [];   // where room light comes from: { x, y, z, power }
let lamps = [], pictureLights = [], userSpots = [];
let night = 0;
let poolTimer = 0, envTimer = 0;

const fixtureMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.4, metalness: 0.7 });
const whiteFixtureMat = new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.5 });
const brassMat = new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.3, metalness: 0.9 });
export const bulbMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd7a8, emissiveIntensity: 2 });

function makePool(n, make) {
  const out = [];
  for (let i = 0; i < n; i++) { const l = make(); l.visible = false; group.add(l); if (l.target) group.add(l.target); out.push(l); }
  return out;
}
function clearPools() {
  for (const l of [...lamps, ...pictureLights]) { group.remove(l); if (l.target) group.remove(l.target); l.dispose?.(); }
  lamps = []; pictureLights = [];
}

/* ---------------------------------------------------------------- fixtures */
const fixtureGroup = new THREE.Group();
group.add(fixtureGroup);

function instanced(geo, mat, matrices) {
  if (!matrices.length) return;
  const m = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((mx, i) => m.setMatrixAt(i, mx));
  m.castShadow = false;
  fixtureGroup.add(m);
}
const M = () => new THREE.Matrix4();
const _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), _e = new THREE.Euler();
const compose = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  M().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));

function buildFixtures(L) {
  fixtureGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  fixtureGroup.clear();
  lampSpots = [];
  const style = state.lighting.fixture;
  const h = L.h;
  const rails = [], cans = [], lenses = [], rods = [], drums = [], discs = [], rings = [], bulbs = [];

  for (const r of L.rooms) {
    const rw = r.x1 - r.x0, rd = r.z1 - r.z0;
    const alongZ = rd >= rw;
    const long = Math.max(rw, rd), short = Math.min(rw, rd);
    const area = rw * rd;
    // Light sources along the long axis of each room, spaced about 10 m apart
    const n = Math.max(1, Math.round(long / 10));
    for (let i = 0; i < n; i++) {
      const c = -long / 2 + (long / n) * (i + 0.5);
      lampSpots.push({ x: alongZ ? r.cx : r.cx + c, y: Math.max(2.6, h * 0.55), z: alongZ ? r.cz + c : r.cz, power: area / n });
    }

    if (style === 'track') {
      // Two rails running the length of the room, cans every 2 m aimed at the nearer wall
      const railLen = long - 2;
      for (const side of [-1, 1]) {
        const off = side * short * 0.3;
        const rx = alongZ ? r.cx + off : r.cx, rz = alongZ ? r.cz : r.cz + off;
        rails.push(compose(rx, h - 0.05, rz, 0, alongZ ? 0 : Math.PI / 2, 0, 1, 1, railLen));
        const count = Math.floor(railLen / 2);
        for (let i = 0; i < count; i++) {
          const k = -railLen / 2 + (railLen / count) * (i + 0.5);
          const cx = alongZ ? rx : rx + k, cz = alongZ ? rz + k : rz;
          // Tilt toward the wall on this side
          const tilt = 0.6 * side;
          const rot = alongZ ? [0, 0, -tilt] : [tilt, 0, 0];
          cans.push(compose(cx, h - 0.28, cz, ...rot));
          const lx = alongZ ? cx + Math.sin(tilt) * 0.13 : cx, lz = alongZ ? cz : cz + Math.sin(tilt) * 0.13;
          lenses.push(compose(lx, h - 0.28 - Math.cos(tilt) * 0.13, lz, ...rot));
        }
      }
    } else if (style === 'pendant') {
      const nx = Math.max(1, Math.round(rw / 5)), nz = Math.max(1, Math.round(rd / 5));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x = r.x0 + (rw / nx) * (i + 0.5), z = r.z0 + (rd / nz) * (j + 0.5);
        const drop = Math.min(1.6, h - 3.4);
        rods.push(compose(x, h - drop / 2, z, 0, 0, 0, 1, drop, 1));
        drums.push(compose(x, h - drop - 0.15, z));
        discs.push(compose(x, h - drop - 0.29, z, Math.PI / 2));
      }
    } else if (style === 'chandelier') {
      for (const s of lampSpots.filter(p => p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1)) {
        const drop = Math.min(1.4, h - 3.6);
        rods.push(compose(s.x, h - drop / 2, s.z, 0, 0, 0, 1, drop, 1));
        rings.push(compose(s.x, h - drop - 0.1, s.z, Math.PI / 2));
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          bulbs.push(compose(s.x + Math.cos(a) * 0.55, h - drop, s.z + Math.sin(a) * 0.55));
        }
      }
    }
  }

  instanced(new THREE.BoxGeometry(0.06, 0.04, 1), fixtureMat, rails);
  instanced(new THREE.CylinderGeometry(0.07, 0.06, 0.24, 14), fixtureMat, cans);
  instanced(new THREE.CircleGeometry(0.055, 14).rotateX(Math.PI / 2), bulbMat, lenses);
  instanced(new THREE.CylinderGeometry(0.01, 0.01, 1, 6), fixtureMat, rods);
  instanced(new THREE.CylinderGeometry(0.32, 0.32, 0.28, 28, 1, true), whiteFixtureMat, drums);
  instanced(new THREE.CircleGeometry(0.31, 28), bulbMat, discs);
  instanced(new THREE.TorusGeometry(0.55, 0.025, 8, 40), brassMat, rings);
  instanced(new THREE.SphereGeometry(0.045, 10, 8), bulbMat, bulbs);
  fixtureGroup.traverse(o => { if (o.isInstancedMesh) o.material.side = THREE.DoubleSide; });
}

/* ---------------------------------------------------------------- user spotlights */
const spotGroup = new THREE.Group();
group.add(spotGroup);
const canGeo = new THREE.CylinderGeometry(0.09, 0.07, 0.3, 16);
const stemGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6);
const lensGeo = new THREE.CircleGeometry(0.075, 16);

export function syncSpots() {
  for (const s of userSpots) { spotGroup.remove(s.light, s.light.target, s.mesh); s.light.dispose(); }
  userSpots = [];
  const h = building.layout?.h ?? 5;
  for (const sp of state.lighting.spots) {
    const light = new THREE.SpotLight(lampColor, 0, 0, sp.angle ?? 0.35, 0.45, 2);
    light.position.set(sp.x, sp.y, sp.z);
    light.target.position.set(sp.tx, sp.ty, sp.tz);
    const d = light.position.distanceTo(light.target.position);
    light.userData.base = (sp.power ?? 1) * 3 * d * d;

    const mesh = new THREE.Group();
    const stemLen = Math.max(0.05, h - sp.y - 0.15);
    const stem = new THREE.Mesh(stemGeo, fixtureMat);
    stem.scale.y = stemLen;
    stem.position.set(sp.x, sp.y + 0.15 + stemLen / 2, sp.z);
    const can = new THREE.Group();
    can.position.set(sp.x, sp.y, sp.z);
    can.lookAt(light.target.position);
    const body = new THREE.Mesh(canGeo, fixtureMat);
    body.rotation.x = Math.PI / 2;
    const lens = new THREE.Mesh(lensGeo, bulbMat);
    lens.position.z = 0.151;
    can.add(body, lens);
    mesh.add(stem, can);
    mesh.userData.spotId = sp.id;
    spotGroup.add(light, light.target, mesh);
    userSpots.push({ light, mesh });
  }
  applyLighting();
}

/* ---------------------------------------------------------------- building and quality */
export function buildLighting() {
  const L = building.layout;
  if (!L) return;
  buildFixtures(L);
  clearPools();
  const pool = POOLS[state.quality] || POOLS.high;
  lamps = makePool(pool.lamps, () => new THREE.PointLight(lampColor, 0, 0, 2));
  pictureLights = makePool(state.lighting.picture ? pool.picture : 0, () => {
    const s = new THREE.SpotLight(lampColor, 0, 0, 0.5, 0.85, 2);
    return s;
  });
  syncSpots();
  poolTimer = 0; envTimer = 0;
  updateLighting(1);
}

// Brightness, warmth and time of day feed every light in the building
export function applyLighting(n = night) {
  night = n;
  const lt = state.lighting;
  const b = lt.brightness;
  kelvinColor(5200 - lt.warmth * 2500, lampColor);
  bounceColor.copy(lampColor).multiplyScalar(0.55);

  setExposure(0.85 + b * 0.25);
  amb.color.copy(lampColor);
  amb.intensity = b * (0.16 - night * 0.1);
  hemi.groundColor.copy(bounceColor);
  bulbMat.emissive.copy(lampColor);
  bulbMat.emissiveIntensity = 1.5 + night * 5;

  for (const l of [...lamps, ...pictureLights]) l.color.copy(lampColor);
  for (const s of userSpots) {
    s.light.color.copy(lampColor);
    s.light.intensity = s.light.userData.base * (0.6 + night * 0.5) * Math.max(0.4, b);
  }
  envTimer = 0;
}

// Scale reflections and bounce light down after dark so the night stays moody
let envK = -1;
function applyEnv() {
  const k = state.lighting.brightness * (0.45 - night * 0.35);
  if (Math.abs(k - envK) < 1e-3 && envTimer > 0) return;
  envK = k;
  scene.traverse(o => {
    const m = o.material;
    if (!m) return;
    for (const mm of Array.isArray(m) ? m : [m]) {
      if (mm.envMapIntensity === undefined) continue;
      mm.envMapIntensity = k * (mm.userData.envScale ?? 1);
    }
  });
}

const _cam = new THREE.Vector3();
export function updateLighting(dt) {
  poolTimer -= dt;
  envTimer -= dt;
  if (envTimer <= 0) { applyEnv(); envTimer = 0.5; }
  if (poolTimer > 0) return;
  poolTimer = 0.25;
  const L = building.layout;
  if (!L) return;
  const b = state.lighting.brightness;
  _cam.copy(camera.position);

  // Room lamps go to the light positions nearest the camera
  const near = lampSpots
    .map(s => ({ s, d: (s.x - _cam.x) ** 2 + (s.z - _cam.z) ** 2 }))
    .sort((a, c) => a.d - c.d);
  lamps.forEach((l, i) => {
    const e = near[i];
    if (!e) { l.visible = false; return; }
    l.visible = true;
    l.position.set(e.s.x, e.s.y, e.s.z);
    // Intensity grows with the floor area each lamp covers
    l.intensity = b * clamp(e.s.power * 0.35, 8, 45) * (0.4 + night * 0.7);
  });

  // Picture lights go to the works nearest the camera
  if (!pictureLights.length) return;
  const works = state.works
    .map(w => ({ w, f: building.faces.get(w.faceId) }))
    .filter(o => o.f)
    .map(o => {
      const x = o.f.cx + o.f.rx * o.w.u, z = o.f.cz + o.f.rz * o.w.u;
      return { ...o, x, z, d: (x - _cam.x) ** 2 + (z - _cam.z) ** 2 };
    })
    .sort((a, c) => a.d - c.d);
  pictureLights.forEach((l, i) => {
    const o = works[i];
    if (!o) { l.visible = false; return; }
    const { W, H } = outerSize(o.w);
    const out = 1.1, up = H / 2 + 0.9;
    l.visible = true;
    l.position.set(o.x + o.f.nx * out, o.w.v + up, o.z + o.f.nz * out);
    l.target.position.set(o.x, o.w.v, o.z);
    l.target.updateMatrixWorld();
    const d = Math.hypot(out, up);
    l.angle = clamp(Math.atan((Math.max(W, H) / 2 + 0.25) / d), 0.2, 1.1);
    l.intensity = b * 1.8 * d * d * (0.7 + night * 0.5);
  });
}

export const spotMeshes = () => spotGroup.children.filter(o => o.userData.spotId);
