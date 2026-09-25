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
