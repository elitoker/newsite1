import { renderer, camera, mountRenderer, render, setQuality } from './engine.js';
import { state, save, on } from './state.js';
import { isTouch } from './config.js';
import { building, buildBuilding, setWallColor, buildTitle } from './world/building.js';
import { buildLighting, applyLighting, updateLighting, syncSpots } from './world/lighting.js';
import { buildOutside, applyOutsideNight } from './world/outside.js';
import { syncFurniture, refitFurniture } from './world/furniture.js';
import { buildGuards, updateGuards, updateGuardTalk } from './actors/guards.js';
import { applyVolume, restartMusic } from './audio.js';
import { applyTime, env, followCamera, setShadowBounds } from './world/sky.js';
import { syncWorks, refitWorks, applyNight as worksAtNight, labelCache } from './art/works.js';
import { initInput, onInput, input } from './input.js';
import { rig, initRig, resetPlayer, setMode, updateRig, startTour, stopTour } from './cameras.js';
import { setPatronCount, resetPatrons, revalidatePatrons, updatePatrons, onWorksChanged } from './actors/patrons.js';
import { roomAt } from './actors/nav.js';
import { cur, updateAim, setHeld, cancelHeld, hang, doAction, holdFromStorage, refreshGhost, renderActions, startPlacing, stopPlacing, startFurniture, cancelFurniture } from './curate.js';
import { initUI, toast, openPanel, closePanel, panelOpen, updateHud, setModeButtons, setTimeLabel, renderStorage, renderControls } from './ui/panel.js';
import { initMenu, updateModes, menuOpen } from './game/modes.js';
import { fillShow } from './game/show.js';

const introOpen = menuOpen;

/* ---------------------------------------------------------------- world */
function applyTimeAll() {
  applyTime(state.time);
  applyLighting(env.night);
  applyOutsideNight(env.night);
  worksAtNight(env.night);
  setTimeLabel(env.name);
}

function rebuildWorld({ keepPlayer = true } = {}) {
  buildBuilding();
  const gone = refitFurniture();
  syncFurniture();
  const moved = refitWorks();
  syncWorks();
  buildLighting();
  buildOutside();
  setShadowBounds(building.layout.bounds);
  applyTimeAll();
  buildGuards();
  if (keepPlayer) revalidatePatrons(); else resetPatrons();
  if (!keepPlayer || !roomAt(building.layout, rig.player.x, rig.player.z)) resetPlayer();
  if (rig.tour) startTour();
  if (gone) toast(gone === 1 ? "A piece of furniture didn't fit the new building and was removed." : `${gone} pieces of furniture didn't fit the new building and were removed.`);
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
on('quality', () => { setQuality(state.quality); buildLighting(); syncFurniture(); });
on('lighting', () => { applyLighting(); worksAtNight(env.night); });
on('fixtures', () => buildLighting());
on('picture-lights', () => { syncWorks(); buildLighting(); worksAtNight(env.night); });
on('spots', () => syncSpots());
on('backdrop', () => buildOutside());
on('patrons', () => { setPatronCount(state.patrons); applyVolume(); });
on('frames', () => { refitWorks(); syncWorks(); refreshGhost(); renderStorage(); });
on('works-changed', onWorksChanged);
on('hold', w => { if (cur.placing === 'furniture') cancelFurniture(); else if (cur.placing) stopPlacing(); if (cur.held) cancelHeld(); setHeld(w); closePanel(); if (isTouch) toast('Face a wall and tap to hang it.'); });
on('place', kind => { closePanel(); startPlacing(kind); });
on('guards', () => buildGuards());
on('music', applyVolume);
on('music-style', restartMusic);
on('furnish', type => { closePanel(); startFurniture(type); });
on('furniture-changed', () => syncFurniture());
on('random-show', async () => {
  toast('Picking a theme and finding the works…');
  const { hung, title } = await fillShow();
  if (!hung) { toast('The collections didn\x27t answer. Check your connection and try again.'); return; }
  syncWorks(); onWorksChanged(); buildTitle(); updateHud(); renderStorage(); renderControls(); save();
  toast(`Hung ${hung} works for "${title}". The old show went to storage.`);
});
on('hold-storage', i => { holdFromStorage(i); closePanel(); });
on('loaded', () => {
  labelCache.clear();
  setWallColor(state.wallColor);
  setQuality(state.quality);
  setPatronCount(state.patrons);
  rebuildWorld({ keepPlayer: false });
  changeMode('first');
  renderControls();
  updateHud();
});

/* ---------------------------------------------------------------- input */
onInput('click', () => {
  if (introOpen()) return;
  if (panelOpen()) { closePanel(); return; }
  if (cur.placing) doAction('place');
  else if (cur.held) hang();
});
onInput('tap', () => { if (cur.placing) doAction('place'); else if (cur.held) hang(); });
onInput('key', code => {
  if (introOpen()) return;
  switch (code) {
    case 'KeyE': doAction('pickup'); break;
    case 'KeyX': case 'Delete': case 'Backspace': doAction('remove'); break;
    case 'KeyQ': doAction('cancel'); break;
    case 'KeyV': doAction('free'); break;
    case 'KeyR': doAction('rotate'); break;
    case 'KeyM': state.music.on = !state.music.on; save(); restartMusic(); toast(state.music.on ? 'Music on.' : 'Music off.'); break;
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
syncFurniture();
refitWorks();
syncWorks();
buildLighting();
buildOutside();
setShadowBounds(building.layout.bounds);
applyTimeAll();
setPatronCount(state.patrons);
buildGuards();
resetPlayer();
changeMode(state.camera || 'first');
updateHud();
renderActions();

initMenu();

// Wall text is drawn on canvases, so redraw once the web fonts arrive
document.fonts?.ready?.then(() => { labelCache.clear(); buildTitle(); syncWorks(); });

let lastRoom = null;
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  // The menu covers the whole screen, so skip the 3D work behind it
  if (introOpen()) return;
  updateRig(dt);
  followCamera(camera);
  updatePatrons(dt, rig.player);
  updateGuards(dt);
  updateGuardTalk(rig.player, camera, rig.mode !== 'drone' && !introOpen());
  updateAim();
  updateLighting(dt);
  updateModes(dt);

  const L = building.layout;
  const where = rig.mode === 'drone'
    ? (camera.position.y > L.h ? 'Above the museum' : roomAt(L, camera.position.x, camera.position.z)?.name)
    : roomAt(L, rig.player.x, rig.player.z, 0.3)?.name;
  if (where !== lastRoom) { lastRoom = where; updateHud(where || ''); }

  render();
});
