import { renderer, camera, mountRenderer, render, setQuality } from './engine.js';
import { state, save, on } from './state.js';
import { isTouch } from './config.js';
import { building, buildBuilding, setWallColor, buildTitle, applyNight as lampsAtNight } from './world/building.js';
import { applyTime, env, followCamera, setShadowBounds } from './world/sky.js';
import { syncWorks, refitWorks, applyNight as worksAtNight, labelCache } from './art/works.js';
import { initInput, onInput, input } from './input.js';
import { rig, initRig, resetPlayer, setMode, updateRig, startTour, stopTour } from './cameras.js';
import { setPatronCount, resetPatrons, revalidatePatrons, updatePatrons, onWorksChanged } from './actors/patrons.js';
import { roomAt } from './actors/nav.js';
import { cur, updateAim, setHeld, cancelHeld, hang, doAction, holdFromStorage, refreshGhost, renderActions } from './curate.js';
import { initUI, toast, openPanel, closePanel, panelOpen, updateHud, setModeButtons, setTimeLabel, renderStorage } from './ui/panel.js';

const introEl = document.getElementById('intro');
const introOpen = () => !introEl.hidden;

/* ---------------------------------------------------------------- world */
function applyTimeAll() {
  applyTime(state.time);
  lampsAtNight(env.night);
  worksAtNight(env.night);
  setTimeLabel(env.name);
}

function rebuildWorld({ keepPlayer = true } = {}) {
  buildBuilding();
  const moved = refitWorks();
  syncWorks();
  setShadowBounds(building.layout.bounds);
  applyTimeAll();
  if (keepPlayer) revalidatePatrons(); else resetPatrons();
  if (!keepPlayer || !roomAt(building.layout, rig.player.x, rig.player.z)) resetPlayer();
  if (rig.tour) startTour();
  if (moved) toast(`${moved} work${moved === 1 ? '' : 's'} didn't fit the new building and went to storage.`);
  save();
}

/* ---------------------------------------------------------------- modes */
function changeMode(m) {
  setMode(m);
  state.camera = m;
  setModeButtons(m);
  save();
}
function toggleTour() {
  if (rig.mode !== 'drone') changeMode('drone');
  if (rig.tour) stopTour(); else startTour();
}

/* ---------------------------------------------------------------- events from the UI */
on('open-panel', openPanel);
on('close-panel', closePanel);
on('mode', m => changeMode(m));
on('tour', toggleTour);
on('rebuild', () => rebuildWorld());
on('wall-color', hex => setWallColor(hex));
on('title', () => { buildTitle(); updateHud(); });
on('time', applyTimeAll);
on('quality', () => setQuality(state.quality));
on('patrons', () => setPatronCount(state.patrons));
on('frames', () => { refitWorks(); syncWorks(); refreshGhost(); renderStorage(); });
on('works-changed', onWorksChanged);
on('hold', w => { if (cur.held) cancelHeld(); setHeld(w); closePanel(); if (isTouch) toast('Face a wall and tap to hang it.'); });
on('hold-storage', i => { holdFromStorage(i); closePanel(); });
on('loaded', () => {
  labelCache.clear();
  setWallColor(state.wallColor);
  setQuality(state.quality);
  setPatronCount(state.patrons);
  rebuildWorld({ keepPlayer: false });
  updateHud();
});

/* ---------------------------------------------------------------- input */
onInput('click', () => {
  if (introOpen()) return;
  if (panelOpen()) { closePanel(); return; }
  if (cur.held) hang();
});
onInput('tap', () => { if (cur.held) hang(); });
onInput('key', code => {
  if (introOpen()) return;
  switch (code) {
    case 'KeyE': doAction('pickup'); break;
    case 'KeyX': case 'Delete': case 'Backspace': doAction('remove'); break;
    case 'KeyQ': doAction('cancel'); break;
    case 'KeyV': doAction('free'); break;
    case 'Digit1': changeMode('first'); break;
    case 'Digit2': changeMode('third'); break;
    case 'Digit3': changeMode('drone'); break;
    case 'KeyT': toggleTour(); break;
    case 'Tab': case 'Escape': if (panelOpen()) closePanel(); else openPanel(); break;
  }
});

/* ---------------------------------------------------------------- start */
mountRenderer(document.getElementById('stage'));
initInput(renderer.domElement);
initUI();
initRig();
setQuality(state.quality);
buildBuilding();
refitWorks();
syncWorks();
setShadowBounds(building.layout.bounds);
applyTimeAll();
setPatronCount(state.patrons);
resetPlayer();
changeMode(state.camera || 'first');
updateHud();
renderActions();

document.getElementById('enterBtn').addEventListener('click', () => {
  introEl.hidden = true;
});

// Wall text is drawn on canvases, so redraw once the web fonts arrive
document.fonts?.ready?.then(() => { labelCache.clear(); buildTitle(); syncWorks(); });

let lastRoom = null;
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  updateRig(dt);
  followCamera(camera);
  updatePatrons(dt, rig.player);
  updateAim();

  const L = building.layout;
  const where = rig.mode === 'drone'
    ? (camera.position.y > L.h ? 'Above the museum' : roomAt(L, camera.position.x, camera.position.z)?.name)
    : roomAt(L, rig.player.x, rig.player.z, 0.3)?.name;
  if (where !== lastRoom) { lastRoom = where; updateHud(where || ''); }

  render();
});
