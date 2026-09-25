import * as THREE from 'three';
import { scene, camera } from '../engine.js';
import { state, clamp } from '../state.js';
import { CENTERLINE } from '../config.js';
import { building } from '../world/building.js';
import { outerSize } from '../art/works.js';
import { makeCharacter } from '../actors/character.js';
import { roomAt, roomPath, doorWaypoints, collide } from '../actors/nav.js';
import { RAQUEL } from '../art/raquel.js';

// Story mode: commissions with a brief, a critic who walks the show, a review, stars.

const PROGRESS_KEY = 'museum-machine-story-progress';
export const levelSlot = id => 'museum-machine-story-' + id;

const WATER = /water|sea|river|lake|harbou?r|boat|bay|bridge|wave|canal|beach|coast|pond|fountain|rain|ocean|shore|marine|ship|seine|thames|venice/i;
const FACES = /portrait|woman|man\b|girl|boy|lady|self|madame|mrs|mr\.|child|gentleman|head of|bust of/i;
const year = w => { const m = /(1[0-9]{3}|20[0-9]{2})/.exec(w.date || ''); return m ? +m[1] : null; };

export const LEVELS = [
  {
    id: 'first', title: 'The First Commission', critic: 'Pat Ruiz', paper: 'the Hometown Herald',
    brief: 'A small town gallery wants its very first show. Hang at least five works, any you like. Keep them at eye level and give them room to breathe.',
    look: { layout: 'single', room: { w: 14, d: 18, h: 5 }, wallColor: '#f1efea', floor: 'oak', frame: 'black', fixture: 'track', skylight: 'strips', backdrop: 'park', time: 0.1 },
    goals: [{ text: 'At least 5 works on the walls', test: s => s.works.length >= 5 }],
  },
  {
    id: 'water', title: 'Light on Water', critic: 'Margot Lindqvist', paper: 'The Coastal Review',
    brief: 'A seaside museum wants a summer show about water. Hang at least six works of seas, rivers, harbors or rain. Try searching for water, harbor or boats.',
    look: { layout: 'enfilade', room: { w: 12, d: 30, h: 5.5 }, wallColor: '#3e5b50', floor: 'oak', frame: 'gold', fixture: 'track', skylight: 'strips', backdrop: 'park', time: 0.35 },
    goals: [{ text: 'At least 6 works about water', test: s => s.works.filter(w => WATER.test(w.title + ' ' + w.medium)).length >= 6 }],
  },
  {
    id: 'faces', title: 'Faces', critic: 'Theo Adeyemi', paper: 'Portrait Quarterly',
    brief: 'A portrait show. Hang at least eight portraits, and keep their centers at the same height so the room reads as a line of faces.',
    look: { layout: 'enfilade', room: { w: 12, d: 34, h: 6 }, wallColor: '#26344d', floor: 'walnut', frame: 'gold', fixture: 'pendant', skylight: 'none', backdrop: 'city', time: 0.2 },
    goals: [
      { text: 'At least 8 portraits', test: s => s.works.filter(w => FACES.test(w.title)).length >= 8 },
      { text: 'Portraits hung at an even height', test: s => spread(s.works.filter(w => FACES.test(w.title)).map(w => w.v)) < 0.25 },
    ],
  },
  {
    id: 'solo', title: 'A Single Voice', critic: 'Inès Faure', paper: 'Le Regard',
    brief: 'A solo show. Pick one artist and hang at least eight of their works. Search their name in the Art tab to find them.',
    look: { layout: 'hall', room: { w: 24, d: 30, h: 6 }, wallColor: '#c9c3b8', floor: 'oak', frame: 'oak', fixture: 'track', skylight: 'strips', backdrop: 'city', time: 0.15 },
    goals: [{ text: 'At least 8 works by one artist, and most of the show by them', test: s => { const t = topArtist(s.works); return t.n >= 8 && t.n / s.works.length >= 0.75; } }],
  },
  {
    id: 'night', title: 'Opening Night', critic: 'Sam Okafor', paper: 'Nightlife Weekly',
    brief: 'An evening opening. Hang at least ten works, light every one of them, set out at least three pieces of furniture or sculpture for the crowd, and have the guards on duty.',
    look: { layout: 'hall', room: { w: 26, d: 32, h: 6 }, wallColor: '#34332f', floor: 'concrete', frame: 'black', fixture: 'pendant', skylight: 'strips', backdrop: 'city', time: 1 },
    goals: [
      { text: 'At least 10 works', test: s => s.works.length >= 10 },
      { text: 'Picture lights on', test: s => s.lighting.picture },
      { text: 'At least 3 pieces of furniture or sculpture', test: s => s.furniture.length >= 3 },
      { text: 'Guards on duty', test: s => s.guards },
    ],
  },
  {
    id: 'grand', title: 'The Grand Hall', critic: 'Dame Celia Hart', paper: 'The Times of Art',
    brief: 'The big one. Fill a grand museum: at least twenty works across at least four rooms, spanning at least three centuries.',
    look: { layout: 'hall', room: { w: 32, d: 46, h: 8 }, wallColor: '#7a2a2a', floor: 'walnut', frame: 'gold', fixture: 'chandelier', skylight: 'giant', backdrop: 'plaza', time: 0.4 },
    goals: [
      { text: 'At least 20 works', test: s => s.works.length >= 20 },
      { text: 'Works in at least 4 rooms', test: s => new Set(s.works.map(w => building.faces.get(w.faceId)?.room)).size >= 4 },
      { text: 'Works from at least 3 centuries', test: s => new Set(s.works.map(year).filter(Boolean).map(y => Math.floor(y / 100))).size >= 3 },
    ],
  },
  {
    id: 'raquel', title: 'Raquel Weinberg: A Retrospective', critic: 'The whole art world', paper: 'every paper in town',
    brief: 'The show everyone has been waiting for. Hang all twelve of Raquel Weinberg\'s works (search her name in the Art tab), light them well, and make the room worthy of them.',
    look: { layout: 'hall', room: { w: 26, d: 30, h: 6.5 }, wallColor: '#f1efea', floor: 'oak', frame: 'none', fixture: 'track', skylight: 'giant', backdrop: 'city', time: 0.6 },
    goals: [
      { text: 'All 12 of Raquel\'s works on the walls', test: s => new Set(s.works.filter(w => w.artist === 'Raquel Weinberg').map(w => w.title)).size >= RAQUEL.length },
      { text: 'Picture lights on', test: s => s.lighting.picture },
    ],
  },
];

const spread = vs => (vs.length < 2 ? 0 : Math.max(...vs) - Math.min(...vs));
function topArtist(works) {
  const c = {};
  for (const w of works) c[w.artist] = (c[w.artist] || 0) + 1;
  const [artist, n] = Object.entries(c).sort((a, b) => b[1] - a[1])[0] || ['', 0];
  return { artist, n };
}

/* ---------------------------------------------------------------- progress */
export function progress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || { stars: {} }; } catch { return { stars: {} }; }
}
function saveProgress(p) { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch {} }
export const unlocked = (i, p = progress()) => i === 0 || (p.stars[LEVELS[i - 1].id] || 0) >= 1;

/* ---------------------------------------------------------------- judging */
// Per-work craft: eye level, breathing room, light. Returns 0..1.
function judgeWork(w) {
  const f = building.faces.get(w.faceId);
  const { W, H } = outerSize(w);
  let s = 1;
  const notes = [];
  if (H < 1.8 && Math.abs(w.v - CENTERLINE) > 0.3) { s -= 0.3; notes.push(w.v > CENTERLINE ? 'high' : 'low'); }
  const neighbors = state.works.filter(o => o !== w && o.faceId === w.faceId);
  for (const o of neighbors) {
    const gap = Math.abs(o.u - w.u) - (W + outerSize(o).W) / 2;
    if (gap < 0.45) { s -= 0.25; notes.push('crowded'); break; }
  }
  if (f && f.len / Math.max(1, neighbors.length + 1) < W + 0.6) { s -= 0.1; notes.push('crowded'); }
  if (state.lighting.picture) s += 0.05;
  return { score: clamp(s, 0, 1), notes };
}

export function judge(level) {
  const goals = level.goals.map(g => ({ text: g.text, ok: !!g.test(state) }));
  const per = state.works.map(w => ({ w, ...judgeWork(w) }));
  const craft = per.length ? per.reduce((s, p) => s + p.score, 0) / per.length : 0;
  const b = state.lighting.brightness;
  const light = (b >= 0.7 && b <= 1.6 ? 1 : 0.6) * (state.lighting.picture ? 1 : 0.8);
  const rooms = building.layout.rooms.length;
  const seats = state.furniture.filter(f => ['bench', 'sofa', 'lounge'].includes(f.type)).length + building.layout.benches.length;
  const comfort = Math.min(1, seats / Math.max(1, rooms * 0.5));
  const fill = Math.min(1, state.works.length / Math.max(4, building.faces.size * 0.4));
  const score = Math.round(100 * (craft * 0.45 + light * 0.2 + comfort * 0.15 + fill * 0.2));
  const met = goals.every(g => g.ok);
  const stars = !met ? 0 : score >= 85 ? 3 : score >= 65 ? 2 : 1;
  return { goals, per, score, stars, met, craft, light, comfort, fill };
}

/* ---------------------------------------------------------------- the review */
const pick = a => a[Math.floor(Math.random() * a.length)];
export function writeReview(level, j) {
  const best = [...j.per].sort((a, b) => b.score - a.score || outerSize(b.w).W - outerSize(a.w).W)[0];
  const crowded = j.per.filter(p => p.notes.includes('crowded')).length;
  const offLevel = j.per.filter(p => p.notes.includes('high') || p.notes.includes('low')).length;
  const lines = [];
  if (!j.met) {
    lines.push(pick([
      `I came to ${state.showTitle || 'this show'} expecting what was promised, and it isn't quite here yet.`,
      'There is the start of a good show here, but it doesn\'t deliver on its own brief.',
    ]));
    const missed = j.goals.filter(g => !g.ok).map(g => g.text.toLowerCase());
    lines.push(`What's missing: ${missed.join('; ')}.`);
  } else if (j.stars === 3) {
    lines.push(pick([
      'This is the kind of show you tell your friends about on the way out.',
      'Rarely does a hang feel this inevitable. Every work is exactly where it should be.',
      'I went back through it twice before I was ready to leave.',
    ]));
  } else if (j.stars === 2) {
    lines.push(pick([
      'A confident, thoughtful show with a few rough edges.',
      'Good bones, good eye, and a couple of walls that need another look.',
    ]));
  } else {
    lines.push(pick([
      'The show meets its brief, though the hang could use more care.',
      'Everything asked for is here. The craft is still catching up.',
    ]));
  }
  if (best) lines.push(`The highlight is ${best.w.artist}'s ${best.w.title}, ${pick(['given the space it deserves', 'which holds its wall beautifully', 'and I stood in front of it longer than I planned'])}.`);
  if (crowded) lines.push(crowded > 2 ? 'Several walls are packed too tightly; the works fight for air.' : 'One or two works are crowded by their neighbors.');
  if (offLevel) lines.push(offLevel > 2 ? 'The hanging height wanders from wall to wall, which makes the rooms feel restless.' : 'A work or two sits noticeably above or below eye level.');
  if (!crowded && !offLevel && j.per.length) lines.push('The spacing and hanging height are disciplined throughout.');
  lines.push(j.light >= 1 ? 'The lighting is warm and even, and the picture lights do their job.' : 'The lighting could be kinder to the work.');
  if (j.comfort < 0.5) lines.push('I would have liked somewhere to sit.');
  return lines;
}

export function awardStars(level, stars) {
  const p = progress();
  const before = p.stars[level.id] || 0;
  p.stars[level.id] = Math.max(before, stars);
  saveProgress(p);
  return { improved: stars > before, firstUnlock: before === 0 && stars > 0 };
}

/* ---------------------------------------------------------------- the critic walks the show */
let critic = null;
const REACT = {
  good: ['Oh, lovely.', 'Now that is a painting.', 'Yes.', 'Beautifully placed.', 'I could stay here.', 'Marvelous light.'],
  mid: ['Hm.', 'Interesting.', 'Fine.', 'I see what you\'re doing.', 'Mm-hm.'],
  bad: ['Why is this so high?', 'This needs room to breathe.', 'Oh dear.', 'Too crowded.', 'Hm. No.'],
};

export function startCritic(level, j, onDone) {
  stopCritic();
  const ch = makeCharacter(777, { top: '#2b2622', bottom: '#1c1c1e', coat: '#a88a62', hair: '#d8d4cc', hairStyle: 'short', height: 1.78 });
  // Round glasses so you can tell the critic apart
  const glasses = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  for (const x of [-0.04, 0.04]) { const g = glasses.clone(); g.position.set(x, 0.01, 0.1); ch.head.add(g); }
  scene.add(ch.root);
  const L = building.layout;
  // Visit the works room by room, nearest first
  const order = [];
  const remaining = [...j.per];
  let at = { x: L.start.x, z: L.start.z };
  while (remaining.length) {
    remaining.sort((a, b) => dist(at, spot(a.w)) - dist(at, spot(b.w)));
    const n = remaining.shift();
    order.push(n);
    at = spot(n.w);
  }
  critic = { ch, level, j, order, i: 0, x: L.start.x, z: L.start.z, yaw: Math.PI, path: [], state: 'plan', timer: 0, onDone, said: '' };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function spot(w) {
  const f = building.faces.get(w.faceId);
  if (!f) return { x: 0, z: 0, tx: 0, tz: 0 };
  const { W, H } = outerSize(w);
  const back = clamp(Math.max(W, H) * 1.3, 1.6, 4);
  const cx = f.cx + f.rx * w.u, cz = f.cz + f.rz * w.u;
  return { x: cx + f.nx * back, z: cz + f.nz * back, tx: cx, tz: cz };
}

export function stopCritic() {
  if (!critic) return;
  scene.remove(critic.ch.root);
  critic = null;
  const b = document.getElementById('criticBubble');
  if (b) b.classList.remove('show');
}
export const criticState = () => critic && { i: critic.i, n: critic.order.length, room: roomAt(building.layout, critic.x, critic.z)?.name || '' };

const _v = new THREE.Vector3();
export function updateCritic(dt) {
  const c = critic;
  if (!c) return;
  const L = building.layout;
  const bubble = document.getElementById('criticBubble');
  if (c.state === 'plan') {
    const next = c.order[c.i];
    if (!next) { c.state = 'done'; const done = c.onDone; stopCritic(); done?.(); return; }
    const s = spot(next.w);
    const from = roomAt(L, c.x, c.z, 0.5) || L.rooms[0];
    const to = roomAt(L, s.x, s.z, 0.5) || from;
    const doors = roomPath(L, from.id, to.id) || [];
    c.path = [];
    let cur = from.id;
    for (const d of doors) { c.path.push(...doorWaypoints(L, d, cur)); cur = d.rooms[0] === cur ? d.rooms[1] : d.rooms[0]; }
    c.path.push({ x: s.x, z: s.z });
    c.target = s;
    c.state = 'walk';
  } else if (c.state === 'walk') {
    const wp = c.path[0];
    const dx = wp.x - c.x, dz = wp.z - c.z, d = Math.hypot(dx, dz);
    if (d < 0.25) { c.path.shift(); if (!c.path.length) { c.state = 'look'; c.timer = 2.6; const p = c.order[c.i]; c.said = pick(REACT[p.score > 0.85 ? 'good' : p.score > 0.6 ? 'mid' : 'bad']); } }
    else {
      const sp = 1.3;
      c.x += (dx / d) * sp * dt; c.z += (dz / d) * sp * dt;
      const pt = { x: c.x, z: c.z };
      collide(pt, 0.28, building.colliders);
      c.x = pt.x; c.z = pt.z;
      c.yaw = turn(c.yaw, Math.atan2(dx, dz), dt * 6);
    }
    c.ch.animate(dt, 1.3);
  } else if (c.state === 'look') {
    c.timer -= dt;
    c.yaw = turn(c.yaw, Math.atan2(c.target.tx - c.x, c.target.tz - c.z), dt * 4);
    c.ch.animate(dt, 0, 'look');
    if (c.timer <= 0) { c.i++; c.state = 'plan'; c.said = ''; }
  }
  c.ch.root.position.set(c.x, 0, c.z);
  c.ch.root.rotation.y = c.yaw;
  if (bubble) {
    _v.set(c.x, 2.2, c.z).project(camera);
    const show = c.said && _v.z < 1;
    bubble.classList.toggle('show', !!show);
    if (show) {
      bubble.textContent = c.said;
      bubble.style.left = ((_v.x + 1) / 2) * innerWidth + 'px';
      bubble.style.top = ((1 - _v.y) / 2) * innerHeight + 'px';
    }
  }
}
export const criticPos = () => critic && { x: critic.x, z: critic.z, yaw: critic.yaw };

function turn(a, b, max) {
  const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + clamp(d, -max, max);
}
