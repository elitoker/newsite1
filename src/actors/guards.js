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
    const home = face;
    const ch = makeCharacter(9001 + i * 31, {
      suit: true, top: SUITS[i % SUITS.length], bottom: SUITS[i % SUITS.length], coat: null,
      tie: TIES[i % TIES.length], hairStyle: i % 3 ? 'short' : 'none', height: rand(1.72, 1.9),
    });
    group.add(ch.root);
    guards.push({ ch, room: room.id, post, pace, face, home, x: post.x, z: post.z, yaw: face, target: null, timer: rand(8, 20), scan: 0 });
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
      g.yaw = turn(g.yaw, g === talking ? g.face : (g.face = g.home), dt * 3);
      if (g.timer <= 0) g.target = g.back ? g.post : g.pace;
    }
    // Slowly scan the room while standing
    g.scan += dt;
    g.ch.head.rotation.y = speed || g === talking ? 0 : Math.sin(g.scan * 0.35) * 0.6;
    g.ch.root.position.set(g.x, 0, g.z);
    g.ch.root.rotation.y = g.yaw;
    g.ch.animate(dt, speed, 'guard');
  }
}

/* ---------------------------------------------------------------- a word from the guard */
// Walk up to a guard and they turn to you and say something short.
// Proverbs, and lines from writers long in the public domain.
const SAYINGS = [
  'Look slowly. The painting has been waiting a long time.',
  'Every artist was first an amateur. Emerson said that.',
  'A picture is a poem without words. That one is Horace.',
  'The best view is usually one step back.',
  'Nothing great was ever achieved without enthusiasm. Emerson again.',
  'Art is long, life is short. Hippocrates had it right.',
  'Fall seven times, stand up eight.',
  'Stay with one painting longer than feels normal. It pays off.',
  'The eye sees only what the mind is prepared to see.',
  'What we observe is not nature itself, but nature exposed to our way of looking.',
  'Patience is bitter, but its fruit is sweet.',
  'Great things are done by a series of small things brought together. Van Gogh.',
  'If you hear a voice within you say you cannot paint, then paint. Van Gogh, too.',
  'I dream my painting, and then I paint my dream. Also Van Gogh. He had a lot to say.',
  'Color is my day-long obsession, joy and torment. That was Monet.',
  'Simplicity is the ultimate sophistication.',
  'The journey of a thousand miles begins with one step.',
  'When the student is ready, the teacher appears.',
  'Tell me and I forget. Show me and I remember.',
  'A smooth sea never made a skilled sailor.',
  'Where there is love, there is life.',
  'The best time to plant a tree was twenty years ago. The second best time is now.',
  'You can\'t use up creativity. The more you use, the more you have.',
  'Quiet is a kind of attention.',
  'Nobody gets to the good part without the boring part.',
  'Be kind. Every person you meet is carrying a whole gallery inside.',
  'Rest if you must, but don\'t quit.',
  'Light is the first painter.',
  'Curiosity is the best ticket in the building.',
  'Take the long way around this room. You won\'t regret it.',
  'Please don\'t touch the art. But do let it touch you.',
  'I\'ve stood here for years and I still notice something new every day.',
  'Still waters run deep. So do still paintings.',
  'Well begun is half done.',
  'The heart has its reasons which reason knows nothing of. Pascal.',
  'To see a world in a grain of sand. Blake wrote that.',
  'Keep your face to the sunshine and you cannot see a shadow.',
  'Enjoy the show. And drink some water.',
];

const bubble = document.getElementById('bubble');
const _v = new THREE.Vector3();
let talking = null, lastLine = -1;

export function updateGuardTalk(player, camera, active = true) {
  if (!bubble) return;
  if (!active) { bubble.classList.remove('show'); talking = null; return; }
  let near = null, best = 2.4;
  for (const g of guards) {
    const d = Math.hypot(g.x - player.x, g.z - player.z);
    if (d < best) { best = d; near = g; }
  }
  // Pick a new line each time you walk up
  if (near !== talking) {
    for (const g of guards) if (g !== near) g.said = null;
    talking = near;
    if (near && !near.said) {
      let i;
      do i = Math.floor(Math.random() * SAYINGS.length); while (i === lastLine && SAYINGS.length > 1);
      lastLine = i;
      near.said = SAYINGS[i];
      bubble.textContent = near.said;
    }
  }
  if (!near) { bubble.classList.remove('show'); return; }
  // Face you while talking, then go back to the room
  near.face = Math.atan2(player.x - near.x, player.z - near.z);
  near.target = null;
  near.timer = Math.max(near.timer, 3);
  _v.set(near.x, 2.15, near.z).project(camera);
  if (_v.z > 1) { bubble.classList.remove('show'); return; }
  bubble.style.left = ((_v.x + 1) / 2) * innerWidth + 'px';
  bubble.style.top = ((1 - _v.y) / 2) * innerHeight + 'px';
  bubble.classList.add('show');
}
