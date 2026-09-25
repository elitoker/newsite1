import * as THREE from 'three';
import { scene, sun, hemi, amb, setBloom } from '../engine.js';
import { TIME_KEYS } from '../config.js';

export const env = { night: 0, name: 'Noon' };

const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    top: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    ground: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color() },
    night: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 top, horizon, ground, sunDir, sunColor;
    uniform float night;
    varying vec3 vDir;
    float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 col = h > 0.0
        ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55))
        : mix(horizon, ground, pow(clamp(-h, 0.0, 1.0), 0.35));
      vec3 sd = normalize(sunDir);
      float s = max(dot(d, sd), 0.0);
      float vis = smoothstep(-0.06, 0.02, sd.y);
      col += sunColor * vis * (pow(s, 900.0) * 30.0 + pow(s, 16.0) * 0.5 + pow(s, 3.0) * 0.12);
      if (h > 0.0) {
        vec3 c = floor(d * 260.0);
        float star = step(0.9975, hash(c)) * (0.6 + 0.8 * hash(c + 1.3));
        col += vec3(star * night * smoothstep(0.0, 0.2, h));
      }
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMat);
sky.frustumCulled = false;
sky.renderOrder = -1;
scene.add(sky);

export function followCamera(cam) { sky.position.copy(cam.position); }

// Fit the sun's shadow camera around the whole building
const center = new THREE.Vector3();
export function setShadowBounds(b) {
  center.set((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
  const r = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2 + 3;
  const cam = sun.shadow.camera;
  cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
  cam.near = 1; cam.far = 400;
  cam.updateProjectionMatrix();
}

const ca = new THREE.Color(), cb = new THREE.Color();
const lerpColor = (a, b, k, out) => out.copy(ca.set(a)).lerp(cb.set(b), k);

export function applyTime(t) {
  let i = 0;
  while (i < TIME_KEYS.length - 2 && t > TIME_KEYS[i + 1].t) i++;
  const a = TIME_KEYS[i], b = TIME_KEYS[i + 1];
  const k = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
  const mix = (x, y) => x + (y - x) * k;

  const u = skyMat.uniforms;
  lerpColor(a.top, b.top, k, u.top.value);
  lerpColor(a.horizon, b.horizon, k, u.horizon.value);
  lerpColor(a.ground, b.ground, k, u.ground.value);
  lerpColor(a.sun, b.sun, k, u.sunColor.value);

  // The sun swings from high in the south toward the west as the day goes on
  const elev = THREE.MathUtils.degToRad(mix(a.elev, b.elev));
  const az = 0.35 + t * 1.6;
  const dir = new THREE.Vector3(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az));
  u.sunDir.value.copy(dir);

  sun.position.copy(center).addScaledVector(dir, 150);
  sun.target.position.copy(center);
  sun.target.updateMatrixWorld();
  sun.color.copy(u.sunColor.value);
  sun.intensity = elev > 0 ? mix(a.sunI, b.sunI) : 0;

  lerpColor(a.hemiSky, b.hemiSky, k, hemi.color);
  hemi.intensity = mix(a.hemiI, b.hemiI);

  env.night = mix(a.night, b.night);
  u.night.value = env.night;
  env.name = k < 0.5 ? a.name : b.name;
  setBloom(0.22 + env.night * 0.35);
}
