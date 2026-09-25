import { state, save, emit, clamp, newId } from '../state.js';
import { CENTERLINE } from '../config.js';
import { building } from '../world/building.js';
import { outerSize, labelCache } from '../art/works.js';
import { FURNITURE, footprint, fits, syncFurniture } from '../world/furniture.js';
import { guards } from '../actors/guards.js';
import { rig } from '../cameras.js';

// The 2D editor: the floor plan on the left, one wall seen straight on at the right.
// Drag furniture and floating walls on the plan; drag paintings on the wall, or up
// from storage. Everything writes straight into the same state the 3D museum uses.

const $ = id => document.getElementById(id);
const root = $('planner');
const plan = $('planCanvas'), elev = $('elevCanvas');
const pg = plan.getContext('2d'), eg = elev.getContext('2d');
let face = null;          // selected wall face id
let selWork = null;       // selected work id on that wall
let drag = null;
let raf = 0;

const INK = '#1f2023', GRAPH = '#5d5f66', HAIR = '#dcdcd6', ULTRA = '#2336c8', ALARM = '#b3261e';

export const plannerOpen = () => !root.hidden;
export function openPlanner() {
  root.hidden = false;
  if (!face || !building.faces.has(face)) face = [...building.faces.values()].sort((a, b) => b.len - a.len)[0]?.id || null;
  selWork = null;
  resize();
  renderStorage();
  loop();
}
export function closePlanner() {
  root.hidden = true;
  cancelAnimationFrame(raf);
}

function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  for (const c of [plan, elev]) {
    const r = c.getBoundingClientRect();
    c.width = Math.max(1, r.width * dpr); c.height = Math.max(1, r.height * dpr);
    c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
addEventListener('resize', () => { if (plannerOpen()) resize(); });

function loop() {
  drawPlan();
  drawElevation();
  raf = requestAnimationFrame(loop);
}

/* ---------------------------------------------------------------- plan view */
function planXform() {
  const r = plan.getBoundingClientRect(), B = building.layout.bounds, pad = 28;
  const s = Math.min((r.width - pad * 2) / (B.x1 - B.x0), (r.height - pad * 2) / (B.z1 - B.z0));
  const ox = (r.width - (B.x1 - B.x0) * s) / 2, oz = (r.height - (B.z1 - B.z0) * s) / 2;
  return {
    s,
    x: x => ox + (x - B.x0) * s, z: z => oz + (z - B.z0) * s,
    wx: px => B.x0 + (px - ox) / s, wz: py => B.z0 + (py - oz) / s,
  };
}

function drawPlan() {
  const L = building.layout;
  if (!L) return;
  const r = plan.getBoundingClientRect(), t = planXform(), g = pg;
  g.clearRect(0, 0, r.width, r.height);
  // Rooms
  for (const room of L.rooms) {
    g.fillStyle = '#f4f2ec';
    g.fillRect(t.x(room.x0), t.z(room.z0), (room.x1 - room.x0) * t.s, (room.z1 - room.z0) * t.s);
  }
  // Skylights
  g.fillStyle = 'rgba(120,160,200,.12)';
  for (const s of L.skylights) g.fillRect(t.x(s.x0), t.z(s.z0), (s.x1 - s.x0) * t.s, (s.z1 - s.z0) * t.s);
  // Rugs and pools under everything else
  for (const f of state.furniture) if (FURNITURE[f.type]?.flat || f.type === 'pool') drawPiece(g, t, f);
  // Walls
  for (const s of L.segments) {
    if (s.lintel || s.upper) continue;
    g.fillStyle = s.partition ? '#6d6a64' : INK;
    g.fillRect(t.x(s.x0), t.z(s.z0), Math.max(1, (s.x1 - s.x0) * t.s), Math.max(1, (s.z1 - s.z0) * t.s));
  }
  // Windows and the glass wall
  g.strokeStyle = '#7fb3d5'; g.lineWidth = 3;
  for (const w of [...L.windows, ...L.glassWalls]) {
    g.beginPath();
    if (w.o === 'h') { g.moveTo(t.x(w.a), t.z(w.c)); g.lineTo(t.x(w.b), t.z(w.c)); }
    else { g.moveTo(t.x(w.c), t.z(w.a)); g.lineTo(t.x(w.c), t.z(w.b)); }
    g.stroke();
  }
  // Works as marks along their walls; the selected wall is highlighted
  for (const f of building.faces.values()) {
    const sel = f.id === face;
    const hx = f.rx * f.len / 2, hz = f.rz * f.len / 2, off = 0.25;
    if (sel) {
      g.strokeStyle = ULTRA; g.lineWidth = 4;
      g.beginPath();
      g.moveTo(t.x(f.cx - hx + f.nx * off), t.z(f.cz - hz + f.nz * off));
      g.lineTo(t.x(f.cx + hx + f.nx * off), t.z(f.cz + hz + f.nz * off));
      g.stroke();
    }
  }
  for (const w of state.works) {
    const f = building.faces.get(w.faceId);
    if (!f) continue;
    const { W } = outerSize(w);
    const cx = f.cx + f.rx * w.u, cz = f.cz + f.rz * w.u, off = 0.12;
    g.strokeStyle = w.id === selWork ? ULTRA : '#c08a2c'; g.lineWidth = 5;
    g.beginPath();
    g.moveTo(t.x(cx - f.rx * W / 2 + f.nx * off), t.z(cz - f.rz * W / 2 + f.nz * off));
    g.lineTo(t.x(cx + f.rx * W / 2 + f.nx * off), t.z(cz + f.rz * W / 2 + f.nz * off));
    g.stroke();
  }
  // Furniture and sculpture
  for (const f of state.furniture) if (!(FURNITURE[f.type]?.flat || f.type === 'pool')) drawPiece(g, t, f);
  // Room names
  g.fillStyle = GRAPH; g.font = '12px "Instrument Sans", system-ui'; g.textAlign = 'center';
  for (const room of L.rooms) g.fillText(room.name, t.x(room.cx), t.z(room.z0) + 16);
  // Guards and you
  g.fillStyle = '#1d2230';
  for (const gd of guards) { g.beginPath(); g.arc(t.x(gd.x), t.z(gd.z), 4, 0, Math.PI * 2); g.fill(); }
  const p = rig.player, yaw = rig.mode === 'third' ? rig.third.yaw : p.yaw;
  g.save();
  g.translate(t.x(p.x), t.z(p.z));
  g.rotate(-yaw);
  g.fillStyle = ULTRA;
  g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill();
  g.restore();
}

function drawPiece(g, t, f) {
  const def = FURNITURE[f.type];
  if (!def) return;
  const bad = drag?.kind === 'piece' && drag.f === f && !drag.ok;
  g.save();
  g.translate(t.x(f.x), t.z(f.z));
  g.rotate(-f.rot);
  g.fillStyle = bad ? 'rgba(179,38,30,.35)' : def.cat === 'sculpture' ? '#d9d2c3' : def.flat ? 'rgba(138,59,47,.25)' : f.type === 'pool' ? '#9fb8c4' : '#cdbfa8';
  g.strokeStyle = bad ? ALARM : GRAPH; g.lineWidth = 1;
  const w = def.w * t.s, d = def.d * t.s;
  if (f.type === 'roundRug') { g.beginPath(); g.arc(0, 0, w / 2, 0, Math.PI * 2); g.fill(); g.stroke(); }
  else { g.fillRect(-w / 2, -d / 2, w, d); g.strokeRect(-w / 2, -d / 2, w, d); }
  g.restore();
}

// Distance from a point to a wall face's line, in meters
function faceAt(x, z) {
  let best = null, bd = 0.6;
  for (const f of building.faces.values()) {
    const dx = x - f.cx, dz = z - f.cz;
    const along = dx * f.rx + dz * f.rz, out = dx * f.nx + dz * f.nz;
    if (Math.abs(along) > f.len / 2 || out < -0.05 || out > bd) continue;
    bd = out; best = f;
  }
  return best;
}
function pieceAt(x, z) {
  // Topmost first: solid pieces over rugs
  const list = [...state.furniture].sort((a, b) => !!FURNITURE[a.type]?.flat - !!FURNITURE[b.type]?.flat);
  return list.find(f => { const b = footprint(f); return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1; }) || null;
}
function partitionAt(x, z) {
  return state.partitions.find(p => {
    const hx = p.alongZ ? 0.3 : p.len / 2, hz = p.alongZ ? p.len / 2 : 0.3;
    return Math.abs(x - p.x) <= hx && Math.abs(z - p.z) <= hz;
  }) || null;
}

plan.addEventListener('pointerdown', e => {
  const r = plan.getBoundingClientRect(), t = planXform();
  const x = t.wx(e.clientX - r.left), z = t.wz(e.clientY - r.top);
  const piece = pieceAt(x, z), part = !piece && partitionAt(x, z);
  if (piece) drag = { kind: 'piece', f: piece, dx: x - piece.x, dz: z - piece.z, x0: piece.x, z0: piece.z, ok: true };
  else if (part) drag = { kind: 'partition', p: part, dx: x - part.x, dz: z - part.z, x0: part.x, z0: part.z };
  else {
    const f = faceAt(x, z);
    if (f) { face = f.id; selWork = null; pan = 0; }
    return;
  }
  plan.setPointerCapture(e.pointerId);
});
plan.addEventListener('pointermove', e => {
  if (!drag) return;
  const r = plan.getBoundingClientRect(), t = planXform();
  const x = Math.round((t.wx(e.clientX - r.left) - drag.dx) * 10) / 10, z = Math.round((t.wz(e.clientY - r.top) - drag.dz) * 10) / 10;
  if (drag.kind === 'piece') { drag.f.x = x; drag.f.z = z; drag.ok = fits(drag.f, drag.f.id); }
  else { drag.p.x = x; drag.p.z = z; }
});
plan.addEventListener('pointerup', () => {
  if (!drag) return;
  if (drag.kind === 'piece') {
    if (!drag.ok) { drag.f.x = drag.x0; drag.f.z = drag.z0; emit('toast', 'That spot is blocked. The piece went back.'); }
    syncFurniture();
  } else if (drag.p.x !== drag.x0 || drag.p.z !== drag.z0) {
    const { p } = drag;
    const ok = fits({ type: 'wall', x: p.x, z: p.z, rot: p.alongZ ? Math.PI / 2 : 0 }, p.id);
    if (!ok) { p.x = drag.x0; p.z = drag.z0; emit('toast', 'The wall doesn\'t fit there. It went back.'); }
    else emit('rebuild');
  }
  drag = null;
  save();
});
plan.addEventListener('dblclick', e => {
  const r = plan.getBoundingClientRect(), t = planXform();
  const x = t.wx(e.clientX - r.left), z = t.wz(e.clientY - r.top);
  if (!building.layout.rooms.some(rm => x > rm.x0 + 0.4 && x < rm.x1 - 0.4 && z > rm.z0 + 0.4 && z < rm.z1 - 0.4)) return;
  rig.player.x = x; rig.player.z = z;
  emit('toast', 'You\'re there. Close the plan to look around.');
});
plan.addEventListener('wheel', e => {
  // Turn the piece under the cursor
  const r = plan.getBoundingClientRect(), t = planXform();
  const f = pieceAt(t.wx(e.clientX - r.left), t.wz(e.clientY - r.top));
  if (!f) return;
  e.preventDefault();
  const turned = { ...f, rot: (f.rot + Math.sign(e.deltaY) * Math.PI / 4 + Math.PI * 2) % (Math.PI * 2) };
  if (fits(turned, f.id)) { f.rot = turned.rot; syncFurniture(); save(); }
}, { passive: false });

/* ---------------------------------------------------------------- wall view */
const imgs = new Map();
function img(w) {
  const src = w.thumb || w.src;
  if (!imgs.has(src)) { const i = new Image(); i.crossOrigin = 'anonymous'; i.src = src; imgs.set(src, i); }
  return imgs.get(src);
}

// At most about 7 m of wall shows at once; longer walls scroll sideways
let pan = 0;
const VIEW = 7;
function elevXform(f) {
  const r = elev.getBoundingClientRect(), pad = 30, top = f.maxY ?? building.layout.h;
  const s = Math.min((r.width - pad * 2) / Math.min(f.len, VIEW), (r.height - pad * 2) / top);
  const half = (r.width / 2) / s;
  pan = f.len / 2 > half ? clamp(pan, -f.len / 2 + half - 0.3, f.len / 2 - half + 0.3) : 0;
  const cx = r.width / 2, base = r.height - (r.height - top * s) / 2;
  return { s, top, x: u => cx + (u - pan) * s, y: v => base - v * s, u: px => (px - cx) / s + pan, v: py => (base - py) / s };
}
elev.addEventListener('wheel', e => { e.preventDefault(); const f = building.faces.get(face); if (f) pan += (e.deltaX || e.deltaY) / elevXform(f).s; }, { passive: false });

function drawElevation() {
  const r = elev.getBoundingClientRect(), g = eg;
  g.clearRect(0, 0, r.width, r.height);
  const f = face && building.faces.get(face);
  $('wallName').textContent = f ? `${building.layout.roomById[f.room]?.name || 'Floating wall'}, ${f.partition ? 'side ' + f.edge : { N: 'north', S: 'south', E: 'east', W: 'west' }[f.edge] + ' wall'}, ${f.len.toFixed(1)} m` : 'Click a wall on the plan';
  if (!f) return;
  const t = elevXform(f);
  g.fillStyle = state.wallColor;
  g.fillRect(t.x(-f.len / 2), t.y(t.top), f.len * t.s, t.top * t.s);
  g.strokeStyle = HAIR; g.strokeRect(t.x(-f.len / 2), t.y(t.top), f.len * t.s, t.top * t.s);
  // Eye level
  g.setLineDash([6, 6]); g.strokeStyle = 'rgba(35,54,200,.5)';
  g.beginPath(); g.moveTo(t.x(-f.len / 2), t.y(CENTERLINE)); g.lineTo(t.x(f.len / 2), t.y(CENTERLINE)); g.stroke();
  g.setLineDash([]);
  g.fillStyle = GRAPH; g.font = '11px "Instrument Sans", system-ui'; g.textAlign = 'left';
  g.fillText('eye level', t.x(-f.len / 2) + 4, t.y(CENTERLINE) - 4);
  // Works at true size
  const list = state.works.filter(w => w.faceId === face);
  if (drag?.kind === 'storage' && drag.over) list.push(drag.w);
  for (const w of list) {
    const { W, H } = outerSize(w);
    const x = t.x(w.u - W / 2), y = t.y(w.v + H / 2);
    const bad = drag?.w === w && !drag.ok;
    g.fillStyle = state.frame === 'gold' ? '#c29a48' : state.frame === 'oak' ? '#a07448' : '#141414';
    g.fillRect(x, y, W * t.s, H * t.s);
    const i = img(w), b = Math.max(1, 0.05 * t.s);
    if (i.complete && i.naturalWidth) g.drawImage(i, x + b, y + b, W * t.s - b * 2, H * t.s - b * 2);
    if (bad || w.id === selWork) { g.strokeStyle = bad ? ALARM : ULTRA; g.lineWidth = 3; g.strokeRect(x - 2, y - 2, W * t.s + 4, H * t.s + 4); g.lineWidth = 1; }
  }
  const sel = state.works.find(w => w.id === selWork);
  $('wallSel').textContent = sel ? `${sel.artist}, ${sel.title}` : list.length ? 'Drag a work to move it. Click one to select it.' : 'Drag a work up from storage to hang it here.';
  $('takeDownSel').hidden = !sel;
}

function workAt(px, py) {
  const f = building.faces.get(face);
  if (!f) return null;
  const t = elevXform(f);
  return state.works.filter(w => w.faceId === face).reverse().find(w => {
    const { W, H } = outerSize(w);
    return px >= t.x(w.u - W / 2) && px <= t.x(w.u + W / 2) && py >= t.y(w.v + H / 2) && py <= t.y(w.v - H / 2);
  }) || null;
}

function overlaps(w, faceId) {
  const s = outerSize(w);
  return state.works.some(o => o !== w && o.id !== w.id && o.faceId === faceId && Math.abs(o.u - w.u) < (s.W + outerSize(o).W) / 2 + 0.12 && Math.abs(o.v - w.v) < (s.H + outerSize(o).H) / 2 + 0.12);
}

// Keep a work on the wall and snap it to eye level when it's close
function place(w, f, u, v, free) {
  const { W, H } = outerSize(w), t = f.maxY ?? building.layout.h;
  const maxU = Math.max(0, f.len / 2 - W / 2 - 0.1);
  w.u = clamp(u, -maxU, maxU);
  const snapV = Math.max(CENTERLINE, H / 2 + 0.35);
  w.v = clamp(!free && Math.abs(v - snapV) < 0.12 ? snapV : v, H / 2 + 0.1, Math.max(H / 2 + 0.1, t - H / 2 - 0.15));
  return W <= f.len - 0.2 && H <= t - 0.25 && !overlaps(w, f.id);
}

elev.addEventListener('pointerdown', e => {
  const r = elev.getBoundingClientRect();
  const w = workAt(e.clientX - r.left, e.clientY - r.top);
  selWork = w?.id || null;
  if (!w) { drag = { kind: 'pan', x: e.clientX }; elev.setPointerCapture(e.pointerId); return; }
  const t = elevXform(building.faces.get(face));
  drag = { kind: 'work', w, du: t.u(e.clientX - r.left) - w.u, dv: t.v(e.clientY - r.top) - w.v, u0: w.u, v0: w.v, ok: true };
  elev.setPointerCapture(e.pointerId);
});
elev.addEventListener('pointermove', e => {
  if (drag?.kind === 'pan') { const f = building.faces.get(face); if (f) pan -= (e.clientX - drag.x) / elevXform(f).s; drag.x = e.clientX; return; }
  if (drag?.kind !== 'work') return;
  const r = elev.getBoundingClientRect(), f = building.faces.get(face), t = elevXform(f);
  drag.ok = place(drag.w, f, t.u(e.clientX - r.left) - drag.du, t.v(e.clientY - r.top) - drag.dv, e.shiftKey);
});
elev.addEventListener('pointerup', () => {
  if (drag?.kind === 'pan') { drag = null; return; }
  if (drag?.kind !== 'work') return;
  if (!drag.ok) { drag.w.u = drag.u0; drag.w.v = drag.v0; emit('toast', 'That overlaps another work. It went back.'); }
  drag = null;
  changed();
});

function changed() {
  save();
  emit('frames');
  emit('works-changed');
  renderStorage();
}

// Even gaps between the works on this wall, all at eye level
$('spaceEvenly').addEventListener('click', () => {
  const f = building.faces.get(face);
  if (!f) return;
  const list = state.works.filter(w => w.faceId === face).sort((a, b) => a.u - b.u);
  if (!list.length) return;
  const widths = list.map(w => outerSize(w).W), sum = widths.reduce((a, b) => a + b, 0);
  const room = f.len - 1.2, n = list.length;
  if (sum > room) { emit('toast', 'Too many works to space out on this wall.'); return; }
  const gap = n > 1 ? Math.min(2.4, (room - sum) / (n - 1 + 1.4)) : 0;
  let x = -(sum + gap * (n - 1)) / 2;
  const top = f.maxY ?? building.layout.h;
  list.forEach((w, i) => {
    const { H } = outerSize(w);
    w.u = x + widths[i] / 2;
    w.v = Math.min(Math.max(CENTERLINE, H / 2 + 0.35), top - H / 2 - 0.2);
    x += widths[i] + gap;
  });
  changed();
});
$('clearWall').addEventListener('click', () => {
  const list = state.works.filter(w => w.faceId === face);
  if (!list.length) return;
  for (const { faceId, u, v, id, ...rest } of list) state.storage.push(rest);
  state.works = state.works.filter(w => w.faceId !== face);
  selWork = null;
  changed();
});
$('takeDownSel').addEventListener('click', () => {
  const w = state.works.find(x => x.id === selWork);
  if (!w) return;
  const { faceId, u, v, id, ...rest } = w;
  state.storage.push(rest);
  state.works = state.works.filter(x => x.id !== selWork);
  labelCache.delete(selWork);
  selWork = null;
  changed();
});

/* ---------------------------------------------------------------- storage strip */
function renderStorage() {
  $('planStorage').innerHTML = state.storage.length
    ? state.storage.map((w, i) => `<img data-i="${i}" src="${(w.thumb || w.src).replace(/"/g, '&quot;')}" alt="${String(w.title).replace(/"/g, '&quot;')}" title="${String(w.title).replace(/"/g, '&quot;')}" draggable="false">`).join('')
    : '<span class="hint">Storage is empty. Works you take down wait here.</span>';
}
$('planStorage').addEventListener('pointerdown', e => {
  const i = e.target.dataset?.i;
  if (i === undefined) return;
  e.preventDefault();
  drag = { kind: 'storage', i: +i, w: { ...state.storage[+i], id: 'drag', faceId: face, u: 0, v: CENTERLINE }, ok: false, over: false };
});
addEventListener('pointermove', e => {
  if (drag?.kind !== 'storage') return;
  const r = elev.getBoundingClientRect(), f = building.faces.get(face);
  drag.over = f && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (!drag.over) return;
  const t = elevXform(f);
  drag.ok = place(drag.w, f, t.u(e.clientX - r.left), t.v(e.clientY - r.top), e.shiftKey);
});
addEventListener('pointerup', () => {
  if (drag?.kind !== 'storage') return;
  const d = drag;
  drag = null;
  if (!d.over) return;
  if (!d.ok) { emit('toast', 'That spot overlaps another work or the wall is too small.'); return; }
  state.storage.splice(d.i, 1);
  state.works.push({ ...d.w, id: newId(), faceId: face });
  changed();
});

$('closePlanner').addEventListener('click', () => emit('close-planner'));
