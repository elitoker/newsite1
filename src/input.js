import { isTouch } from './config.js';

export const input = {
  keys: {}, lookDX: 0, lookDY: 0, wheel: 0,
  joy: { x: 0, y: 0 }, rise: 0, dragging: false, lookActive: false,
};
const handlers = { key: [], click: [], tap: [] };
export const onInput = (evt, fn) => handlers[evt].push(fn);
const fire = (evt, ...a) => handlers[evt].forEach(f => f(...a));

let canvas = null;
export function consumeLook() {
  const out = [input.lookDX, input.lookDY, input.wheel];
  input.lookDX = input.lookDY = input.wheel = 0;
  return out;
}

export function initInput(el) {
  canvas = el;
  const typing = e => e.target.matches?.('input, textarea, select');

  document.addEventListener('keydown', e => {
    if (typing(e)) return;
    if (e.code === 'Tab' && e.target.closest?.('#panel')) return;
    input.keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    if (!e.repeat) fire('key', e.code);
  });
  document.addEventListener('keyup', e => { input.keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in input.keys) input.keys[k] = false; });

  // Mouse: hold the button and drag to look. A click without dragging acts.
  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved < 4) return;
    input.dragging = true;
    input.lookDX += dx * 0.004;
    input.lookDY += dy * 0.004;
  });
  const dragEnd = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const clicked = e.type === 'pointerup' && drag.moved < 4;
    drag = null; input.dragging = false;
    if (clicked) fire('click');
  };
  canvas.addEventListener('pointerup', dragEnd);
  canvas.addEventListener('pointercancel', dragEnd);
  canvas.addEventListener('wheel', e => { input.wheel += e.deltaY; e.preventDefault(); }, { passive: false });

  // Touch: joystick on the left, drag anywhere else to look, tap to act
  const joyEl = document.getElementById('joy'), knob = joyEl.querySelector('.knob');
  let joyId = null;
  const joyMove = e => {
    const r = joyEl.getBoundingClientRect();
    let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2);
    let dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    input.joy.x = dx; input.joy.y = -dy;
    knob.style.transform = `translate(${dx * 36}px, ${dy * 36}px)`;
  };
  const joyEnd = e => {
    if (e.pointerId !== joyId) return;
    joyId = null; input.joy.x = input.joy.y = 0; knob.style.transform = '';
  };
  joyEl.addEventListener('pointerdown', e => { joyId = e.pointerId; joyEl.setPointerCapture(e.pointerId); joyMove(e); });
  joyEl.addEventListener('pointermove', e => { if (e.pointerId === joyId) joyMove(e); });
  joyEl.addEventListener('pointerup', joyEnd);
  joyEl.addEventListener('pointercancel', joyEnd);

  const looks = new Map();
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    looks.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    input.lookActive = true;
  });
  canvas.addEventListener('pointermove', e => {
    const l = looks.get(e.pointerId);
    if (!l) return;
    input.lookDX += (e.clientX - l.x) * 0.005;
    input.lookDY += (e.clientY - l.y) * 0.005;
    l.x = e.clientX; l.y = e.clientY;
  });
  const lookEnd = e => {
    const l = looks.get(e.pointerId);
    if (!l) return;
    looks.delete(e.pointerId);
    input.lookActive = looks.size > 0;
    if (Math.hypot(e.clientX - l.sx, e.clientY - l.sy) < 10 && performance.now() - l.t < 300) fire('tap');
  };
  canvas.addEventListener('pointerup', lookEnd);
  canvas.addEventListener('pointercancel', e => { looks.delete(e.pointerId); input.lookActive = looks.size > 0; });

  // Drone up and down buttons on touch
  for (const [id, dir] of [['rise', 1], ['fall', -1]]) {
    const b = document.getElementById(id);
    b.addEventListener('pointerdown', e => { e.preventDefault(); input.rise = dir; });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => { if (input.rise === dir) input.rise = 0; });
  }
}
