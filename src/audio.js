import { state } from './state.js';

// Background music made live with Web Audio, so there are no files to load or license.
// Each style is a small generative piece that never repeats exactly.
// Browsers only allow sound after a click, so start() is called from the Enter button.

export const MUSIC_STYLES = { ambient: 'Ambient', piano: 'Piano', jazz: 'Lounge jazz' };

let ctx = null, master = null, musicBus = null, murmurBus = null, reverb = null;
let timer = null, step = 0, murmurNodes = null;

const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const rnd = arr => arr[Math.floor(Math.random() * arr.length)];

function makeReverb(seconds = 3.2) {
  const len = ctx.sampleRate * seconds, buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

function init() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.connect(ctx.destination);
  reverb = makeReverb();
  const wet = ctx.createGain(); wet.gain.value = 0.45;
  reverb.connect(wet).connect(master);
  musicBus = ctx.createGain();
  musicBus.connect(master);
  musicBus.connect(reverb);
  murmurBus = ctx.createGain();
  murmurBus.gain.value = 0;
  murmurBus.connect(master);
  applyVolume();
}

/* ---------------------------------------------------------------- instruments */
function pad(freq, t, dur, gain = 0.05) {
  for (const det of [-6, 0, 7]) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = det ? 'sawtooth' : 'triangle';
    o.frequency.value = freq;
    o.detune.value = det;
    f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.3;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * (det ? 0.35 : 1), t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f).connect(g).connect(musicBus);
    o.start(t); o.stop(t + dur + 0.1);
  }
}

// A struck string: a few partials with fast attack and long exponential decay
function piano(freq, t, vel = 0.12, decay = 3.5) {
  [[1, 1], [2, 0.4], [3, 0.18], [4, 0.08]].forEach(([k, a]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq * k * (1 + (k - 1) * 0.0008);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * a, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay / k);
    o.connect(g).connect(musicBus);
    o.start(t); o.stop(t + decay + 0.1);
  });
}

// Electric piano for the lounge chords: sine with a bell-like overtone
function rhodes(freq, t, vel = 0.05, dur = 1.6) {
  [[1, 1], [3.5, 0.12]].forEach(([k, a]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq * k;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * a, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur / (k > 1 ? 3 : 1));
    o.connect(g).connect(musicBus);
    o.start(t); o.stop(t + dur + 0.1);
  });
}

function bass(freq, t, dur = 0.5) {
  const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'triangle'; o.frequency.value = freq;
  f.type = 'lowpass'; f.frequency.value = 500;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.16, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(f).connect(g).connect(musicBus);
  o.start(t); o.stop(t + dur + 0.05);
}

let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}
function brush(t, vel = 0.03) {
  const s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'highpass'; f.frequency.value = 6000;
  g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.0005, t + 0.12);
  s.connect(f).connect(g).connect(musicBus);
  s.start(t, Math.random()); s.stop(t + 0.15);
}

/* ---------------------------------------------------------------- pieces */
const AMBIENT = [[48, 55, 64, 71], [45, 52, 60, 67, 71], [41, 48, 57, 64], [43, 50, 59, 64]];
const PENTA = [60, 62, 64, 67, 69, 72, 74, 76, 79];
// ii–V–I–vi in F, voiced as sevenths
const JAZZ = [
  { root: 43, notes: [55, 58, 62, 65] }, { root: 36, notes: [52, 55, 58, 62] },
  { root: 41, notes: [53, 57, 60, 64] }, { root: 38, notes: [53, 57, 60, 62] },
];

function schedule() {
  const now = ctx.currentTime + 0.05;
  const style = state.music.style;
  if (style === 'ambient') {
    const chord = AMBIENT[step % AMBIENT.length];
    chord.forEach((n, i) => pad(midi(n), now + i * 0.3, 9));
    if (Math.random() < 0.7) piano(midi(rnd(PENTA) + 12), now + 2 + Math.random() * 4, 0.05, 5);
    step++;
    return 8;
  }
  if (style === 'piano') {
    // Left hand holds a low note, right hand wanders the pentatonic scale
    piano(midi(rnd([36, 41, 43, 45])), now, 0.1, 6);
    let t = now + 0.4;
    for (let i = 0; i < 4; i++) {
      if (Math.random() < 0.8) piano(midi(rnd(PENTA)), t, 0.06 + Math.random() * 0.05);
      t += rnd([0.6, 0.9, 1.2]);
    }
    return 4.2;
  }
  // Lounge jazz at about 92 bpm with a swung ride
  const beat = 60 / 92, chord = JAZZ[step % JAZZ.length];
  chord.notes.forEach(n => rhodes(midi(n), now + beat * 0.05, 0.035, beat * 3));
  if (Math.random() < 0.5) chord.notes.forEach(n => rhodes(midi(n), now + beat * 2.66, 0.025, beat * 1.5));
  const walk = [0, 4, 7, 5].map(x => chord.root + x);
  walk.forEach((n, i) => bass(midi(n), now + i * beat, beat * 0.9));
  for (let i = 0; i < 4; i++) { brush(now + i * beat); if (i % 2) brush(now + i * beat + beat * 0.66, 0.018); }
  if (Math.random() < 0.6) piano(midi(rnd([65, 67, 69, 72, 74, 77])), now + beat * (1 + Math.floor(Math.random() * 3)), 0.04, 1.4);
  step++;
  return beat * 4;
}

function loop() {
  clearTimeout(timer);
  if (!ctx || !state.music.on) return;
  const next = schedule();
  timer = setTimeout(loop, next * 1000 - 60);
}

/* ---------------------------------------------------------------- murmur */
// Filtered noise that rises and falls like a room of people talking quietly
function startMurmur() {
  if (murmurNodes) return;
  const s = noise(); s.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.8;
  const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
  lfo.frequency.value = 0.23; lfoGain.gain.value = 140;
  lfo.connect(lfoGain).connect(bp.frequency);
  s.connect(bp).connect(murmurBus);
  s.start(); lfo.start();
  murmurNodes = { s, lfo };
}

/* ---------------------------------------------------------------- controls */
export function applyVolume() {
  if (!ctx) return;
  const m = state.music;
  master.gain.setTargetAtTime(m.volume * 0.9, ctx.currentTime, 0.2);
  musicBus.gain.setTargetAtTime(m.on ? 1 : 0, ctx.currentTime, 0.3);
  murmurBus.gain.setTargetAtTime(m.murmur === false ? 0 : Math.min(0.05, state.patrons * 0.002), ctx.currentTime, 0.5);
}

export function startAudio() {
  init();
  if (ctx.state === 'suspended') ctx.resume();
  startMurmur();
  applyVolume();
  loop();
}

export function restartMusic() {
  if (!ctx) return;
  step = 0;
  applyVolume();
  loop();
}
