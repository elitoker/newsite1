import * as THREE from 'three';
import { scene, camera } from '../engine.js';
import { state, clamp } from '../state.js';
import { building } from '../world/building.js';
import { outerSize } from '../art/works.js';
import { roomAt, roomPath, doorWaypoints, collide } from './nav.js';
import { makeCharacter, disposeCharacter } from './character.js';
import { artistInfo, workLines } from '../art/artistinfo.js';

// The artists themselves. Whoever has work on the walls gets an avatar in the room
// where most of their work hangs. Walk up and they say hello; ask for a tour and they
// walk you to each of their works and talk about it.

export const artists = [];
const MAX = 6;
const COATS = ['#3b2f2a', '#2f3b4a', '#4a3b2f', '#5a2a2a', '#2e3a2e', '#1e1e24'];
const BERETS = ['#1c1c1e', '#6e1f24', '#23324f', '#3a4a2a'];
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const rand = (a, b) => a + Math.random() * (b - a);
const isPerson = a => a && !/^unknown|^anonymous/i.test(a) && !/\b(culture|school|workshop|follower|circle|style)\b/i.test(a);

let rebuildTimer = null;
export function scheduleArtists() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(buildArtists, 800);
}

export function buildArtists() {
  if (tour) return;   // don't pull anyone away mid-tour
  const L = building.layout;
  if (!L) return;
  // Count each artist's works per room
  const byArtist = new Map();
  for (const w of state.works) {
    const f = building.faces.get(w.faceId);
    if (!f || !isPerson(w.artist)) continue;
    const e = byArtist.get(w.artist) || { n: 0, rooms: {} };
    e.n++;
    e.rooms[f.room] = (e.rooms[f.room] || 0) + 1;
    byArtist.set(w.artist, e);
  }
  const wanted = [...byArtist.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, MAX);
  const names = new Set(wanted.map(([n]) => n));
  // Keep avatars that are still wanted, remove the rest
  for (let i = artists.length - 1; i >= 0; i--) {
    if (!names.has(artists[i].name) || !L.roomById[artists[i].room]) { disposeCharacter(artists[i].ch); artists.splice(i, 1); }
  }
  for (const [name, e] of wanted) {
    if (artists.some(a => a.name === name)) continue;
    // The room with most of their work, but spread out: a room that already has an
    // artist counts for less, so everyone isn't crowded into the entrance hall
    const taken = id => artists.filter(a => a.room === id).length;
    const room = L.roomById[Object.entries(e.rooms).sort((a, b) => (b[1] - taken(b[0]) * 2) - (a[1] - taken(a[0]) * 2))[0][0]];
    const h = hash(name);
    const ch = makeCharacter(h, { coat: COATS[h % COATS.length], beret: BERETS[(h >> 3) % BERETS.length], height: 1.62 + (h % 25) / 100 });
    scene.add(ch.root);
    const spot = standingSpot(room);
    artists.push({ name, room: room.id, ch, x: spot.x, z: spot.z, yaw: rand(0, 6), home: spot, info: null });
    artistInfo(name);   // start looking them up now so the greeting is ready
  }
}

// Somewhere in the room clear of walls, furniture and other artists
function standingSpot(room) {
  for (let i = 0; i < 30; i++) {
    const p = { x: rand(room.x0 + 1.6, room.x1 - 1.6), z: rand(room.z0 + 1.6, room.z1 - 1.6) };
    const before = { ...p };
    collide(p, 0.6, building.colliders);
    if (Math.hypot(p.x - before.x, p.z - before.z) > 0.01) continue;
    if (artists.some(a => Math.hypot(a.x - p.x, a.z - p.z) < 2.5)) continue;
    return p;
  }
  return { x: room.cx + 1, z: room.cz + 1 };
}

/* ---------------------------------------------------------------- talking */
const $ = id => document.getElementById(id);
const bubble = $('artistBubble'), dialog = $('artistDialog');
let near = null, tour = null;
export const artistNear = () => (!tour && near) || null;
export const touring = () => !!tour;

function say(a, lines, buttons) {
  dialog.hidden = false;
  $('artistName').textContent = a.name;
  $('artistText').innerHTML = '';
  for (const l of lines) { const p = document.createElement('p'); p.textContent = l; $('artistText').append(p); }
  $('artistButtons').innerHTML = '';
  for (const [label, fn, primary] of buttons) {
    const b = document.createElement('button');
    b.className = primary ? 'primary' : 'quiet';
    b.textContent = label;
    b.onclick = fn;
    $('artistButtons').append(b);
  }
}
function hush() { dialog.hidden = true; }

export async function talk(a = near) {
  if (!a) return;
  say(a, ['…'], []);
  const info = await artistInfo(a.name);
  a.info = info;
  const mine = state.works.filter(w => w.artist === a.name).length;
  const hello = [`Hello, I'm ${a.name}.`, ...(info?.intro || []).slice(0, 2)];
  hello.push(mine === 1 ? 'I have one work in this show.' : `I have ${mine} works in this show.`);
  say(a, hello, [
    ['Show me your work', () => startTour(a), true],
    ...(info?.likes?.length ? [['What inspires you?', () => say(a, info.likes, [['Show me your work', () => startTour(a), true], ['Goodbye', hush]])]] : []),
    ['Goodbye', hush],
  ]);
}

/* ---------------------------------------------------------------- the tour */
function spot(w) {
  const f = building.faces.get(w.faceId);
  const { W, H } = outerSize(w);
  const back = clamp(Math.max(W, H) * 1.1, 1.3, 3), side = W / 2 + 0.7;
  const cx = f.cx + f.rx * w.u, cz = f.cz + f.rz * w.u;
  // Stand beside the work, a step out from the wall, so you can see it past them
  return { x: cx + f.nx * back * 0.6 + f.rx * side, z: cz + f.nz * back * 0.6 + f.rz * side, tx: cx, tz: cz };
}

function startTour(a) {
  const L = building.layout;
  const works = state.works.filter(w => w.artist === a.name && building.faces.has(w.faceId));
  // Nearest first, then onward from each stop
  const order = [];
  let at = { x: a.x, z: a.z };
  const left = [...works];
  while (left.length) {
    left.sort((p, q) => Math.hypot(spot(p).x - at.x, spot(p).z - at.z) - Math.hypot(spot(q).x - at.x, spot(q).z - at.z));
    const w = left.shift();
    order.push(w);
    at = spot(w);
  }
  tour = { a, order, i: 0, state: 'walk', path: planPath(L, a, spot(order[0])), lines: null };
  say(a, ['Follow me.'], [['End the tour', endTour]]);
}

function planPath(L, a, s) {
  const from = roomAt(L, a.x, a.z, 0.5) || L.rooms[0];
  const to = roomAt(L, s.x, s.z, 0.5) || from;
  const path = [];
  let cur = from.id;
  for (const d of roomPath(L, from.id, to.id) || []) { path.push(...doorWaypoints(L, d, cur)); cur = d.rooms[0] === cur ? d.rooms[1] : d.rooms[0]; }
  path.push({ x: s.x, z: s.z });
  return path;
}

async function arrive() {
  const t = tour;
  const w = t.order[t.i];
  t.state = 'talk';
  say(t.a, ['…'], []);
  const lines = await workLines(w, t.a.info);
  if (tour !== t) return;
  let k = 0;
  const last = t.i === t.order.length - 1;
  const show = () => {
    const more = k < lines.length - 1;
    say(t.a, [lines[k]], [
      more ? ['Go on', () => { k++; show(); }, true]
        : last ? ['Thank you', () => finish(), true] : ['Next work', () => next(), true],
      ['End the tour', endTour],
    ]);
  };
  show();
}

function next() {
  const t = tour;
  t.i++;
  t.state = 'walk';
  t.path = planPath(building.layout, t.a, spot(t.order[t.i]));
  say(t.a, ['This way.'], [['End the tour', endTour]]);
}
function finish() {
  const a = tour.a;
  tour = null;
  say(a, ['That\'s all of mine in this show. Thank you for walking with me.', 'Stay as long as you like.'], [['Goodbye', hush, true]]);
  a.home = { x: a.x, z: a.z };
}
function endTour() {
  if (tour) tour.a.home = { x: tour.a.x, z: tour.a.z };
  tour = null;
  hush();
}

/* ---------------------------------------------------------------- per frame */
const _v = new THREE.Vector3();
function turn(a, b, max) {
  const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + clamp(d, -max, max);
}

export function updateArtists(dt, player, active) {
  // Who's close enough to say hello to?
  let best = null, bd = 2.6;
  if (active && !tour) for (const a of artists) { const d = Math.hypot(a.x - player.x, a.z - player.z); if (d < bd) { bd = d; best = a; } }
  if (best !== near) { near = best; if (!near && !dialog.hidden && !tour) hush(); }

  for (const a of artists) {
    let speed = 0, face = null;
    const guiding = tour?.a === a;
    if (guiding && tour.state === 'walk') {
      const wp = tour.path[0];
      const dx = wp.x - a.x, dz = wp.z - a.z, d = Math.hypot(dx, dz);
      const wait = Math.hypot(player.x - a.x, player.z - a.z) > 7;   // don't lose the visitor
      if (d < 0.2) { tour.path.shift(); if (!tour.path.length) arrive(); }
      else if (!wait) {
        speed = 1.1;
        a.x += (dx / d) * speed * dt; a.z += (dz / d) * speed * dt;
        const p = { x: a.x, z: a.z };
        collide(p, 0.28, building.colliders);
        a.x = p.x; a.z = p.z;
        face = Math.atan2(dx, dz);
      } else face = Math.atan2(player.x - a.x, player.z - a.z);
    } else if (guiding) {
      const s = spot(tour.order[tour.i]);
      face = Math.atan2((s.tx + player.x) / 2 - a.x, (s.tz + player.z) / 2 - a.z);   // between the work and you
    } else if (a === near) {
      face = Math.atan2(player.x - a.x, player.z - a.z);
    }
    if (face !== null) a.yaw = turn(a.yaw, face, dt * 5);
    a.ch.root.position.set(a.x, 0, a.z);
    a.ch.root.rotation.y = a.yaw;
    a.ch.animate(dt, speed, guiding && tour.state === 'talk' ? 'idle' : 'idle');
  }

  // A small hello over the nearest artist; click it (or press E) to talk
  if (near && dialog.hidden && active) {
    _v.set(near.x, 2.2, near.z).project(camera);
    if (_v.z < 1) {
      bubble.textContent = `Hello, I'm ${near.name}. Want a tour of my work?`;
      bubble.style.left = ((_v.x + 1) / 2) * innerWidth + 'px';
      bubble.style.top = ((1 - _v.y) / 2) * innerHeight + 'px';
      bubble.classList.add('show');
      return;
    }
  }
  bubble.classList.remove('show');
}

bubble.addEventListener('click', () => talk());

export function clearArtists() {
  tour = null;
  hush();
  for (const a of artists) disposeCharacter(a.ch);
  artists.length = 0;
}
