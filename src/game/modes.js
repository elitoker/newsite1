import { state, replaceState, normalize, save, setSlot, readSlot, emit } from '../state.js';
import { STORE_KEY } from '../config.js';
import { MUSEUMS, KINDS, ARRIVALS, WALLS_WITH, applyLook, parseShowQuery } from './styles.js';
import { fillShow, autoHang, capacity } from './show.js';
import { LEVELS, progress, unlocked, levelSlot, judge, writeReview, awardStars, startCritic, stopCritic, criticState, updateCritic } from './story.js';
import { searchArt, measureAspect } from '../art/collection.js';
import { FURNITURE, fits } from '../world/furniture.js';
import { building } from '../world/building.js';
import { BACKDROPS } from '../world/outside.js';
import { startAudio } from '../audio.js';
import { newId } from '../state.js';

// The opening menu and the four ways to play:
//   New game (story), Free play, Famous museums, Live shows.

export const game = { mode: null, level: null };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const intro = $('intro');

export const menuOpen = () => !intro.hidden;

function showScreen(name) {
  intro.hidden = false;
  intro.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === name));
  if (name === 'story') renderLevels();
  if (name === 'home') $('continueBtn').hidden = !(readSlot(STORE_KEY)?.works?.length);
}
function loading(title, text) {
  showScreen('loading');
  $('loadingTitle').textContent = title;
  $('loadingText').textContent = text;
}

function enter() {
  intro.hidden = true;
  startAudio();
  emit('entered');
}

// Swap in a whole new museum and rebuild the world around it
function begin(s, slot) {
  replaceState(s);
  setSlot(slot);
  emit('loaded');
}

// Sculptures some famous museums start with, set down the middle of the entrance room
function placeSculptures(types) {
  const L = building.layout, r = L.roomById[L.start.room];
  const alongZ = r.z1 - r.z0 >= r.x1 - r.x0;
  const len = alongZ ? r.z1 - r.z0 : r.x1 - r.x0;
  types.forEach((type, i) => {
    const k = -len / 2 + (len / (types.length + 1)) * (i + 1);
    const f = { id: newId(), type, rot: Math.PI, x: alongZ ? r.cx : r.cx + k, z: alongZ ? r.cz + k : r.cz };
    if (FURNITURE[type] && fits(f)) state.furniture.push(f);
  });
  delete state.pendingSculptures;
  emit('furniture-changed');
}

async function hangTheme(theme) {
  const res = await fillShow(theme.queries ? { queries: theme.queries, title: theme.title } : {});
  emit('frames');
  emit('works-changed');
  emit('title');
  save();
  return res;
}

/* ---------------------------------------------------------------- free play */
const pickState = { kind: 'whitecube', where: 'park', walls: 'raquel', arrive: 'golden' };
function choices(id, entries, key, render) {
  const el = $(id);
  el.innerHTML = Object.entries(entries).map(([k, v]) => `<button data-k="${k}" aria-pressed="${k === pickState[key]}">${render(v)}</button>`).join('');
  el.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    pickState[key] = b.dataset.k;
    el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
  };
}

async function startFree(full) {
  const saved = readSlot(STORE_KEY);
  if (saved?.works?.length && !confirm('Start a new museum? Your saved one will be replaced. You can keep it by pressing Cancel and choosing Continue.')) return;
  const s = normalize();
  applyLook(s, KINDS[pickState.kind].look);
  s.backdrop = pickState.where;
  s.time = ARRIVALS[pickState.arrive][1];
  s.showTitle = 'Untitled Exhibition';
  game.mode = 'free'; game.level = null;
  begin(s, STORE_KEY);
  if (full) {
    const w = WALLS_WITH[pickState.walls];
    loading('Hanging the show', 'Finding the works…');
    const res = await hangTheme(w.queries ? { title: w.title, queries: w.queries } : {});
    if (!res.hung) emit('toast', 'The collections didn\'t answer, so the walls are empty for now. Try Random show in the Show tab.');
  }
  syncBrief();
  enter();
}

/* ---------------------------------------------------------------- famous museums */
function renderFamous() {
  $('famousCards').innerHTML = Object.entries(MUSEUMS).map(([k, m]) => `
    <button data-k="${k}"><div class="n">${esc(m.name)}</div><div class="c">${esc(m.city)}</div><div class="b">${esc(m.blurb)}</div></button>`).join('');
}
async function startFamous(key) {
  const m = MUSEUMS[key];
  const s = normalize();
  applyLook(s, m.look);
  s.showTitle = m.show.title;
  game.mode = 'visit'; game.level = null;
  loading(m.name, 'Building the galleries…');
  begin(s, null);
  if (state.pendingSculptures?.length) placeSculptures(state.pendingSculptures);
  $('loadingText').textContent = 'Hanging the collection…';
  await hangTheme(m.show);
  syncBrief();
  enter();
}

/* ---------------------------------------------------------------- live shows */
let live = null;
async function searchLive(text) {
  const q = parseShowQuery(text);
  const box = $('liveResult');
  if (!q.artist) { box.textContent = 'Type an artist\'s name, and the museum if you like.'; return; }
  const m = q.museum && MUSEUMS[q.museum];
  const where = m ? m.name : q.museumText;
  box.innerHTML = `Looking for work by ${esc(q.artist)}${where ? ` for a show at ${esc(where)}` : ''}…`;
  const id = (live = { q, m, where });
  const show = r => {
    if (live !== id) return;
    id.r = r;
    const n = r.byArtist.length;
    const thumbs = r.byArtist.slice(0, 8).map(w => `<img src="${esc(w.thumb)}" alt="">`).join('');
    const look = m ? `The galleries take on the look of ${esc(m.name)}.` : where ? `We don't have ${esc(where)}'s look on file, so it gets a clean modern gallery.` : 'It opens in a clean modern gallery.';
    if (n) {
      box.innerHTML = `<b>${n} ${n === 1 ? 'work' : 'works'} by ${esc(r.artistName)}</b>${r.done ? '' : ', still searching…'}
        <div class="thumbs">${thumbs}</div>
        <p>${look} Museums don't publish their exhibition checklists, so this is built from public domain work by the artist in open collections.</p>
        ${n < 8 && r.done ? `<p>Only ${n} of their works are public domain so far, since most work made after about 1930 is still under copyright. The show gets one intimate room, and you can add more of their work in the Upload tab.</p>` : ''}
        <button class="primary" id="liveEnter">Walk in</button>`;
    } else if (r.done) {
      box.innerHTML = `<p>No public domain work by "${esc(q.artist)}" turned up in the open collections. If they worked after about 1930, their work is most likely still under copyright, so museums can't share images of it.</p>
        <p>You can still build the show: walk in, then add images of the work in the Upload tab (a file or a link to the image).</p>
        <button class="ghost" id="liveEnter">Walk in and add the work myself</button>`;
    }
  };
  await searchArt(q.artist, { onUpdate: show, paintingsOnly: false });
}
async function enterLive() {
  const { q, m, where, r } = live;
  const s = normalize();
  applyLook(s, m ? m.look : KINDS.whitecube.look);
  // A handful of works gets one intimate room instead of a whole museum
  const count = r?.byArtist?.length || 0;
  if (count < 8) { s.layout = 'single'; s.room = { w: 12, d: 14, h: Math.min(s.room.h, 6) }; }
  const artist = r?.artistName || q.artist;
  s.showTitle = where ? `${artist} at ${where}` : artist;
  game.mode = 'visit'; game.level = null;
  loading(s.showTitle, 'Building the galleries…');
  begin(s, null);
  if (state.pendingSculptures?.length) placeSculptures(state.pendingSculptures);
  const works = await Promise.all((r?.byArtist || []).slice(0, Math.min(48, capacity())).map(measureAspect));
  autoHang(works);
  emit('frames'); emit('works-changed'); emit('title');
  syncBrief();
  enter();
}

/* ---------------------------------------------------------------- story */
function renderLevels() {
  const p = progress();
  $('levels').innerHTML = LEVELS.map((l, i) => {
    const s = p.stars[l.id] || 0, open = unlocked(i, p);
    return `<button data-i="${i}" ${open ? '' : 'disabled'}>
      <span class="num">${i + 1}</span>
      <span><span class="t">${esc(l.title)}</span><br><span class="s">${open ? esc(l.critic) + ', ' + esc(l.paper) : 'Earn a star on the one before to unlock'}</span></span>
      <span class="stars">${'★'.repeat(s)}${'☆'.repeat(3 - s)}</span></button>`;
  }).join('');
}
function startLevel(i) {
  const level = LEVELS[i];
  const saved = readSlot(levelSlot(level.id));
  let s;
  if (saved) s = saved;
  else {
    s = normalize();
    applyLook(s, level.look);
    s.showTitle = level.title;
    s.patrons = 6;
  }
  game.mode = 'story'; game.level = level;
  begin(s, levelSlot(level.id));
  syncBrief();
  enter();
}

// The brief card on screen during story mode
function syncBrief() {
  const on = game.mode === 'story';
  $('brief').hidden = !on;
  if (!on) return;
  $('briefTitle').textContent = game.level.title;
  $('briefText').textContent = game.level.brief;
  updateGoals();
}
function updateGoals() {
  if (game.mode !== 'story' || !building.layout) return;
  $('briefGoals').innerHTML = game.level.goals.map(g => {
    const ok = g.test(state);
    return `<li class="${ok ? 'ok' : ''}">${ok ? '✓' : '○'} ${esc(g.text)}</li>`;
  }).join('');
}

function openDoors() {
  if (criticState()) return;
  emit('close-panel');
  const level = game.level;
  const j = judge(level);
  if (!state.works.length) { emit('toast', 'Hang some work before you open the doors.'); return; }
  $('openDoors').disabled = true;
  $('openDoors').textContent = 'The critic is here';
  emit('toast', `${level.critic} from ${level.paper} has arrived.`);
  startCritic(level, j, () => showReview(level, j));
}
function showReview(level, j) {
  $('openDoors').disabled = false;
  $('openDoors').textContent = 'Open the doors again';
  const lines = writeReview(level, j);
  const { firstUnlock } = awardStars(level, j.stars);
  const i = LEVELS.indexOf(level), next = LEVELS[i + 1];
  const canNext = next && unlocked(i + 1);
  $('reviewBody').innerHTML = `
    <div class="paper">${esc(level.paper)}</div>
    <h2>${esc(state.showTitle || level.title)}</h2>
    <div class="stars big">${'★'.repeat(j.stars)}${'☆'.repeat(3 - j.stars)}</div>
    <div class="by">Reviewed by ${esc(level.critic)}</div>
    ${lines.map(l => `<p>${esc(l)}</p>`).join('')}
    <ul class="goals">${j.goals.map(g => `<li class="${g.ok ? 'ok' : ''}">${g.ok ? '✓' : '✗'} ${esc(g.text)}</li>`).join('')}</ul>
    <p class="score">Craft score ${j.score} out of 100</p>
    ${firstUnlock && next ? `<p class="unlock">Unlocked: ${esc(next.title)}</p>` : ''}
    ${!next && j.stars ? '<p class="unlock">That was the last commission. Congratulations.</p>' : ''}`;
  $('reviewNext').hidden = !canNext;
  $('reviewNext').onclick = () => { $('review').hidden = true; startLevel(i + 1); };
  $('review').hidden = false;
}

/* ---------------------------------------------------------------- per frame */
let goalTimer = 0;
export function updateModes(dt) {
  updateCritic(dt);
  const c = criticState();
  if (c) $('criticStatus').textContent = `${game.level.critic} is looking at work ${Math.min(c.i + 1, c.n)} of ${c.n}${c.room ? ' in ' + c.room : ''}`;
  $('criticStatus').hidden = !c;
  goalTimer -= dt;
  if (goalTimer <= 0) { goalTimer = 0.6; updateGoals(); }
}

export function backToMenu() {
  stopCritic();
  $('review').hidden = true;
  emit('close-panel');
  showScreen('home');
}

/* ---------------------------------------------------------------- wiring */
export function initMenu() {
  intro.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) showScreen(go.dataset.go);
  });
  $('continueBtn').addEventListener('click', () => {
    const saved = readSlot(STORE_KEY);
    game.mode = 'free'; game.level = null;
    begin(normalize(saved), STORE_KEY);
    syncBrief();
    enter();
  });

  choices('qKind', KINDS, 'kind', v => `<b>${esc(v.name)}</b>${esc(v.blurb)}`);
  choices('qWhere', BACKDROPS, 'where', v => `<b>${esc(v)}</b>`);
  choices('qWalls', { ...WALLS_WITH }, 'walls', v => `<b>${esc(v.name)}</b>`);
  choices('qArrive', ARRIVALS, 'arrive', v => `<b>${esc(v[0])}</b>`);
  $('openFull').addEventListener('click', () => startFree(true));
  $('openEmpty').addEventListener('click', () => startFree(false));

  renderFamous();
  $('famousCards').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) startFamous(b.dataset.k); });

  $('liveChips').innerHTML = ['Georgia O\'Keeffe at the DIA', 'Hilma af Klint at the Tate', 'Vermeer at the Met', 'Hammershøi at the Orsay', 'Raquel Weinberg']
    .map(s => `<button>${esc(s)}</button>`).join('');
  $('liveChips').addEventListener('click', e => { if (e.target.tagName === 'BUTTON') { $('liveQ').value = e.target.textContent; searchLive(e.target.textContent); } });
  $('liveGo').addEventListener('click', () => searchLive($('liveQ').value));
  $('liveQ').addEventListener('keydown', e => { if (e.key === 'Enter') searchLive($('liveQ').value); });
  $('liveResult').addEventListener('click', e => { if (e.target.id === 'liveEnter') enterLive(); });

  $('levels').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b && !b.disabled) startLevel(+b.dataset.i); });
  $('openDoors').addEventListener('click', openDoors);
  $('reviewKeep').addEventListener('click', () => { $('review').hidden = true; });
  $('reviewMenu').addEventListener('click', backToMenu);
  $('menuHome').addEventListener('click', backToMenu);

  showScreen('home');
}
