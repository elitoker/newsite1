import * as THREE from 'three';
import { camera, scene } from './engine.js';
import { clamp } from './state.js';
import { EYE, PLAYER_R } from './config.js';
import { input, consumeLook } from './input.js';
import { building } from './world/building.js';
import { collide, doorWaypoints } from './actors/nav.js';
import { makeCharacter } from './actors/character.js';
import { patrons } from './actors/patrons.js';

export const rig = {
  mode: 'first',
  player: { x: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, bob: 0, facing: Math.PI },
  third: { yaw: 0, pitch: 0.28, dist: 3.4 },
  drone: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0 },
  tour: null,
};
let avatar = null;
const raycaster = new THREE.Raycaster();

export function initRig() {
  avatar = makeCharacter(4242, { top: '#2336c8', bottom: '#1c1c1e', hair: '#1b1512', hairStyle: 'short', height: 1.8, coat: null });
  avatar.root.visible = false;
  scene.add(avatar.root);
}

export function resetPlayer() {
  const s = building.layout.start;
  Object.assign(rig.player, { x: s.x, z: s.z, yaw: 0, pitch: 0, vx: 0, vz: 0, facing: Math.PI });
  rig.third.yaw = 0;
  rig.tour = null;
  camera.position.set(s.x, EYE, s.z);
  camera.rotation.set(0, 0, 0);
}

export function setMode(m) {
  if (m === rig.mode) return;
  const p = rig.player;
  if (m === 'drone') {
    rig.drone.pos.copy(camera.position);
    rig.drone.yaw = camera.rotation.y;
    rig.drone.pitch = camera.rotation.x;
    rig.drone.vel.set(0, 0, 0);
  }
  if (m === 'third' && rig.mode === 'first') { rig.third.yaw = p.yaw; p.facing = p.yaw + Math.PI; }
  if (m === 'first' && rig.mode === 'third') { p.yaw = rig.third.yaw; p.pitch = 0; }
  if (m !== 'drone') rig.tour = null;
  rig.mode = m;
  avatar.root.visible = m !== 'first';
}

function moveInput() {
  const k = input.keys;
  let fx = 0, fz = 0;
  if (k.KeyW || k.ArrowUp) fz++;
  if (k.KeyS || k.ArrowDown) fz--;
  if (k.KeyD || k.ArrowRight) fx++;
  if (k.KeyA || k.ArrowLeft) fx--;
  fx += input.joy.x; fz += input.joy.y;
  const l = Math.hypot(fx, fz);
  if (l > 1) { fx /= l; fz /= l; }
  return { fx, fz, run: !!(k.ShiftLeft || k.ShiftRight), any: l > 0.05 };
}

// Walking on the floor, shared by first and third person. Returns speed.
function walk(dt, yaw) {
  const p = rig.player, { fx, fz, run } = moveInput();
  const speed = run ? 5 : 2.4;
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const tx = (fx * c - fz * s) * speed, tz = (-fx * s - fz * c) * speed;
  const k = 1 - Math.exp(-dt * 9);
  p.vx += (tx - p.vx) * k;
  p.vz += (tz - p.vz) * k;
  const pt = { x: p.x + p.vx * dt, z: p.z + p.vz * dt };
  for (const o of patrons) {
    const dx = pt.x - o.x, dz = pt.z - o.z, d = Math.hypot(dx, dz);
    if (d < 0.55 && d > 1e-4) { pt.x += (dx / d) * (0.55 - d); pt.z += (dz / d) * (0.55 - d); }
  }
  collide(pt, PLAYER_R, building.colliders);
  p.x = pt.x; p.z = pt.z;
  return Math.hypot(p.vx, p.vz);
}

function turn(a, b, max) {
  const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + clamp(d, -max, max);
}

const _target = new THREE.Vector3(), _back = new THREE.Vector3(), _right = new THREE.Vector3(), _want = new THREE.Vector3();

export function updateRig(dt) {
  const [dx, dy, wheel] = consumeLook();
  const p = rig.player;

  if (rig.mode === 'first') {
    p.yaw -= dx;
    p.pitch = clamp(p.pitch - dy, -1.4, 1.4);
    const sp = walk(dt, p.yaw);
    p.bob += sp * dt * 3.2;
    camera.position.set(p.x, EYE + Math.sin(p.bob) * 0.018 * Math.min(1, sp / 2), p.z);
    camera.rotation.set(p.pitch, p.yaw, 0);
    return;
  }

  if (rig.mode === 'third') {
    const t = rig.third;
    t.yaw -= dx;
    t.pitch = clamp(t.pitch + dy, -0.45, 1.2);
    t.dist = clamp(t.dist + wheel * 0.003, 1.6, 9);
    const sp = walk(dt, t.yaw);
    if (sp > 0.15) p.facing = turn(p.facing, Math.atan2(p.vx, p.vz), dt * 10);
    avatar.root.position.set(p.x, 0, p.z);
    avatar.root.rotation.y = p.facing;
    avatar.animate(dt, sp);

    // Over-the-shoulder camera that pulls in instead of clipping through walls
    _target.set(p.x, 1.55, p.z);
    _back.set(Math.sin(t.yaw) * Math.cos(t.pitch), Math.sin(t.pitch), Math.cos(t.yaw) * Math.cos(t.pitch));
    _right.set(Math.cos(t.yaw), 0, -Math.sin(t.yaw)).multiplyScalar(0.45);
    _target.add(_right);
    raycaster.set(_target, _back);
    raycaster.far = t.dist;
    const hit = raycaster.intersectObjects(building.wallMeshes, false)[0];
    const dist = hit ? Math.max(0.3, hit.distance - 0.25) : t.dist;
    _want.copy(_target).addScaledVector(_back, dist);
    _want.y = Math.min(_want.y, building.layout.h - 0.3);
    camera.position.copy(_want);
    camera.lookAt(_target);
    return;
  }

  // Drone
  avatar.root.position.set(p.x, 0, p.z);
  avatar.root.rotation.y = p.facing;
  avatar.animate(dt, 0);
  const d = rig.drone;
  const mv = moveInput();
  const vert = (input.keys.Space ? 1 : 0) - (input.keys.KeyC ? 1 : 0) + input.rise;

  if (rig.tour && (mv.any || vert || Math.abs(dx) + Math.abs(dy) > 0.002)) {
    rig.tour = null;
    d.pos.copy(camera.position); d.yaw = camera.rotation.y; d.pitch = camera.rotation.x;
  }
  if (rig.tour) { updateTour(dt); return; }

  d.yaw -= dx;
  d.pitch = clamp(d.pitch - dy, -1.5, 1.5);
  const speed = mv.run ? 16 : 6;
  const cy = Math.cos(d.pitch);
  const fwd = new THREE.Vector3(-Math.sin(d.yaw) * cy, Math.sin(d.pitch), -Math.cos(d.yaw) * cy);
  const right = new THREE.Vector3(Math.cos(d.yaw), 0, -Math.sin(d.yaw));
  _want.set(0, 0, 0).addScaledVector(fwd, mv.fz * speed).addScaledVector(right, mv.fx * speed);
  _want.y += vert * speed * 0.7;
  d.vel.lerp(_want, 1 - Math.exp(-dt * 4));
  d.pos.addScaledVector(d.vel, dt);
  const b = building.layout.bounds;
  d.pos.x = clamp(d.pos.x, b.x0 - 40, b.x1 + 40);
  d.pos.z = clamp(d.pos.z, b.z0 - 40, b.z1 + 40);
  d.pos.y = clamp(d.pos.y, 0.3, 70);
  camera.position.copy(d.pos);
  camera.rotation.set(d.pitch, d.yaw, 0);
}

/* ---------------------------------------------------------------- tour */
// Glides through every room, in and out of each doorway, and loops.
export function startTour() {
  const L = building.layout;
  const y = Math.min(2.4, L.h - 1);
  const v = p => new THREE.Vector3(p.x, y, p.z);
  const pts = [];
  const visited = new Set();
  const visit = id => {
    visited.add(id);
    const r = L.roomById[id];
    pts.push(new THREE.Vector3(r.cx + 0.6, y, r.cz + 0.6));
    for (const dr of L.doors) {
      if (!dr.rooms.includes(id)) continue;
      const other = dr.rooms[0] === id ? dr.rooms[1] : dr.rooms[0];
      if (visited.has(other)) continue;
      const [a, b] = doorWaypoints(L, dr, id, 1.2);
      pts.push(v(a), v(b));
      visit(other);
      // Come back through the same door, offset so the path forms a loop
      const off = dr.o === 'h' ? { x: 0.5, z: 0 } : { x: 0, z: 0.5 };
      pts.push(v({ x: b.x + off.x, z: b.z + off.z }), v({ x: a.x + off.x, z: a.z + off.z }));
      pts.push(new THREE.Vector3(r.cx - 0.6, y, r.cz - 0.6));
    }
  };
  visit(L.start.room);
  if (L.rooms.length === 1) {
    const r = L.rooms[0];
    pts.length = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      pts.push(new THREE.Vector3(r.cx + Math.cos(a) * (r.x1 - r.x0) * 0.3, y, r.cz + Math.sin(a) * (r.z1 - r.z0) * 0.3));
    }
  }
  const clean = pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 0.4);
  const curve = new THREE.CatmullRomCurve3(clean, true, 'centripetal');
  rig.tour = { curve, u: 0, len: curve.getLength(), yaw: camera.rotation.y };
}
export const stopTour = () => { rig.tour = null; };

function updateTour(dt) {
  const t = rig.tour;
  t.u = (t.u + (dt * 1.4) / t.len) % 1;
  const pos = t.curve.getPointAt(t.u);
  const ahead = t.curve.getPointAt((t.u + 3 / t.len) % 1);
  const want = Math.atan2(-(ahead.x - pos.x), -(ahead.z - pos.z));
  t.yaw = turn(t.yaw, want, dt * 0.9);
  camera.position.copy(pos);
  camera.rotation.set(-0.04, t.yaw, 0);
}
