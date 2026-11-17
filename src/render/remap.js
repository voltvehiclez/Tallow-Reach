// The edge-compression lens. The flight scene renders into a wider off-screen
// image (the "source"), then a full-screen quad re-draws it through the curve
// from remapmath.js. The frame's edge always lands exactly at REMAP.edge
// degrees off axis, and the skybox (drawn in the same source) is corrected by
// the same amount — one pass fixes world and sky together, so they can never
// drift apart.
//
// The source is an ordinary rectilinear render with enough reach for the
// lens's inverse-projected frame edge on both axes (aspect-adaptive; portrait
// frames grow it too). It is drawn at a
// resolution that keeps the centre texel density equal to a plain 70-degree
// render: ~1.3x the pixels at the default edge (38°), up to ~2.3x for the
// wide 46.5° preset. Render targets are recreated automatically on resize.
// MSAA applies where WebGL2 is available and pixel ratio is 1; otherwise the
// supersampled source carries the edge quality.
//
// `REMAP.on = false` in data/camera.js restores the stock pipeline exactly:
// main.js then renders the scene straight to the canvas and never builds any
// of this.

import * as THREE from "three";
import { renderer, scene, camera } from "./scene.js";
import { REMAP } from "../data/camera.js";
import { tanDeg, sourceHalfTanB, axisNorms } from "./remapmath.js";

let rt = null;
let srcCam = null;
let quadScene = null;
let quadCam = null;
let quadMat = null;
const STOCK_HALF_DEG = 35; // the stock 70-degree camera's half-angle; reference for texel density
const _size = new THREE.Vector2();
let outW = 0,
  outH = 0,
  tanB = 1;

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Keep solveW and the tan(alpha/2) rebuild in step with remapmath.alphaFromU.
const FRAG = `
uniform sampler2D tScene;
uniform float strength;
uniform float normX;
uniform float normY;
uniform float tanB;
uniform float aspect;
varying vec2 vUv;

float fSign(float m, float uT, float s) {
  return 2.0 * s * m * m * m - uT * m * m - 2.0 * m + uT;
}

float solveW(float uT, float s) {
  float a = -0.85;
  float b = 0.85; // covers axis half-angles up to ~80 degrees (any monitor)
  bool faNegative = fSign(a, uT, s) < 0.0;
  for (int i = 0; i < 15; i++) {
    float m = (a + b) * 0.5;
    bool fNegative = fSign(m, uT, s) < 0.0;
    if (fNegative == faNegative) a = m; else b = m;
  }
  return (a + b) * 0.5;
}

float tanAngle(float u, float norm) {
  float uT = u * norm;
  float w = solveW(uT, strength);
  return 2.0 * w / max(1.0e-6, 1.0 - w * w);
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  float tx = tanAngle(ndc.x, normX);
  float ty = tanAngle(ndc.y, normY);
  vec2 uv = 0.5 + 0.5 * vec2(tx / (tanB * aspect), ty / tanB);
  gl_FragColor = texture2D(tScene, clamp(uv, 0.0, 1.0));
}
`;

function buildQuad() {
  quadMat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: rt.texture },
      strength: { value: REMAP.strength },
      normX: { value: 1 },
      normY: { value: 1 },
      tanB: { value: 1 },
      aspect: { value: 1 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
  });
  quadScene = new THREE.Scene();
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat));
  quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
}

function ensureTarget() {
  renderer.getDrawingBufferSize(_size);
  if (rt && _size.x === outW && _size.y === outH) return;

  if (rt) rt.dispose();
  const aspect = _size.x / _size.y;
  tanB = sourceHalfTanB(aspect);
  // Keep the centre texel density equal to a plain 70-degree render: scale the
  // source by tanB / tan(base half-angle) on both axes.
  const scale = tanB / tanDeg(STOCK_HALF_DEG);
  const w = Math.max(2, Math.ceil(_size.x * scale));
  const h = Math.max(2, Math.ceil(_size.y * scale));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const Target = renderer.capabilities.isWebGL2 && dpr < 2
    ? THREE.WebGLMultisampleRenderTarget
    : THREE.WebGLRenderTarget;
  rt = new Target(w, h, { depthBuffer: true, stencilBuffer: false });

  if (!srcCam) srcCam = new THREE.PerspectiveCamera(2 * Math.atan(tanB) * 180 / Math.PI, aspect, camera.near, camera.far);
  outW = _size.x;
  outH = _size.y;
  if (!quadScene) buildQuad();
  const norms = axisNorms(aspect);
  quadMat.uniforms.tScene.value = rt.texture;
  quadMat.uniforms.tanB.value = tanB;
  quadMat.uniforms.aspect.value = aspect;
  quadMat.uniforms.strength.value = REMAP.strength;
  quadMat.uniforms.normX.value = norms.nx;
  quadMat.uniforms.normY.value = norms.ny;
}

/**
 * Draw the flight frame. With REMAP off this is exactly `renderer.render`.
 * Called by main.js for the flying (and paused) paths only — the title screen
 * and the Outfitting viewer keep their own renderers.
 */
export function renderFlightFrame() {
  if (!REMAP.on) {
    renderer.render(scene, camera);
    return;
  }
  ensureTarget();

  const aspect = outW / outH;
  srcCam.aspect = aspect;
  srcCam.fov = (2 * Math.atan(tanB) * 180) / Math.PI;
  srcCam.near = camera.near;
  srcCam.far = camera.far;
  srcCam.position.copy(camera.position);
  srcCam.quaternion.copy(camera.quaternion);
  srcCam.updateProjectionMatrix();

  renderer.setRenderTarget(rt);
  renderer.render(scene, srcCam);
  renderer.setRenderTarget(null);
  renderer.render(quadScene, quadCam);
}
