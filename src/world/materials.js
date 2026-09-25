import * as THREE from 'three';
import { maxAniso } from '../engine.js';
import { FRAME_STYLES } from '../config.js';

// All floor-like textures tile in world space: 1 texture repeat = `scale` meters.
export function worldUV(geo, scale) {
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / scale, -p.getZ(i) / scale);
  uv.needsUpdate = true;
}

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

function speckle(g, size, n, alpha) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * alpha})`;
    g.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }
}

const floorMats = {};
export function floorMaterial(type) {
  if (floorMats[type]) return floorMats[type];
  const map = canvasTexture(1024, (g, S) => {
    if (type === 'concrete') {
      g.fillStyle = '#b8b4ad'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 60; i++) {
        const x = Math.random() * S, y = Math.random() * S, r = 60 + Math.random() * 180;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        const shade = Math.random() < 0.5 ? '0,0,0' : '255,255,255';
        gr.addColorStop(0, `rgba(${shade},0.05)`); gr.addColorStop(1, `rgba(${shade},0)`);
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      speckle(g, S, 40000, 0.12);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, S, 2); g.fillRect(0, 0, 2, S);
      return;
    }
    const base = type === 'walnut' ? [96, 64, 44] : [198, 162, 120];
    const rows = 20, rh = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = 0;
      while (x < S) {
        const len = 260 + Math.random() * 520, k = 0.86 + Math.random() * 0.22;
        g.fillStyle = `rgb(${base.map(v => Math.min(255, v * k | 0)).join(',')})`;
        g.fillRect(x, r * rh, len, rh);
        g.strokeStyle = 'rgba(0,0,0,0.07)';
        for (let j = 0; j < 6; j++) {
          const y = r * rh + Math.random() * rh;
          g.beginPath(); g.moveTo(x, y);
          g.bezierCurveTo(x + len * 0.3, y + (Math.random() - 0.5) * 6, x + len * 0.7, y + (Math.random() - 0.5) * 6, x + len, y);
          g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, r * rh, 2, rh);
        x += len;
      }
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, r * rh, S, 1.5);
    }
  });
  const m = new THREE.MeshStandardMaterial({ map, roughness: type === 'concrete' ? 0.85 : 0.42 });
  m.userData.envScale = 0.5;
  return (floorMats[type] = m);
}

// Stone plaza outside the building, seen from the drone
export function groundMaterial() {
  const map = canvasTexture(512, (g, S) => {
    g.fillStyle = '#8f8b84'; g.fillRect(0, 0, S, S);
    speckle(g, S, 20000, 0.15);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(0, i * S / 4); g.lineTo(S, i * S / 4); g.stroke();
      g.beginPath(); g.moveTo(i * S / 4, 0); g.lineTo(i * S / 4, S); g.stroke();
    }
  });
  return new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
}

const frameMats = {};
export function frameMaterial(style) {
  const f = FRAME_STYLES[style];
  return frameMats[style] || (frameMats[style] = new THREE.MeshStandardMaterial({ color: f.color, metalness: f.metal, roughness: f.rough }));
}
export const isSharedMaterial = m => Object.values(frameMats).includes(m) || m === glowMat || m === plParts?.brass || m === plParts?.glow;

// Shared parts for the picture light over every work
const shared = g => { g.userData.shared = true; return g; };
let plParts = null;
export function pictureLightParts() {
  return plParts || (plParts = {
    bar: shared(new THREE.CylinderGeometry(0.022, 0.022, 1, 12).rotateZ(Math.PI / 2)),
    arm: shared(new THREE.CylinderGeometry(0.008, 0.008, 0.24, 6).rotateX(Math.PI / 2)),
    strip: shared(new THREE.PlaneGeometry(1, 0.018)),
    brass: new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.3, metalness: 0.9 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xfff0d8, side: THREE.DoubleSide }),
  });
}

// Soft pool of light from a picture light above each work, visible after dark
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 110, 10, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
})();
export const glowMat = new THREE.MeshBasicMaterial({
  map: glowTex, color: 0xffd6a0, transparent: true, opacity: 0,
  blending: THREE.AdditiveBlending, depthWrite: false,
});

// Box UVs from world position, so textures keep the same scale on every wall
export function boxWorldUV(geo, scale) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), nz = Math.abs(n.getZ(i));
    const u = nx > 0.5 ? p.getZ(i) : p.getX(i);
    const v = nx > 0.5 || nz > 0.5 ? p.getY(i) : p.getZ(i);
    uv.setXY(i, u / scale, v / scale);
  }
  uv.needsUpdate = true;
}

// Subtle trowelled plaster: a near-white map that tints the wall color, also used as a bump map
export function plasterTexture() {
  return canvasTexture(512, (g, S) => {
    g.fillStyle = '#f6f6f6'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 140; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = 20 + Math.random() * 90;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const shade = Math.random() < 0.5 ? '0,0,0' : '255,255,255';
      gr.addColorStop(0, `rgba(${shade},0.022)`); gr.addColorStop(1, `rgba(${shade},0)`);
      g.fillStyle = gr;
      // Draw the blob again one tile over in every direction so the texture wraps without seams
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
        g.save(); g.translate(dx, dy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
      }
    }
    speckle(g, S, 12000, 0.05);
  });
}

// Limestone cladding: staggered blocks, one texture repeat = 2.5 m
export function facadeMaterial() {
  const map = canvasTexture(512, (g, S) => {
    g.fillStyle = '#d9d3c7'; g.fillRect(0, 0, S, S);
    const rows = 4, rh = S / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? S / 4 : 0;
      for (let c = -1; c < 2; c++) {
        const x = c * S / 2 + off, k = 0.94 + Math.random() * 0.1;
        g.fillStyle = `rgba(${217 * k | 0},${211 * k | 0},${199 * k | 0},1)`;
        g.fillRect(x + 2, r * rh + 2, S / 2 - 4, rh - 4);
      }
    }
    speckle(g, S, 16000, 0.08);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (let r = 0; r <= rows; r++) g.fillRect(0, r * rh - 1, S, 2);
  });
  return new THREE.MeshStandardMaterial({ map, roughness: 0.85 });
}

export function glassMaterial() {
  const m = new THREE.MeshStandardMaterial({
    color: 0xcfe0e6, transparent: true, opacity: 0.14, roughness: 0.04, metalness: 0.2,
    side: THREE.DoubleSide, depthWrite: false,
  });
  m.userData.envScale = 3;
  return m;
}

// Ground outside: grass for the park, asphalt for the city, stone for the plaza
export function lawnMaterial() {
  const map = canvasTexture(512, (g, S) => {
    g.fillStyle = '#5d7a3a'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 26000; i++) {
      const k = Math.random();
      g.fillStyle = k < 0.5 ? `rgba(40,70,20,${Math.random() * 0.35})` : `rgba(150,180,90,${Math.random() * 0.25})`;
      g.fillRect(Math.random() * S, Math.random() * S, 1.5, 3);
    }
  });
  return new THREE.MeshStandardMaterial({ map, roughness: 1 });
}
export function asphaltMaterial() {
  const map = canvasTexture(512, (g, S) => {
    g.fillStyle = '#3c3d40'; g.fillRect(0, 0, S, S);
    speckle(g, S, 30000, 0.3);
    for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`; g.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5); }
  });
  return new THREE.MeshStandardMaterial({ map, roughness: 0.92 });
}
export function pathMaterial() {
  const map = canvasTexture(256, (g, S) => {
    g.fillStyle = '#b9ab92'; g.fillRect(0, 0, S, S);
    speckle(g, S, 9000, 0.25);
  });
  return new THREE.MeshStandardMaterial({ map, roughness: 1 });
}

// City towers: a window grid for daytime, and a second map of lit windows for night
export function towerTextures() {
  const cols = 8, rows = 16, S = 512, cw = S / cols, rh = S / rows;
  const lit = [];
  for (let i = 0; i < cols * rows; i++) lit.push(Math.random() < 0.35);
  const map = canvasTexture(S, g => {
    g.fillStyle = '#8b8f94'; g.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const k = 0.7 + Math.random() * 0.3;
      g.fillStyle = `rgb(${70 * k | 0},${90 * k | 0},${110 * k | 0})`;
      g.fillRect(c * cw + 6, r * rh + 5, cw - 12, rh - 10);
    }
  });
  const emissiveMap = canvasTexture(S, g => {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!lit[r * cols + c]) continue;
      g.fillStyle = Math.random() < 0.8 ? '#ffd8a0' : '#cfe3ff';
      g.fillRect(c * cw + 6, r * rh + 5, cw - 12, rh - 10);
    }
  });
  return { map, emissiveMap };
}
