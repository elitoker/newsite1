import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
export const maxAniso = renderer.capabilities.getMaxAnisotropy();

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 800);
camera.rotation.order = 'YXZ';

// The sun comes in through the skylights and casts real shadows
export const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.04;
sun.shadow.mapSize.set(2048, 2048);
export const hemi = new THREE.HemisphereLight(0xffffff, 0x6b5a48, 1);
export const amb = new THREE.AmbientLight(0xffffff, 0.05);
scene.add(sun, sun.target, hemi, amb);

// Post-processing: multisampled HDR target, bloom for sun and lamps, then tone mapping
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.6, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let usePost = true;

export function mountRenderer(el) { el.appendChild(renderer.domElement); }

export function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);

export function setQuality(q) {
  const pr = q === 'high' ? Math.min(devicePixelRatio, 2) : q === 'balanced' ? Math.min(devicePixelRatio, 1.5) : 1;
  renderer.setPixelRatio(pr);
  const size = q === 'high' ? 4096 : q === 'balanced' ? 2048 : 1024;
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  usePost = q !== 'fast';
  resize();
}

export function setBloom(strength) { bloom.strength = strength; }
export function setExposure(e) { renderer.toneMappingExposure = e; }

export function render() {
  if (usePost) composer.render();
  else renderer.render(scene, camera);
}

// Render one frame at an exact size and return it as a JPEG data URL (used for the menu background)
export function renderStill(w, h, quality = 0.88) {
  const pr = renderer.getPixelRatio();
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(1);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  render();
  const url = renderer.domElement.toDataURL('image/jpeg', quality);
  renderer.setPixelRatio(pr);
  resize();
  return url;
}
