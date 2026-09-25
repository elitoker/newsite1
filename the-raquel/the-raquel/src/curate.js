import * as THREE from 'three';
import { camera, scene } from './engine.js';
import { state, save, emit, newId, clamp } from './state.js';
import { CENTERLINE } from './config.js';
import { building, placeOnFace } from './world/building.js';
import { makeWorkGroup, disposeGroup, outerSize, syncWorks, workHitTargets, labelCache } from './art/works.js';

export const cur = { held: null, ghost: null, free: false, aim: null };
const raycaster = new THREE.Raycaster();
raycaster.far = 60;
const CENTER = new THREE.Vector2(0, 0);

// A held work is { ...work, origin } where origin says where to return it on cancel
export function setHeld(w) {
  clearGhost();
  cur.held = w;
  if (w) {
    cur.ghost = makeWorkGroup(w, true);
    cur.ghost.group.visible = false;
    scene.add(cur.ghost.group);
  }
  renderActions();
}
function clearGhost() {
  if (!cur.ghost) return;
  disposeGroup(cur.ghost.group);
  scene.remove(cur.ghost.group);
  cur.ghost = null;
}
export function refreshGhost() { if (cur.held) setHeld(cur.held); }

function overlaps(faceId, u, v, W, H) {
  const gap = 0.12;
  return state.works.some(o => {
    if (o.faceId !== faceId) return false;
    const s = outerSize(o);
    return Math.abs(o.u - u) < (W + s.W) / 2 + gap && Math.abs(o.v - v) < (H + s.H) / 2 + gap;
  });
}

// Which hangable face did the ray hit? Walls are axis-aligned boxes, so the hit normal tells us.
function faceFromHit(hit) {
  const s = hit.object.userData.seg;
  if (!s || !hit.face) return null;
  const n = hit.face.normal;
  if (s.o === 'h') return n.z > 0.5 ? s.faces.pos : n.z < -0.5 ? s.faces.neg : null;
  return n.x > 0.5 ? s.faces.pos : n.x < -0.5 ? s.faces.neg : null;
}

export function updateAim() {
  raycaster.setFromCamera(CENTER, camera);
  let next = null;
  if (cur.held) {
    const hit = raycaster.intersectObjects(building.wallMeshes, false)[0];
    const faceId = hit && faceFromHit(hit);
    const f = faceId && building.faces.get(faceId);
    if (f) {
      const { W, H } = outerSize(cur.held);
      const maxU = Math.max(0, f.len / 2 - W / 2 - 0.1);
      const u = clamp(hit.point.clone().sub(f.center).dot(f.right), -maxU, maxU);
      const h = building.layout.h;
      let v = cur.free ? hit.point.y : Math.max(CENTERLINE, H / 2 + 0.35);
      v = clamp(v, H / 2 + 0.1, Math.max(H / 2 + 0.1, h - H / 2 - 0.15));
      const fits = W <= f.len - 0.2 && H <= h - 0.25;
      next = { type: 'wall', faceId, u, v, ok: fits && !overlaps(faceId, u, v, W, H) };
      placeOnFace(cur.ghost.group, f, u, v, 0);
      cur.ghost.group.visible = true;
      cur.ghost.frameMat.color.set(next.ok ? 0xffffff : 0xd0342c);
      cur.ghost.frameMat.opacity = next.ok ? 0.35 : 0.6;
    } else if (cur.ghost) cur.ghost.group.visible = false;
  } else {
    const hit = raycaster.intersectObjects([...building.wallMeshes, ...workHitTargets()], false)[0];
    if (hit && hit.object.userData.workId && hit.distance < 10) next = { type: 'work', id: hit.object.userData.workId };
  }
  const key = a => (a ? `${a.type}|${a.id}|${a.ok}` : '');
  const changed = key(next) !== key(cur.aim);
  cur.aim = next;
  if (changed) renderActions();
}

function changed() {
  syncWorks();
  save();
  emit('works-changed');
}

export function hang() {
  const { held, aim } = cur;
  if (!held || !aim || aim.type !== 'wall') return;
  if (!aim.ok) { emit('toast', 'That spot overlaps another work or the wall is too small. Try somewhere else.'); return; }
  const { origin, ...w } = held;
  const work = { ...w, id: origin?.id || newId(), faceId: aim.faceId, u: aim.u, v: aim.v };
  state.works.push(work);
  labelCache.delete(work.id);
  setHeld(null);
  changed();
  emit('toast', `Hung "${work.title}".`);
}

export function cancelHeld() {
  const w = cur.held;
  if (!w) return;
  const { origin, ...rest } = w;
  if (origin?.faceId) state.works.push({ ...rest, id: origin.id, faceId: origin.faceId, u: origin.u, v: origin.v });
  else if (origin?.storage) state.storage.push(rest);
  setHeld(null);
  changed();
}

export function pickUp(id) {
  const w = state.works.find(x => x.id === id);
  if (!w) return;
  if (cur.held) cancelHeld();
  state.works = state.works.filter(x => x.id !== id);
  const { faceId, u, v, id: _, ...rest } = w;
  changed();
  setHeld({ ...rest, origin: { id, faceId, u, v } });
}

export function takeDown(id) {
  const w = state.works.find(x => x.id === id);
  if (!w) return;
  state.works = state.works.filter(x => x.id !== id);
  const { faceId, u, v, id: _, ...rest } = w;
  state.storage.push(rest);
  labelCache.delete(id);
  changed();
  emit('toast', `"${w.title}" went to storage.`);
}

export function holdFromStorage(i) {
  const [w] = state.storage.splice(i, 1);
  if (!w) return;
  if (cur.held) cancelHeld();
  save();
  emit('works-changed');
  setHeld({ ...w, origin: { storage: true } });
}

export function toggleFree() { cur.free = !cur.free; renderActions(); }

/* ---------------------------------------------------------------- action bar */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function renderActions() {
  const el = document.getElementById('actions');
  const items = [];
  const { held, aim } = cur;
  if (held) {
    if (aim?.type === 'wall') items.push({ act: 'hang', key: 'Click', label: aim.ok ? 'Hang here' : 'Doesn\'t fit here' });
    else items.push({ note: 'Face a wall to hang the work' });
    items.push({ act: 'free', key: 'V', label: cur.free ? 'Snap to eye level' : 'Hang at any height' });
    items.push({ act: 'cancel', key: 'Q', label: held.origin ? 'Put it back' : 'Never mind' });
  } else if (aim?.type === 'work') {
    const w = state.works.find(x => x.id === aim.id);
    if (w) items.push({ note: `${w.artist || 'Unknown artist'}, ${w.title}` });
    items.push({ act: 'pickup', key: 'E', label: 'Move' });
    items.push({ act: 'remove', key: 'X', label: 'Take down', warn: true });
  }
  el.innerHTML = items.map(i => i.note
    ? `<span class="note">${esc(i.note)}</span>`
    : `<button data-act="${i.act}" class="${i.warn ? 'warn' : ''}"><kbd>${i.key}</kbd>${esc(i.label)}</button>`).join('');
}

export function doAction(act) {
  const { aim } = cur;
  if (act === 'hang') hang();
  else if (act === 'cancel') cancelHeld();
  else if (act === 'free') toggleFree();
  else if (act === 'pickup' && aim?.type === 'work') pickUp(aim.id);
  else if (act === 'remove' && aim?.type === 'work') takeDown(aim.id);
}
document.getElementById('actions').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) doAction(b.dataset.act);
});
