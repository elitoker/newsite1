import * as THREE from 'three';
import { scene } from '../engine.js';
import { state, clamp } from '../state.js';
import { building } from '../world/building.js';
import { outerSize } from '../art/works.js';
import { roomAt, roomPath, doorWaypoints, collide } from './nav.js';
import { makeCharacter } from './character.js';

export const patrons = [];
const group = new THREE.Group();
scene.add(group);
let seedCounter = 1;

const rand = (a, b) => a + Math.random() * (b - a);
function randomPointIn(room, m = 1.2) {
  return { x: rand(room.x0 + m, room.x1 - m), z: rand(room.z0 + m, room.z1 - m) };
}

function spawn() {
  const L = building.layout;
  const ch = makeCharacter(seedCounter++ * 7919 + 13);
  const room = L.rooms[Math.floor(Math.random() * L.rooms.length)];
  const pt = randomPointIn(room);
  collide(pt, 0.3, building.colliders);
  const p = {
    ch, x: pt.x, z: pt.z, yaw: Math.random() * Math.PI * 2, vx: 0, vz: 0,
    speed: rand(0.8, 1.3), path: [], state: 'pause', timer: rand(0, 3), target: null,
    seen: [], stuck: 0, checkT: 0, lastX: pt.x, lastZ: pt.z,
  };
  group.add(ch.root);
  return p;
}

export function setPatronCount(n) {
  while (patrons.length > n) group.remove(patrons.pop().ch.root);
  while (patrons.length < n) patrons.push(spawn());
}
export function resetPatrons() {
  const n = patrons.length;
  setPatronCount(0);
  setPatronCount(n);
}
// After a rebuild: anyone now standing outside the rooms is moved back in, and everyone replans
export function revalidatePatrons() {
  const L = building.layout;
  for (const p of patrons) {
    if (!roomAt(L, p.x, p.z)) {
      const pt = randomPointIn(L.rooms[Math.floor(Math.random() * L.rooms.length)]);
      collide(pt, 0.3, building.colliders);
      p.x = pt.x; p.z = pt.z;
    }
    Object.assign(p, { state: 'pause', timer: rand(0, 1), path: [], target: null, vx: 0, vz: 0 });
  }
}

// Called when works change: anyone staring at a work that's gone moves on
export function onWorksChanged() {
  const ids = new Set(state.works.map(w => w.id));
  for (const p of patrons) if (p.target && !ids.has(p.target.id)) { p.state = 'pause'; p.timer = rand(0.3, 1.5); p.target = null; }
}

function plan(p) {
  const L = building.layout;
  const from = roomAt(L, p.x, p.z, 0.5) || L.rooms[0];
  const works = state.works.filter(w => building.faces.has(w.faceId));
  let dest, room, target = null;

  if (works.length && Math.random() < 0.8) {
    const fresh = works.filter(w => !p.seen.includes(w.id));
    const pool = fresh.length ? fresh : works;
    const w = pool[Math.floor(Math.random() * pool.length)];
    const f = building.faces.get(w.faceId);
    const { W, H } = outerSize(w);
    room = L.roomById[f.room];
    // Bigger works get looked at from farther back
    const depth = (f.nx ? room.x1 - room.x0 : room.z1 - room.z0) - 1.2;
    const dist = Math.min(clamp(Math.max(W, H) * 1.4, 1.5, 5), depth);
    const lateral = (Math.random() - 0.5) * Math.min(W, 1.5);
    const cx = f.cx + f.rx * w.u, cz = f.cz + f.rz * w.u;
    dest = { x: cx + f.nx * dist + f.rx * lateral, z: cz + f.nz * dist + f.rz * lateral };
    target = { id: w.id, x: cx, z: cz };
    p.seen.push(w.id);
    if (p.seen.length > 6) p.seen.shift();
  } else {
    room = Math.random() < 0.6 ? from : L.rooms[Math.floor(Math.random() * L.rooms.length)];
    dest = randomPointIn(room);
  }
  dest.x = clamp(dest.x, room.x0 + 0.6, room.x1 - 0.6);
  dest.z = clamp(dest.z, room.z0 + 0.6, room.z1 - 0.6);

  const doors = roomPath(L, from.id, room.id) || [];
  const path = [];
  let cur = from.id;
  for (const d of doors) {
    path.push(...doorWaypoints(L, d, cur));
    cur = d.rooms[0] === cur ? d.rooms[1] : d.rooms[0];
  }
  path.push(dest);
  Object.assign(p, { path, target, state: 'walk', stuck: 0, checkT: 0, lastX: p.x, lastZ: p.z });
}

function turn(a, b, max) {
  const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + clamp(d, -max, max);
}

export function updatePatrons(dt, player) {
  if (!building.layout) return;
  for (const p of patrons) {
    let tvx = 0, tvz = 0;
    if (p.state === 'walk') {
      const wp = p.path[0];
      if (!wp) {
        p.state = p.target ? 'look' : 'pause';
        p.timer = p.target ? rand(5, 15) : rand(1.5, 5);
      } else {
        const dx = wp.x - p.x, dz = wp.z - p.z, d = Math.hypot(dx, dz);
        const last = p.path.length === 1;
        if (d < (last ? 0.2 : 0.45)) p.path.shift();
        else {
          const sp = p.speed * (last ? Math.min(1, d / 1.2 + 0.25) : 1);
          tvx = (dx / d) * sp; tvz = (dz / d) * sp;
        }
      }
    } else {
      p.timer -= dt;
      if (p.timer <= 0) plan(p);
    }

    // Keep a polite distance from each other and from you
    const avoid = (x, z, R) => {
      const ox = p.x - x, oz = p.z - z, d2 = ox * ox + oz * oz;
      if (d2 < R * R && d2 > 1e-6) {
        const d = Math.sqrt(d2), f = (R - d) / R;
        tvx += (ox / d) * f * 1.2; tvz += (oz / d) * f * 1.2;
      }
    };
    for (const o of patrons) if (o !== p) avoid(o.x, o.z, 0.75);
    if (player) avoid(player.x, player.z, 0.85);

    const k = 1 - Math.exp(-dt * 6);
    p.vx += (tvx - p.vx) * k;
    p.vz += (tvz - p.vz) * k;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    const pt = { x: p.x, z: p.z };
    collide(pt, 0.28, building.colliders);
    p.x = pt.x; p.z = pt.z;

    const speed = Math.hypot(p.vx, p.vz);
    let want = p.yaw;
    if (speed > 0.15) want = Math.atan2(p.vx, p.vz);
    else if (p.state === 'look' && p.target) want = Math.atan2(p.target.x - p.x, p.target.z - p.z);
    p.yaw = turn(p.yaw, want, dt * 5);
    p.ch.root.position.set(p.x, 0, p.z);
    p.ch.root.rotation.y = p.yaw;
    p.ch.animate(dt, speed, p.state === 'look' ? 'look' : 'idle');

    // Give up and pick something else if boxed in
    if (p.state === 'walk') {
      p.checkT += dt;
      if (p.checkT > 1.5) {
        const moved = Math.hypot(p.x - p.lastX, p.z - p.lastZ);
        p.stuck = moved < 0.2 ? p.stuck + 1 : 0;
        p.lastX = p.x; p.lastZ = p.z; p.checkT = 0;
        if (p.stuck >= 3) { p.state = 'pause'; p.timer = rand(0.5, 1.5); p.target = null; }
      }
    }
  }
}
