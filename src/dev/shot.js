// Dev tool: stages a gallery at sunset with Raquel Weinberg's work and renders the
// menu backgrounds. Open /?shot with the server started as `serve.ps1 -AllowSave`.
import { renderStill, camera } from '../engine.js';
import { state, replaceState, normalize, setSlot, emit, newId } from '../state.js';
import { RAQUEL } from '../art/raquel.js';
import { building } from '../world/building.js';
import { workObjs } from '../art/works.js';
import { rig } from '../cameras.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
const byTitle = t => ({ ...RAQUEL.find(w => w.title.startsWith(t)) });

export async function run() {
  document.body.classList.add('shot');
  document.getElementById('intro').hidden = true;
  const s = normalize({
    layout: 'single', room: { w: 14, d: 16, h: 6 }, wallColor: '#ebe6dc', floor: 'walnut', frame: 'black',
    time: 0.55, backdrop: 'park', skylight: 'none', windows: true, patrons: 0, guards: false, labels: true,
    showTitle: 'Raquel Weinberg: New Work', quality: 'high',
    lighting: { brightness: 1.05, warmth: 0.75, picture: true, fixture: 'track', spots: [] },
  });
  setSlot(null);
  replaceState(s);
  emit('loaded');
  await wait(300);
  // The big painting on the west wall, two more on the side walls
  state.works = [
    { ...byTitle('How Do We Separate'), id: newId(), faceId: 'r0-W0', u: 0.4, v: 1.75 },
    { ...byTitle('Men I'), id: newId(), faceId: 'r0-W0', u: -3.4, v: 1.5 },
    { ...byTitle('Bar Bathroom on Marcy Ave I'), id: newId(), faceId: 'r0-N0', u: -2.2, v: 1.5 },
    { ...byTitle('Public Transportation'), id: newId(), faceId: 'r0-S0', u: 2.5, v: 1.5 },
  ].filter(w => building.faces.has(w.faceId));
  state.furniture = [
    { id: newId(), type: 'bench', x: -4.3, z: -0.4, rot: Math.PI / 2 },
    { id: newId(), type: 'fig', x: -6, z: -6.8, rot: 0 },
    { id: newId(), type: 'lounge', x: 4.8, z: -5.8, rot: 2.4 },
  ];
  emit('frames');
  emit('furniture-changed');
  emit('mode', 'first');
  // Wait for the paintings to load
  for (let i = 0; i < 60 && [...workObjs.values()].some(o => !o.mat.map); i++) await wait(250);
  await wait(1500);

  const shoot = async (w, h, x, z, yaw, name, fov = 48) => {
    Object.assign(rig.player, { x, z, yaw, pitch: 0.03, vx: 0, vz: 0 });
    await wait(600);
    camera.fov = fov;
    const url = renderStill(w, h);
    camera.fov = 68;
    camera.updateProjectionMatrix();
    const blob = await (await fetch(url)).blob();
    const r = await fetch('/__save/assets/' + name, { method: 'PUT', body: blob });
    return `${name}: ${r.status} ${Math.round(blob.size / 1024)} KB`;
  };
  const out = [];
  out.push(await shoot(1920, 1080, 3.6, 3.4, 1.5, 'intro.jpg'));
  out.push(await shoot(1080, 1920, 2.5, 1.2, 1.42, 'intro-tall.jpg', 58));
  document.title = 'shot done';
  console.log(out.join('\n'));
  return out;
}
