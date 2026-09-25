import * as THREE from 'three';
import { camera, scene } from './engine.js';
import { state, save, emit, newId, clamp } from './state.js';
import { CENTERLINE } from './config.js';
import { building, placeOnFace } from './world/building.js';
import { makeWorkGroup, disposeGroup, outerSize, syncWorks, workHitTargets, labelCache } from './art/works.js';
import { FURNITURE, makeFurniture, fits, syncFurniture, furnitureHitTargets } from './world/furniture.js';

export const cur = { held: null, ghost: null, free: false, aim: null, placing: null };
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
  if (cur.placing === 'spot') {
    const hit = raycaster.intersectObjects([...building.wallMeshes, ...building.floorMeshes, ...workHitTargets()], false)[0];
    if (hit) next = { type: 'spot', point: hit.point.clone(), ok: true, id: hit.point.toArray().map(v => v.toFixed(1)).join() };
    spotMarker.visible = !!hit;
    if (hit) spotMarker.position.copy(hit.point).addScaledVector(hit.face.normal, 0.02);
  } else if (cur.placing === 'furniture') {
    aimFurniture();
    next = cur.furn.aim;
  } else if (cur.held) {
    const hit = raycaster.intersectObjects(building.wallMeshes, false)[0];
    const faceId = hit && faceFromHit(hit);
    const f = faceId && building.faces.get(faceId);
    if (f) {
      const { W, H } = outerSize(cur.held);
      const maxU = Math.max(0, f.len / 2 - W / 2 - 0.1);
      const u = clamp(hit.point.clone().sub(f.center).dot(f.right), -maxU, maxU);
      const h = f.maxY ?? building.layout.h;
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
    const hit = raycaster.intersectObjects([...building.wallMeshes, ...workHitTargets(), ...furnitureHitTargets()], false)[0];
    if (hit && hit.object.userData.workId && hit.distance < 10) next = { type: 'work', id: hit.object.userData.workId };
    else if (hit && hit.object.userData.furnitureId && hit.distance < 10) next = { type: 'furniture', id: hit.object.userData.furnitureId };
    else if (hit && hit.object.userData.seg?.partition && hit.distance < 12) next = { type: 'partition', id: hit.object.userData.seg.partition };
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
  if (cur.placing === 'furniture') {
    const a = cur.furn.aim;
    items.push(a ? { act: 'place', key: 'Click', label: a.ok ? `Place the ${FURNITURE[cur.furn.type].label.toLowerCase()}` : 'Blocked here' } : { note: 'Aim at the floor' });
    items.push({ act: 'rotate', key: 'R', label: 'Turn' });
    items.push({ act: 'cancel', key: 'Q', label: cur.furn.origin ? 'Put it back' : 'Never mind' });
  } else if (cur.placing === 'spot') {
    items.push(aim ? { act: 'place', key: 'Click', label: 'Point a spotlight here' } : { note: 'Aim at a wall, a work or the floor' });
    items.push({ act: 'cancel', key: 'Q', label: 'Stop' });
  } else if (held) {
    if (aim?.type === 'wall') items.push({ act: 'hang', key: 'Click', label: aim.ok ? 'Hang here' : 'Doesn\'t fit here' });
    else items.push({ note: 'Face a wall to hang the work' });
    items.push({ act: 'free', key: 'V', label: cur.free ? 'Snap to eye level' : 'Hang at any height' });
    items.push({ act: 'cancel', key: 'Q', label: held.origin ? 'Put it back' : 'Never mind' });
  } else if (aim?.type === 'work') {
    const w = state.works.find(x => x.id === aim.id);
    if (w) items.push({ note: `${w.artist || 'Unknown artist'}, ${w.title}` });
    items.push({ act: 'pickup', key: 'E', label: 'Move' });
    items.push({ act: 'remove', key: 'X', label: 'Take down', warn: true });
  } else if (aim?.type === 'partition') {
    items.push({ note: 'Floating wall' });
    items.push({ act: 'pickup', key: 'E', label: 'Move' });
    items.push({ act: 'rotate', key: 'R', label: 'Turn' });
    items.push({ act: 'remove', key: 'X', label: 'Remove', warn: true });
  } else if (aim?.type === 'furniture') {
    const f = state.furniture.find(x => x.id === aim.id);
    if (f) items.push({ note: FURNITURE[f.type].label });
    items.push({ act: 'pickup', key: 'E', label: 'Move' });
    items.push({ act: 'rotate', key: 'R', label: 'Turn' });
    items.push({ act: 'remove', key: 'X', label: 'Remove', warn: true });
  }
  el.innerHTML = items.map(i => i.note
    ? `<span class="note">${esc(i.note)}</span>`
    : `<button data-act="${i.act}" class="${i.warn ? 'warn' : ''}"><kbd>${i.key}</kbd>${esc(i.label)}</button>`).join('');
}

export function doAction(act) {
  const { aim } = cur;
  if (cur.placing === 'spot') { if (act === 'place') placeSpot(); else if (act === 'cancel') stopPlacing(); return; }
  if (cur.placing === 'furniture') { if (act === 'place') placeFurniture(); else if (act === 'cancel') cancelFurniture(); else if (act === 'rotate') rotateFurniture(); return; }
  if (aim?.type === 'partition') {
    const p = state.partitions.find(x => x.id === aim.id);
    if (!p) return;
    if (act === 'pickup') startFurniture('wall', { id: p.id, rot: p.alongZ ? Math.PI / 2 : 0, partition: true });
    else if (act === 'rotate') rotateFurniture();
    else if (act === 'remove') { state.partitions = state.partitions.filter(x => x.id !== p.id); save(); emit('rebuild'); }
    return;
  }
  if (aim?.type === 'furniture') {
    if (act === 'pickup') pickUpFurniture(aim.id);
    else if (act === 'remove') removeFurniture(aim.id);
    else if (act === 'rotate') rotateFurniture();
    return;
  }
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

/* ---------------------------------------------------------------- spotlights */
const spotMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.12, 0.18, 32),
  new THREE.MeshBasicMaterial({ color: 0xffd28a, side: THREE.DoubleSide, depthTest: false, transparent: true }),
);
spotMarker.renderOrder = 10;
spotMarker.visible = false;
scene.add(spotMarker);

export function startPlacing(kind) {
  if (cur.held) cancelHeld();
  if (cur.placing === 'furniture') cancelFurniture();
  cur.placing = kind;
  renderActions();
}
export function stopPlacing() {
  cur.placing = null;
  spotMarker.visible = false;
  renderActions();
}

// Hang the spotlight from the ceiling a couple of meters back toward you, aimed at the spot
export function placeSpot() {
  const p = cur.aim?.type === 'spot' && cur.aim.point;
  if (!p) return;
  const h = building.layout.h;
  let dx = camera.position.x - p.x, dz = camera.position.z - p.z;
  const d = Math.hypot(dx, dz) || 1;
  const back = Math.min(2.5, d);
  dx /= d; dz /= d;
  state.lighting.spots.push({
    id: newId(),
    x: p.x + dx * back, y: h - 0.4, z: p.z + dz * back,
    tx: p.x, ty: p.y, tz: p.z, angle: 0.32, power: 1,
  });
  save();
  emit('spots');
  emit('toast', 'Spotlight added. Remove it from the Light tab.');
  stopPlacing();
}

/* ---------------------------------------------------------------- furniture */
// cur.furn = { type, rot, origin, ghost, aim } while carrying a piece
export function startFurniture(type, origin = null) {
  if (cur.held) cancelHeld();
  if (cur.placing === 'furniture') cancelFurniture();
  const ghost = makeFurniture(type, true);
  ghost.visible = false;
  scene.add(ghost);
  cur.placing = 'furniture';
  cur.furn = { type, rot: origin?.rot ?? 0, origin, ghost, aim: null };
  renderActions();
}

function aimFurniture() {
  const f = cur.furn;
  const hit = raycaster.intersectObjects(building.floorMeshes, false)[0];
  if (!hit || hit.distance > 14) { f.ghost.visible = false; f.aim = null; return; }
  const p = { type: f.type, x: hit.point.x, z: hit.point.z, rot: f.rot };
  const ok = fits(p, f.origin?.id);
  f.ghost.visible = true;
  f.ghost.position.set(p.x, 0, p.z);
  f.ghost.rotation.y = f.rot;
  f.ghost.traverse(o => { if (o.isMesh && o.material.emissive) o.material.emissive.set(ok ? 0x000000 : 0x8a1c14); });
  f.aim = { type: 'furniture-place', id: `${p.x.toFixed(1)},${p.z.toFixed(1)},${f.rot}`, ok, x: p.x, z: p.z };
}

function dropGhost() {
  const f = cur.furn;
  if (!f) return;
  scene.remove(f.ghost);
  f.ghost.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  cur.furn = null;
  cur.placing = null;
}

export function placeFurniture() {
  const f = cur.furn, a = f?.aim;
  if (!a) return;
  if (!a.ok) { emit('toast', 'That spot is blocked by a wall, a doorway or another piece. Try somewhere else.'); return; }
  if (FURNITURE[f.type].partition) {
    const alongZ = Math.round(f.rot / (Math.PI / 2)) % 2 === 1;
    const existing = f.origin && state.partitions.find(p => p.id === f.origin.id);
    if (existing) Object.assign(existing, { x: a.x, z: a.z, alongZ });
    else state.partitions.push({ id: 'p' + newId().slice(0, 8), x: a.x, z: a.z, len: FURNITURE[f.type].w, alongZ });
    dropGhost();
    save();
    emit('rebuild');
    renderActions();
    return;
  }
  state.furniture.push({ id: f.origin?.id || newId(), type: f.type, x: a.x, z: a.z, rot: f.rot });
  dropGhost();
  syncFurniture();
  save();
  renderActions();
}

export function cancelFurniture() {
  const f = cur.furn;
  if (!f) return;
  if (f.origin && !f.origin.partition) state.furniture.push(f.origin);
  dropGhost();
  syncFurniture();
  save();
  renderActions();
}

export function rotateFurniture(step = Math.PI / 4) {
  if (cur.furn) { cur.furn.rot = (cur.furn.rot + (FURNITURE[cur.furn.type].partition ? Math.PI / 2 : step)) % (Math.PI * 2); return; }
  if (cur.aim?.type === 'partition') {
    const p = state.partitions.find(x => x.id === cur.aim.id);
    if (!p) return;
    const turned = { type: 'wall', x: p.x, z: p.z, rot: p.alongZ ? 0 : Math.PI / 2 };
    if (!fits(turned, p.id)) { emit('toast', 'No room to turn the wall here.'); return; }
    p.alongZ = !p.alongZ;
    save();
    emit('rebuild');
    return;
  }
  const f = cur.aim?.type === 'furniture' && state.furniture.find(x => x.id === cur.aim.id);
  if (!f) return;
  const turned = { ...f, rot: (f.rot + step) % (Math.PI * 2) };
  if (!fits(turned, f.id)) { emit('toast', 'No room to turn it here.'); return; }
  f.rot = turned.rot;
  syncFurniture();
  save();
}

function pickUpFurniture(id) {
  const f = state.furniture.find(x => x.id === id);
  if (!f) return;
  state.furniture = state.furniture.filter(x => x.id !== id);
  syncFurniture();
  startFurniture(f.type, f);
}

function removeFurniture(id) {
  const f = state.furniture.find(x => x.id === id);
  if (!f) return;
  state.furniture = state.furniture.filter(x => x.id !== id);
  syncFurniture();
  save();
  emit('toast', `Removed the ${FURNITURE[f.type].label.toLowerCase()}.`);
}
