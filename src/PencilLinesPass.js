import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * Fragment is structurally identical to three/addons/shaders/SobelOperatorShader.js
 * (which ships with Three and compiles everywhere). We only add uNormals taps inline —
 * no custom noise/sin/fbm, no sampler-in-function-args, no mat3 beyond the stock Sobel.
 */
const pencilVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const pencilFragmentShader = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D uNormals;
uniform vec2 resolution;

varying vec2 vUv;

void main() {
  vec2 texel = vec2(1.0 / resolution.x, 1.0 / resolution.y);

  const mat3 Gx = mat3(-1, -2, -1, 0, 0, 0, 1, 2, 1);
  const mat3 Gy = mat3(-1, 0, 1, -2, 0, 2, -1, 0, 1);

  float tx0y0 = texture2D(tDiffuse, vUv + texel * vec2(-1.0, -1.0)).r + dot(texture2D(uNormals, vUv + texel * vec2(-1.0, -1.0)).rgb, vec3(0.299, 0.587, 0.114)) * 0.25;
  float tx0y1 = texture2D(tDiffuse, vUv + texel * vec2(-1.0, 0.0)).r + dot(texture2D(uNormals, vUv + texel * vec2(-1.0, 0.0)).rgb, vec3(0.299, 0.587, 0.114)) * 0.25;
  float tx0y2 = texture2D(tDiffuse, vUv + texel * vec2(-1.0, 1.0)).r + dot(texture2D(uNormals, vUv + texel * vec2(-1.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114)) * 0.25;
  float tx1y0 = texture2D(tDiffuse, vUv + texel * vec2(0.0, -1.0)).r + dot(texture2D(uNormals, vUv + texel * vec2(0.0, -1.0)).rgb, vec3(0.299, 0.587, 0.114)) * 0.25;
  float tx1y1 = texture2D(tDiffuse, vUv + texel * vec2(0.0, 0.0)).r + dot(texture2D(uNormals, vUv + texel * vec2(0.0, 0.0)).rgb, vec3(0.299, 0.587, 0.114)) * 0.25;
  float tx1y2 = texture2D(tDiffuse, vUv + texel * vec2(0.0, 1.0)).r + dot(texture2D(uNormals, vUv + texel * vec2(0.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114)) * 0.25;
  float tx2y0 = texture2D(tDiffuse, vUv + texel * vec2(1.0, -1.0)).r + dot(texture2D(uNormals, vUv + texel * vec2(1.0, -1.0)).rgb, vec3(0.299, 0.587, 0.114)) * 0.25;
  float tx2y1 = texture2D(tDiffuse, vUv + texel * vec2(1.0, 0.0)).r + dot(texture2D(uNormals, vUv + texel * vec2(1.0, 0.0)).rgb, vec3(0.299, 0.587, 0.114)) * 0.25;
  float tx2y2 = texture2D(tDiffuse, vUv + texel * vec2(1.0, 1.0)).r + dot(texture2D(uNormals, vUv + texel * vec2(1.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114)) * 0.25;

  float valueGx =
    Gx[0][0] * tx0y0 + Gx[1][0] * tx1y0 + Gx[2][0] * tx2y0 +
    Gx[0][1] * tx0y1 + Gx[1][1] * tx1y1 + Gx[2][1] * tx2y1 +
    Gx[0][2] * tx0y2 + Gx[1][2] * tx1y2 + Gx[2][2] * tx2y2;

  float valueGy =
    Gy[0][0] * tx0y0 + Gy[1][0] * tx1y0 + Gy[2][0] * tx2y0 +
    Gy[0][1] * tx0y1 + Gy[1][1] * tx1y1 + Gy[2][1] * tx2y1 +
    Gy[0][2] * tx0y2 + Gy[1][2] * tx1y2 + Gy[2][2] * tx2y2;

  float G = sqrt((valueGx * valueGx) + (valueGy * valueGy));
  G = clamp(G, 0.0, 1.0);

  float edge = smoothstep(0.05, 0.18, G);
  vec3 lineColor = vec3(0.32, 0.12, 0.2);
  vec3 paper = vec3(0.98, 0.96, 0.93);
  vec4 scene = texture2D(tDiffuse, vUv);
  vec3 base = mix(paper, scene.rgb, 0.28);
  vec3 outRgb = mix(base, lineColor, edge);

  gl_FragColor = vec4(outRgb, 1.0);
}
`;

class PencilLinesMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      name: 'PencilLines',
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        uNormals: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) }
      },
      vertexShader: pencilVertexShader,
      fragmentShader: pencilFragmentShader
    });
  }
}

export class PencilLinesPass extends Pass {
  constructor({ scene, camera, width, height }) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.normalMaterial = new THREE.MeshNormalMaterial();

    this.normalBuffer = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: true,
      stencilBuffer: false
    });
    this.normalBuffer.texture.format = THREE.RGBAFormat;
    this.normalBuffer.texture.type = THREE.UnsignedByteType;
    this.normalBuffer.texture.minFilter = THREE.NearestFilter;
    this.normalBuffer.texture.magFilter = THREE.NearestFilter;
    this.normalBuffer.texture.generateMipmaps = false;

    this.material = new PencilLinesMaterial();
    this.material.uniforms.resolution.value.set(width, height);
    this.fsQuad = new FullScreenQuad(this.material);
  }

  setSize(width, height) {
    this.normalBuffer.setSize(width, height);
    this.material.uniforms.resolution.value.set(width, height);
  }

  dispose() {
    this.normalBuffer.dispose();
    this.normalMaterial.dispose();
    this.material.dispose();
  }

  render(renderer, writeBuffer, readBuffer /* , deltaTime, maskActive */) {
    renderer.setRenderTarget(this.normalBuffer);
    renderer.clear();
    const prevOverride = this.scene.overrideMaterial;
    this.scene.overrideMaterial = this.normalMaterial;
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = prevOverride;

    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    this.material.uniforms.uNormals.value = this.normalBuffer.texture;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
      this.fsQuad.render(renderer);
    }
  }
}
