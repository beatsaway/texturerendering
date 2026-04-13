import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { PencilLinesPass } from './PencilLinesPass.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const canvas = document.getElementById('c');
const textureSelect = document.getElementById('texture');
const groundTextureSelect = document.getElementById('groundTexture');
const effectSelect = document.getElementById('effect');
const shapeSelect = document.getElementById('shape');
const autoRotateEl = document.getElementById('autoRotate');
const hemiIntensityEl = document.getElementById('hemiIntensity');
const dirIntensityEl = document.getElementById('dirIntensity');
const fillIntensityEl = document.getElementById('fillIntensity');
const roughnessEl = document.getElementById('roughness');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.debug.checkShaderErrors = true;
renderer.debug.onShaderError = (gl, _program, glVertexShader, glFragmentShader) => {
  const vsLog = gl.getShaderInfoLog(glVertexShader) || '';
  const fsLog = gl.getShaderInfoLog(glFragmentShader) || '';
  if (vsLog.trim()) console.error('[PencilLines / vertex shader]\n', vsLog);
  if (fsLog.trim()) console.error('[PencilLines / fragment shader — GPU message]\n', fsLog);
};
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd4d0c8);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(2.8, 1.9, 3.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 0.4, 0);

// Slightly brighter ground + lower, symmetric directionals so vertical sides get more N·L than a tall "sun"
const hemi = new THREE.HemisphereLight(0xffffff, 0x6a6a74, parseFloat(hemiIntensityEl.value));
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, parseFloat(dirIntensityEl.value));
dir.position.set(5.2, 3.5, 4.2);
scene.add(dir);
const fillDir = new THREE.DirectionalLight(0xe8e4ff, parseFloat(fillIntensityEl.value));
fillDir.position.set(-5.2, 3.5, -4.2);
scene.add(fillDir);
const ambient = new THREE.AmbientLight(0xffffff, 0.055);
scene.add(ambient);

function syncLighting() {
  hemi.intensity = parseFloat(hemiIntensityEl.value);
  dir.intensity = parseFloat(dirIntensityEl.value);
  fillDir.intensity = parseFloat(fillIntensityEl.value);
}
[hemiIntensityEl, dirIntensityEl, fillIntensityEl].forEach(el => el.addEventListener('input', syncLighting));

function makeCheckerTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const n = 16;
  const cell = size / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? '#c4a574' : '#5c4a3a';
      g.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

function makeNoiseTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 40 + Math.random() * 180;
    img.data[i] = v;
    img.data[i + 1] = v * 0.85;
    img.data[i + 2] = v * 0.7;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function makeStripeTexture() {
  const w = 512, h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, '#2a5f8f');
  grd.addColorStop(0.25, '#e8b84a');
  grd.addColorStop(0.5, '#8f3a3a');
  grd.addColorStop(0.75, '#3a8f5c');
  grd.addColorStop(1, '#2a5f8f');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(0,0,0,${0.04 + (i % 3) * 0.02})`;
    g.fillRect((i * 37) % w, 0, 3, h);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeDotTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#e8ddd0';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#6b5344';
  const step = 24;
  for (let y = step / 2; y < size; y += step) {
    for (let x = step / 2; x < size; x += step) {
      const ox = (y / step % 2) * (step / 2);
      g.beginPath();
      g.arc(x + ox, y, 4 + (x % 7) * 0.3, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function makeWoodTexture() {
  const w = 512, h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const base = 90 + Math.sin(t * 20) * 15 + Math.sin(t * 50) * 8;
    g.strokeStyle = `rgb(${base + 40},${base * 0.65},${base * 0.45})`;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x < w; x += 8) {
      g.lineTo(x, y + Math.sin(x * 0.02 + y * 0.03) * 3);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.5, 2);
  return tex;
}

/** Soft, long-wavelength waves (diagonal flow). */
function makeLongWavyTexture() {
  const w = 512, h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const img = c.getContext('2d').createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t =
        Math.sin(x * 0.012 + y * 0.009) * 0.35 +
        Math.sin(x * 0.006 - y * 0.004) * 0.25 +
        0.5;
      const r = Math.floor(140 + t * 95);
      const g0 = Math.floor(120 + t * 80);
      const b = Math.floor(160 + t * 60);
      const i = (y * w + x) * 4;
      d[i] = r;
      d[i + 1] = g0;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  c.getContext('2d').putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.2, 1.2);
  return tex;
}

/** Same wave idea but posterized into distinct bands. */
function makeDiscreteWavyTexture() {
  const w = 512, h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const img = c.getContext('2d').createImageData(w, h);
  const d = img.data;
  const steps = 7;
  const palette = [
    [88, 72, 120],
    [120, 98, 150],
    [78, 110, 130],
    [95, 130, 105],
    [130, 115, 85],
    [110, 85, 95],
    [70, 95, 125]
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wv = Math.sin(x * 0.035 + y * 0.022) * 0.5 + 0.5;
      const band = Math.min(steps - 1, Math.floor(wv * steps));
      const [r, g0, b] = palette[band];
      const i = (y * w + x) * 4;
      d[i] = r;
      d[i + 1] = g0;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  c.getContext('2d').putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.5, 1.5);
  return tex;
}

/** Overlapping soft “soap bubble” highlights. */
function makeBubblyTexture() {
  const w = 512, h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#4a7ab0';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    const cx = Math.random() * w;
    const cy = Math.random() * h;
    const r = 18 + Math.random() * 55;
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    const core = `hsla(${200 + Math.random() * 40}, 85%, ${75 + Math.random() * 15}%, 0.55)`;
    const edge = 'hsla(210, 60%, 40%, 0)';
    grd.addColorStop(0, core);
    grd.addColorStop(0.55, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, edge);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'screen';
  for (let i = 0; i < 25; i++) {
    const cx = Math.random() * w;
    const cy = Math.random() * h;
    const r = 6 + Math.random() * 20;
    const grd = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.7)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.8, 1.8);
  return tex;
}

/** Watercolor / coffee-ring blotches on a light ground. */
function makeStainTexture() {
  const w = 512, h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#ebe4d8';
  g.fillRect(0, 0, w, h);
  const blot = (cx, cy, rx, ry, rot, r0, g0, b0, a0) => {
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.scale(1, ry / rx);
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    grd.addColorStop(0, `rgba(${r0},${g0},${b0},${a0})`);
    grd.addColorStop(0.55, `rgba(${r0},${g0},${b0},${a0 * 0.35})`);
    grd.addColorStop(1, 'rgba(80,55,40,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, rx, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  for (let i = 0; i < 18; i++) {
    blot(
      Math.random() * w,
      Math.random() * h,
      40 + Math.random() * 100,
      25 + Math.random() * 70,
      Math.random() * Math.PI,
      85 + Math.random() * 40,
      55 + Math.random() * 30,
      35 + Math.random() * 25,
      0.12 + Math.random() * 0.18
    );
  }
  g.strokeStyle = 'rgba(90, 60, 45, 0.18)';
  g.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const cx = Math.random() * w;
    const cy = Math.random() * h;
    const R = 25 + Math.random() * 45;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.4, 1.4);
  return tex;
}

/** Fine cross-hatch weave. */
function makeWeaveTexture() {
  const w = 512, h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#c9b896';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(70, 55, 45, 0.35)';
  g.lineWidth = 1;
  const step = 6;
  for (let x = -h; x < w + h; x += step) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + h, h);
    g.stroke();
  }
  g.strokeStyle = 'rgba(55, 50, 70, 0.28)';
  for (let x = 0; x < w + h; x += step) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x - h, h);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

const textureFactories = {
  solid: () => null,
  checker: makeCheckerTexture,
  noise: makeNoiseTexture,
  stripes: makeStripeTexture,
  dots: makeDotTexture,
  wood: makeWoodTexture,
  longWavy: makeLongWavyTexture,
  discreteWavy: makeDiscreteWavyTexture,
  bubbly: makeBubblyTexture,
  stain: makeStainTexture,
  weave: makeWeaveTexture
};

/** Everyday water-bottle silhouette (revolved profile, no model file). */
function createWaterBottleGeometry() {
  const pts = [
    new THREE.Vector2(0.02, 0),
    new THREE.Vector2(0.36, 0),
    new THREE.Vector2(0.39, 0.045),
    new THREE.Vector2(0.39, 0.5),
    new THREE.Vector2(0.2, 0.62),
    new THREE.Vector2(0.11, 0.74),
    new THREE.Vector2(0.1, 0.795),
    new THREE.Vector2(0.105, 0.84),
    // Outer lip — slight flare, then rolled top edge
    new THREE.Vector2(0.112, 0.872),
    new THREE.Vector2(0.118, 0.894),
    // Top annulus: step inward so the rim has visible thickness (lid / mouth ring)
    new THREE.Vector2(0.082, 0.894),
    // Inner wall below the lip (opening stays open)
    new THREE.Vector2(0.086, 0.854),
    new THREE.Vector2(0.089, 0.828)
  ];
  return new THREE.LatheGeometry(pts, 52);
}

/** Procedural BufferGeometry only — nothing loaded from disk. */
function createShapeGeometry(type) {
  switch (type) {
    case 'bottle':
      return createWaterBottleGeometry();
    case 'torusKnot':
      return new THREE.TorusKnotGeometry(0.65, 0.22, 180, 24, 2, 3);
    case 'box':
      return new THREE.BoxGeometry(1.15, 1.15, 1.15);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.55, 0.55, 1.35, 40);
    case 'cone':
      return new THREE.ConeGeometry(0.65, 1.35, 40);
    case 'pyramid':
      return new THREE.ConeGeometry(0.75, 1.25, 4);
    case 'hexPrism':
      return new THREE.CylinderGeometry(0.55, 0.55, 1.25, 6);
    case 'octahedron':
      return new THREE.OctahedronGeometry(0.88);
    case 'tetrahedron':
      return new THREE.TetrahedronGeometry(0.98);
    case 'dodecahedron':
      return new THREE.DodecahedronGeometry(0.78);
    case 'torus':
      return new THREE.TorusGeometry(0.58, 0.2, 24, 64);
    case 'capsule':
      return new THREE.CapsuleGeometry(0.42, 0.85, 8, 16);
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(0.82);
    default:
      return createWaterBottleGeometry();
  }
}

/** Kenney Pirate Kit — OBJ in `models/kenney-pirate/` (see License.txt). */
const KENNEY_MODEL_BASE = 'models/kenney-pirate';
const EXTERNAL_KENNEY = {
  'kenney-bottle': 'bottle.obj',
  'kenney-bottle-large': 'bottle-large.obj',
  'kenney-chest': 'chest.obj',
  'kenney-crate': 'crate.obj',
  'kenney-cannon': 'cannon.obj',
  'kenney-cannon-ball': 'cannon-ball.obj',
  'kenney-ship-small': 'ship-small.obj',
  'kenney-ship-pirate-small': 'ship-pirate-small.obj',
  'kenney-boat-row-small': 'boat-row-small.obj',
  'kenney-rocks-a': 'rocks-a.obj',
  'kenney-tool-shovel': 'tool-shovel.obj',
  'kenney-palm-straight': 'palm-straight.obj',
  'kenney-flag-pirate': 'flag-pirate.obj',
  'kenney-tower-complete-small': 'tower-complete-small.obj'
};

const objLoader = new THREE.OBJLoader();

function ensureGeometryAttributesForMerge(geometry) {
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const pos = geometry.attributes.position;
  if (pos && !geometry.attributes.uv) {
    const uvs = new Float32Array(pos.count * 2);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }
}

function normalizeGeometryToMaxDimension(geometry, targetMax = 1.2) {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const size = new THREE.Vector3();
  bb.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
  const s = targetMax / maxDim;
  geometry.scale(s, s, s);
  geometry.computeBoundingBox();
}

async function loadKenneyMergedObj(filename) {
  const url = `${KENNEY_MODEL_BASE}/${filename}`;
  const root = await objLoader.loadAsync(url);
  const geometries = [];
  root.updateWorldMatrix(true, true);
  root.traverse((child) => {
    if (child.isMesh && child.geometry) {
      const g = child.geometry.clone();
      g.applyMatrix4(child.matrixWorld);
      ensureGeometryAttributesForMerge(g);
      geometries.push(g);
    }
  });
  if (!geometries.length) throw new Error(`No mesh in ${url}`);
  const merged = mergeGeometries(geometries, false);
  for (const g of geometries) g.dispose();
  if (!merged) throw new Error(`mergeGeometries failed for ${url}`);
  merged.computeVertexNormals();
  normalizeGeometryToMaxDimension(merged, 1.2);
  return merged;
}

const material = new THREE.MeshStandardMaterial({
  color: 0xc9b8a4,
  roughness: parseFloat(roughnessEl.value),
  metalness: 0.08
});
roughnessEl.addEventListener('input', () => {
  material.roughness = parseFloat(roughnessEl.value);
});
const mesh = new THREE.Mesh(createShapeGeometry(shapeSelect.value), material);
scene.add(mesh);

function placeMeshOnGround() {
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  mesh.position.set(0, -bb.min.y + 0.02, 0);
  const cy = (bb.min.y + bb.max.y) / 2;
  controls.target.set(0, mesh.position.y + cy, 0);
}

let shapeLoadGeneration = 0;

function isExternalKenneyShape(type) {
  return Object.prototype.hasOwnProperty.call(EXTERNAL_KENNEY, type);
}

function applyShape(type) {
  if (isExternalKenneyShape(type)) {
    const gen = ++shapeLoadGeneration;
    const file = EXTERNAL_KENNEY[type];
    loadKenneyMergedObj(file)
      .then((geo) => {
        if (gen !== shapeLoadGeneration || shapeSelect.value !== type) {
          geo.dispose();
          return;
        }
        const prev = mesh.geometry;
        mesh.geometry = geo;
        prev.dispose();
        mesh.rotation.set(0, 0, 0);
        placeMeshOnGround();
      })
      .catch((err) => console.error('[Kenney OBJ]', file, err));
    return;
  }
  shapeLoadGeneration += 1;
  const prev = mesh.geometry;
  mesh.geometry = createShapeGeometry(type);
  prev.dispose();
  mesh.rotation.set(0, 0, 0);
  placeMeshOnGround();
}

shapeSelect.addEventListener('change', () => applyShape(shapeSelect.value));
placeMeshOnGround();

const groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0.03 });
const ground = new THREE.Mesh(new THREE.CircleGeometry(4, 48), groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

let currentGroundMap = null;

function applyGroundTexture(key) {
  if (currentGroundMap) {
    currentGroundMap.dispose();
    currentGroundMap = null;
  }
  const factory = textureFactories[key];
  currentGroundMap = factory ? factory() : null;
  groundMat.map = currentGroundMap;
  groundMat.color.set(currentGroundMap ? 0xffffff : 0xb8b4ac);
  groundMat.needsUpdate = true;
}

groundTextureSelect.addEventListener('change', () => applyGroundTexture(groundTextureSelect.value));

let currentMap = null;

/** When switching texture, sliders snap to these defaults (tuned per pattern). */
const TEXTURE_SLIDER_PRESETS = {
  solid: { hemiIntensity: 1.05, dirIntensity: 1.2, fillIntensity: 0.45, roughness: 0.65 },
  checker: { hemiIntensity: 0, dirIntensity: 1, fillIntensity: 0.38, roughness: 0.56 },
  noise: { hemiIntensity: 1.6, dirIntensity: 1.95, fillIntensity: 0.38, roughness: 0.56 },
  stripes: { hemiIntensity: 1.6, dirIntensity: 2.2, fillIntensity: 0, roughness: 1 },
  dots: { hemiIntensity: 0, dirIntensity: 1.3, fillIntensity: 0.36, roughness: 0.58 },
  wood: { hemiIntensity: 1.6, dirIntensity: 1.3, fillIntensity: 0.36, roughness: 0.58 },
  longWavy: { hemiIntensity: 1.6, dirIntensity: 2.1, fillIntensity: 0.84, roughness: 1 },
  discreteWavy: { hemiIntensity: 1.5, dirIntensity: 2.0, fillIntensity: 0.54, roughness: 0.9 },
  bubbly: { hemiIntensity: 1.2, dirIntensity: 1.45, fillIntensity: 0.48, roughness: 0.62 },
  stain: { hemiIntensity: 1.35, dirIntensity: 1.25, fillIntensity: 0.45, roughness: 0.68 },
  weave: { hemiIntensity: 1.5, dirIntensity: 1.3, fillIntensity: 0.38, roughness: 0.56 }
};

const DEFAULT_TEXTURE_SLIDER_PRESET = { hemiIntensity: 1, dirIntensity: 1.2, fillIntensity: 0.4, roughness: 0.6 };

function applyTextureSliderPreset(key) {
  const p = TEXTURE_SLIDER_PRESETS[key] ?? DEFAULT_TEXTURE_SLIDER_PRESET;
  hemiIntensityEl.value = String(p.hemiIntensity);
  dirIntensityEl.value = String(p.dirIntensity);
  fillIntensityEl.value = String(p.fillIntensity);
  roughnessEl.value = String(p.roughness);
  syncLighting();
  material.roughness = parseFloat(roughnessEl.value);
}

function applyTexture(key) {
  if (currentMap) {
    currentMap.dispose();
    currentMap = null;
  }
  const factory = textureFactories[key];
  currentMap = factory ? factory() : null;
  material.map = currentMap;
  material.color.set(currentMap ? 0xffffff : 0xc9b8a4);
  material.needsUpdate = true;
}

textureSelect.addEventListener('change', () => {
  applyTextureSliderPreset(textureSelect.value);
  applyTexture(textureSelect.value);
});
applyTextureSliderPreset(textureSelect.value);
applyTexture(textureSelect.value);
applyGroundTexture(groundTextureSelect.value);

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const pencilPass = new PencilLinesPass({
  scene,
  camera,
  width: window.innerWidth,
  height: window.innerHeight
});
composer.addPass(pencilPass);

function usePencil() {
  return effectSelect.value === 'pencil';
}

effectSelect.addEventListener('change', () => {
  pencilPass.enabled = usePencil();
});
pencilPass.enabled = usePencil();

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
}
window.addEventListener('resize', onResize);

function logUiStateToConsole() {
  const texOpt = textureSelect.options[textureSelect.selectedIndex];
  const gndOpt = groundTextureSelect.options[groundTextureSelect.selectedIndex];
  console.log('[scene UI]', {
    texture: { value: textureSelect.value, label: texOpt?.text ?? '' },
    groundTexture: { value: groundTextureSelect.value, label: gndOpt?.text ?? '' },
    effect: effectSelect.value,
    shape: shapeSelect.value,
    autoRotate: autoRotateEl.checked,
    hemiIntensity: parseFloat(hemiIntensityEl.value),
    dirIntensity: parseFloat(dirIntensityEl.value),
    fillIntensity: parseFloat(fillIntensityEl.value),
    roughness: parseFloat(roughnessEl.value)
  });
}

function randRangeToStep(el) {
  const min = parseFloat(el.min);
  const max = parseFloat(el.max);
  const step = parseFloat(el.step);
  const s = Number.isFinite(step) && step > 0 ? step : 0.01;
  const steps = [];
  for (let v = min; v <= max + s * 0.25; v += s) {
    steps.push(Math.min(max, +v.toFixed(6)));
  }
  if (!steps.length) steps.push(min);
  el.value = String(steps[Math.floor(Math.random() * steps.length)]);
}

function pickRandomSelectOption(sel) {
  const i = Math.floor(Math.random() * sel.options.length);
  sel.selectedIndex = i;
}

function randomizeAllHeaderControls() {
  pickRandomSelectOption(textureSelect);
  pickRandomSelectOption(groundTextureSelect);
  pickRandomSelectOption(effectSelect);
  pickRandomSelectOption(shapeSelect);
  autoRotateEl.checked = Math.random() < 0.5;
  randRangeToStep(hemiIntensityEl);
  randRangeToStep(dirIntensityEl);
  randRangeToStep(fillIntensityEl);
  randRangeToStep(roughnessEl);
  syncLighting();
  material.roughness = parseFloat(roughnessEl.value);
  applyTexture(textureSelect.value);
  applyGroundTexture(groundTextureSelect.value);
  pencilPass.enabled = usePencil();
  applyShape(shapeSelect.value);
}

function uiTargetIsTyping(t) {
  const tag = t && t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable;
}

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (uiTargetIsTyping(t)) return;
  if (e.code === 'Space') {
    e.preventDefault();
    randomizeAllHeaderControls();
    return;
  }
  if (e.code === 'KeyC') logUiStateToConsole();
});

const clock = new THREE.Clock();

function tick() {
  const dt = clock.getDelta();
  controls.update();
  if (autoRotateEl.checked) {
    mesh.rotation.y += dt * 0.15;
  }

  composer.render();
  requestAnimationFrame(tick);
}

tick();
