import * as THREE from 'three';
import { scene } from '../engine.js';
import { state } from '../state.js';
import { building } from '../world/building.js';
import { collide } from './nav.js';
import { makeCharacter } from './character.js';

// One guard in a dark suit per room. Each keeps a post near a corner, clear of
// the doors, scans the room, and now and then paces a few steps along the wall.

export const guards = [];
const group = new THREE.Group();
scene.add(group);

const rand = (a, b) => a + Math.random() * (b - a);
const SUITS = ['#16181d', '#1d2230', '#23232a', '#2a2d33'];
const TIES = ['#1a1c24', '#5a1d22', '#23324f', '#3a3a3a'];

function postFor(room, L) {
  const inset = 0.9;
  const corners = [
    { x: room.x0 + inset, z: room.z0 + inset }, { x: room.x1 - inset, z: room.z0 + inset },
    { x: room.x0 + inset, z: room.z1 - inset }, { x: room.x1 - inset, z: room.z1 - inset },
  ];
  // Prefer the corner farthest from every doorway and from the entrance glass
  const score = c => Math.min(...L.doors.map(d => Math.hypot(d.x - c.x, d.z - c.z)), 99);
  const best = corners.sort((a, b) => score(b) - score(a))[0];
  // Pace along the longer wall from the corner
  const alongX = room.x1 - room.x0 >= room.z1 - room.z0;
  const dir = alongX ? Math.sign(room.cx - best.x) : Math.sign(room.cz - best.z);
  const pace = { x: best.x + (alongX ? dir * 3 : 0), z: best.z + (alongX ? 0 : dir * 3) };
  return { post: best, pace, face: Math.atan2(room.cx - best.x, room.cz - best.z) };
}

export function buildGuards() {
  for (const g of guards) group.remove(g.ch.root);
  guards.length = 0;
  const L = building.layout;
  if (!state.guards || !L) return;
  L.rooms.forEach((room, i) => {
    const { post, pace, face } = postFor(room, L);
    const ch = makeCharacter(9001 + i * 31, {
      suit: true, top: SUITS[i % SUITS.length], bottom: SUITS[i % SUITS.length], coat: null,
      tie: TIES[i % TIES.length], hairStyle: i % 3 ? 'short' : 'none', height: rand(1.72, 1.9),
    });
    group.add(ch.root);
    guards.push({ ch, room: room.id, post, pace, face, x: post.x, z: post.z, yaw: face, target: null, timer: rand(8, 20), scan: 0 });
  });
}

function turn(a, b, max) {
  const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + Math.max(-max, Math.min(max, d));
}

export function updateGuards(dt) {
  for (const g of guards) {
    let speed = 0;
    if (g.target) {
      const dx = g.target.x - g.x, dz = g.target.z - g.z, d = Math.hypot(dx, dz);
      if (d < 0.1) {
        // Pause briefly at the far end of the pace, longer back at the post
        g.back = g.target === g.pace;
        g.timer = g.back ? rand(2, 4) : rand(12, 30);
        g.target = null;
      } else {
        speed = 0.9;
        g.x += (dx / d) * speed * dt; g.z += (dz / d) * speed * dt;
        const p = { x: g.x, z: g.z };
        collide(p, 0.28, building.colliders);
        g.x = p.x; g.z = p.z;
        g.yaw = turn(g.yaw, Math.atan2(dx, dz), dt * 5);
      }
    } else {
      g.timer -= dt;
      g.yaw = turn(g.yaw, g.face, dt * 2);
      if (g.timer <= 0) g.target = g.back ? g.post : g.pace;
    }
    // Slowly scan the room while standing
    g.scan += dt;
    g.ch.head.rotation.y = speed ? 0 : Math.sin(g.scan * 0.35) * 0.6;
    g.ch.root.position.set(g.x, 0, g.z);
    g.ch.root.rotation.y = g.yaw;
    g.ch.animate(dt, speed, 'guard');
  }
}
