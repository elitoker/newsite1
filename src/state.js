import { STORE_KEY, OLD_STORE_KEY, DEFAULTS } from './config.js';

const clone = o => JSON.parse(JSON.stringify(o));
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

export function normalize(s = {}) {
  const d = clone(DEFAULTS);
  const out = { ...d, ...s, room: { ...d.room, ...(s.room || {}) }, lighting: { ...d.lighting, ...(s.lighting || {}) } };
  if (!Array.isArray(out.lighting.spots)) out.lighting.spots = [];
  if (!Array.isArray(out.furniture)) out.furniture = [];
  if (!Array.isArray(out.partitions)) out.partitions = [];
  out.music = { ...d.music, ...(s.music || {}) };
  out.works = Array.isArray(out.works) ? out.works.filter(w => w && w.src && w.faceId) : [];
  out.storage = Array.isArray(out.storage) ? out.storage.filter(w => w && w.src) : [];
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {}
  // Carry shows over from the first version, which had one room with four walls
  try {
    const old = JSON.parse(localStorage.getItem(OLD_STORE_KEY) || 'null');
    if (old) {
      const faces = ['r0-N0', 'r0-S0', 'r0-W0', 'r0-E0'];
      const works = (old.works || []).map(({ wall, ...w }) => ({ ...w, faceId: faces[wall] }));
      return normalize({ ...old, layout: 'single', works });
    }
  } catch {}
  return normalize();
}

export const state = load();

export function replaceState(s) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, normalize(s));
}

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch { emit('toast', 'The show is too big to save in this browser. Uploaded images take the most space.'); }
  }, 300);
}

// Tiny event bus so modules don't have to import each other
const listeners = {};
export const on = (evt, fn) => (listeners[evt] ||= []).push(fn);
export const emit = (evt, ...args) => (listeners[evt] || []).forEach(fn => fn(...args));
