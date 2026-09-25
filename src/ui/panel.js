import { state, save, emit, on, clamp, replaceState } from '../state.js';
import { MUSEUM_NAME, WALL_COLORS, FLOORS, FRAME_STYLES, LAYOUTS, QUALITY, CAMERA_MODES, SUGGESTIONS, isTouch } from '../config.js';
import { searchCollection } from '../art/collection.js';
import { workSize } from '../art/works.js';
import { FIXTURES, MAX_SPOTS } from '../world/lighting.js';
import { BACKDROPS } from '../world/outside.js';

const $ = id => document.getElementById(id);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
export function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
on('toast', toast);

const panel = $('panel');
export const openPanel = () => { panel.classList.add('open'); renderStorage(); };
export const closePanel = () => panel.classList.remove('open');
export const panelOpen = () => panel.classList.contains('open');

export function updateHud(roomName = '') {
  $('hudMuseum').textContent = MUSEUM_NAME;
  $('hudShow').textContent = state.showTitle;
  $('hudRoom').textContent = roomName;
  $('introTitle').textContent = MUSEUM_NAME;
  document.title = MUSEUM_NAME;
}

const seg = (el, entries, current) => {
  el.innerHTML = Object.entries(entries).map(([k, v]) => `<button data-k="${k}" aria-pressed="${k === current}">${esc(typeof v === 'string' ? v : v.label)}</button>`).join('');
};
const pressed = (el, k) => el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === k));

export function setModeButtons(mode) {
  pressed($('modes'), mode);
  document.body.dataset.mode = mode;
}

export function renderControls() {
  $('wallSwatches').innerHTML = WALL_COLORS.map(c =>
    `<button title="${c.name}" aria-label="${c.name}" data-hex="${c.hex}" style="background:${c.hex}" aria-pressed="${c.hex === state.wallColor}"></button>`,
  ).join('') + `<input type="color" id="wallCustom" title="Any color" value="${state.wallColor}">`;
  seg($('layoutSeg'), LAYOUTS, state.layout);
  seg($('floorSeg'), FLOORS, state.floor);
  seg($('frameSeg'), FRAME_STYLES, state.frame);
  seg($('qualitySeg'), QUALITY, state.quality);
  $('timeR').value = state.time;
  for (const k of ['w', 'd', 'h']) { $(k + 'R').value = state.room[k]; $(k + 'Val').textContent = state.room[k] + ' m'; }
  $('labelsC').checked = state.labels;
  seg($('backdropSeg'), BACKDROPS, state.backdrop);
  $('windowsC').checked = state.windows;
  const lt = state.lighting;
  $('brightR').value = lt.brightness;
  $('warmR').value = lt.warmth;
  $('pictureC').checked = lt.picture;
  seg($('fixtureSeg'), FIXTURES, lt.fixture);
  lightLabels();
  renderSpots();
  $('showTitle').value = state.showTitle;
  $('patronsR').value = state.patrons;
  $('patronsVal').textContent = state.patrons;
}

function lightLabels() {
  const lt = state.lighting;
  $('brightVal').textContent = Math.round(lt.brightness * 100) + '%';
  $('warmVal').textContent = lt.warmth > 0.7 ? 'Warm' : lt.warmth > 0.35 ? 'Soft white' : 'Neutral';
}

export function renderSpots() {
  const spots = state.lighting.spots;
  $('spotHint').textContent = spots.length
    ? `${spots.length} of ${MAX_SPOTS} spotlights in use.`
    : 'Spotlights hang from the ceiling and point wherever you aim. Use them on a work you want to stand out.';
  $('spotList').innerHTML = spots.map((s, i) => `<div class="item"><span>Spotlight ${i + 1}</span><button class="quiet" data-rm="${i}">Remove</button></div>`).join('');
  $('addSpot').disabled = spots.length >= MAX_SPOTS;
}
on('spots', renderSpots);

export function setTimeLabel(name) { $('timeVal').textContent = name; }

export function renderStorage() {
  const n = state.works.length;
  $('showCount').textContent = n
    ? `${n} work${n === 1 ? '' : 's'} on view.`
    : 'Nothing is hanging yet. Find a work in the Collection tab to start.';
  const list = $('storage');
  if (!state.storage.length) { list.innerHTML = '<p class="hint">Storage is empty. Works you take down wait here.</p>'; return; }
  list.innerHTML = state.storage.map((w, i) => `
    <button class="work" data-i="${i}">
      <div class="thumb"><img loading="lazy" src="${esc(w.thumb || w.src)}" alt=""></div>
      <div class="t">${esc(w.title)}</div>
      <div class="a">${esc(w.artist)}</div>
    </button>`).join('');
}
on('works-changed', () => { if (panelOpen()) renderStorage(); });

export function initUI() {
  document.body.classList.toggle('touch', isTouch);
  seg($('modes'), CAMERA_MODES, state.camera);

  $('menuBtn').addEventListener('click', () => emit('open-panel'));
  $('closePanel').addEventListener('click', () => emit('close-panel'));
  $('modes').addEventListener('click', e => { const b = e.target.closest('button'); if (b) emit('mode', b.dataset.k); });
  $('tourBtn').addEventListener('click', () => emit('tour'));

  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
    if (b.dataset.tab === 'show') renderStorage();
  }));

  /* Collection */
  let results = [];
  const status = $('searchStatus');
  async function search(q) {
    q = q.trim();
    if (!q) return;
    $('q').value = q;
    status.textContent = `Searching for "${q}"…`;
    $('results').innerHTML = '';
    const paintingsOnly = $('paintingsOnly').checked;
    try {
      results = await searchCollection(q, { paintingsOnly });
      $('results').innerHTML = results.map((r, i) => {
        const { W, H } = workSize(r);
        return `<button class="work" data-i="${i}">
          <div class="thumb"><img loading="lazy" src="${esc(r.thumb)}" alt=""></div>
          <div class="t">${esc(r.title)}</div>
          <div class="a">${esc(r.artist)}${r.date ? ', ' + esc(r.date) : ''}<br>${Math.round(H * 100)} × ${Math.round(W * 100)} cm</div>
        </button>`;
      }).join('');
      status.textContent = results.length
        ? 'Pick a work, then face a wall and click to hang it.'
        : `No public domain ${paintingsOnly ? 'paintings' : 'works'} matched "${q}". Try the artist's last name, or turn off Paintings only.`;
    } catch {
      status.textContent = 'The collection didn\'t respond. Check your connection and search again.';
    }
  }
  $('results').addEventListener('click', e => {
    const b = e.target.closest('.work');
    if (b) emit('hold', { ...results[+b.dataset.i] });
  });
  $('q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); search($('q').value); } });
  $('paintingsOnly').addEventListener('change', () => { if ($('q').value.trim()) search($('q').value); });
  $('chips').innerHTML = SUGGESTIONS.map(s => `<button>${s}</button>`).join('');
  $('chips').addEventListener('click', e => { if (e.target.tagName === 'BUTTON') search(e.target.textContent); });

  /* Uploads */
  let upload = null;
  $('file').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      upload = { src: c.toDataURL('image/jpeg', 0.88), aspect: c.width / c.height };
      $('uploadPreview').src = upload.src;
      $('uploadPreview').style.display = 'block';
      $('upHang').disabled = false;
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => toast('That file couldn\'t be read as an image. Try a JPG or PNG.');
    img.src = URL.createObjectURL(f);
  });
  $('upHang').addEventListener('click', () => {
    if (!upload) return;
    emit('hold', {
      source: 'Upload', src: upload.src, aspect: upload.aspect,
      hCm: clamp(+$('upHeight').value || 60, 5, 800),
      title: $('upTitle').value.trim() || 'Untitled',
      artist: $('upArtist').value.trim() || 'Unknown artist',
      date: $('upDate').value.trim(), medium: '',
    });
  });

  /* Room */
  const setWall = hex => {
    state.wallColor = hex;
    $('wallSwatches').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.hex === hex));
    save(); emit('wall-color', hex);
  };
  $('wallSwatches').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setWall(b.dataset.hex); });
  $('wallSwatches').addEventListener('input', e => { if (e.target.id === 'wallCustom') setWall(e.target.value); });
  const segHandler = (id, key, evt) => $(id).addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    state[key] = b.dataset.k;
    pressed($(id), b.dataset.k);
    save(); emit(evt);
  });
  segHandler('layoutSeg', 'layout', 'rebuild');
  segHandler('floorSeg', 'floor', 'rebuild');
  segHandler('frameSeg', 'frame', 'frames');
  segHandler('qualitySeg', 'quality', 'quality');
  segHandler('backdropSeg', 'backdrop', 'backdrop');
  $('windowsC').addEventListener('change', e => { state.windows = e.target.checked; save(); emit('rebuild'); });
  $('timeR').addEventListener('input', e => { state.time = +e.target.value; save(); emit('time'); });
  let rebuildTimer;
  for (const k of ['w', 'd', 'h']) {
    $(k + 'R').addEventListener('input', e => {
      state.room[k] = +e.target.value;
      $(k + 'Val').textContent = state.room[k] + ' m';
      clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(() => { save(); emit('rebuild'); }, 120);
    });
  }
  $('labelsC').addEventListener('change', e => { state.labels = e.target.checked; save(); emit('frames'); });

  /* Light */
  $('brightR').addEventListener('input', e => { state.lighting.brightness = +e.target.value; lightLabels(); save(); emit('lighting'); });
  $('warmR').addEventListener('input', e => { state.lighting.warmth = +e.target.value; lightLabels(); save(); emit('lighting'); });
  $('pictureC').addEventListener('change', e => { state.lighting.picture = e.target.checked; save(); emit('picture-lights'); });
  $('fixtureSeg').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    state.lighting.fixture = b.dataset.k;
    pressed($('fixtureSeg'), b.dataset.k);
    save(); emit('fixtures');
  });
  $('addSpot').addEventListener('click', () => emit('place', 'spot'));
  $('clearSpots').addEventListener('click', () => { state.lighting.spots = []; save(); emit('spots'); });
  $('spotList').addEventListener('click', e => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    state.lighting.spots.splice(+b.dataset.rm, 1);
    save(); emit('spots');
  });

  /* Show */
  $('showTitle').addEventListener('input', e => { state.showTitle = e.target.value || 'Untitled Exhibition'; save(); emit('title'); });
  $('patronsR').addEventListener('input', e => {
    state.patrons = +e.target.value;
    $('patronsVal').textContent = state.patrons;
    save(); emit('patrons');
  });
  $('storage').addEventListener('click', e => {
    const b = e.target.closest('.work');
    if (b) emit('hold-storage', +b.dataset.i);
  });
  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (state.showTitle || 'show').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (!Array.isArray(s.works)) throw new Error('not a show');
      replaceState(s);
      save();
      renderControls();
      emit('loaded');
      toast(`Opened "${state.showTitle}".`);
    } catch { toast('That file isn\'t a saved show.'); }
    e.target.value = '';
  });
  $('clearBtn').addEventListener('click', () => {
    if (!state.works.length || !confirm('Move every work on the walls into storage?')) return;
    for (const { faceId, u, v, id, ...rest } of state.works) state.storage.push(rest);
    state.works = [];
    save(); emit('frames'); emit('works-changed');
  });

  renderControls();
}
