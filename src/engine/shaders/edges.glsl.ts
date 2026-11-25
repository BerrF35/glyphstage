import { BAYER_GLSL } from './common.glsl';

export const EDGES_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform vec2 uTexelSize;

${BAYER_GLSL}

float sampleFeature(vec2 uv) {
  vec4 s = texture(uSceneTex, uv);
  return luma(s.rgb) * 0.65 + s.a * 0.35;
}

void main() {
  vec2 tx = uTexelSize;

  // Tight Gaussian (sigma ~ 0.85) vs wide Gaussian (sigma ~ 2.2) for DoG edge isolation
  float c = sampleFeature(vUv);
  float n = sampleFeature(vUv + vec2(0.0, tx.y));
  float s = sampleFeature(vUv - vec2(0.0, tx.y));
  float e = sampleFeature(vUv + vec2(tx.x, 0.0));
  float w = sampleFeature(vUv - vec2(tx.x, 0.0));
  float ne = sampleFeature(vUv + vec2(tx.x, tx.y));
  float nw = sampleFeature(vUv + vec2(-tx.x, tx.y));
  float se = sampleFeature(vUv + vec2(tx.x, -tx.y));
  float sw = sampleFeature(vUv + vec2(-tx.x, -tx.y));

  float gTight = (c * 4.0 + (n + s + e + w) * 2.0 + (ne + nw + se + sw)) / 16.0;

  vec2 tx2 = tx * 2.4;
  float wN = sampleFeature(vUv + vec2(0.0, tx2.y));
  float wS = sampleFeature(vUv - vec2(0.0, tx2.y));
  float wE = sampleFeature(vUv + vec2(tx2.x, 0.0));
  float wW = sampleFeature(vUv - vec2(tx2.x, 0.0));
  float wNE = sampleFeature(vUv + vec2(tx2.x, tx2.y));
  float wNW = sampleFeature(vUv + vec2(-tx2.x, tx2.y));
  float wSE = sampleFeature(vUv + vec2(tx2.x, -tx2.y));
  float wSW = sampleFeature(vUv + vec2(-tx2.x, -tx2.y));

  float gWide = (c * 2.0 + (wN + wS + wE + wW) * 1.5 + (wNE + wNW + wSE + wSW)) / 12.0;
  float dog = abs(gTight - gWide) * 2.25;

  // 3x3 Sobel directional gradient
  float gx = -nw - 2.0 * w - sw + ne + 2.0 * e + se;
  float gy = -sw - 2.0 * s - se + nw + 2.0 * n + ne;
  float sobelMag = length(vec2(gx, gy));
  float edgeMag = clamp(max(sobelMag * 0.62, dog), 0.0, 1.0);

  // Tangent angle perpendicular to gradient (horizontal, vertical, diag-up, diag-down)
  float angle = atan(gy, gx) + 1.5707963;
  float deg = mod(degrees(angle) + 360.0, 180.0);

  float dirCode = 0.0;
  if (deg < 22.5 || deg >= 157.5) {
    dirCode = 0.25;
  } else if (deg < 67.5) {
    dirCode = 0.75;
  } else if (deg < 112.5) {
    dirCode = 0.50;
  } else {
    dirCode = 1.00;
  }

  vec4 raw = texture(uSceneTex, vUv);
  fragColor = vec4(edgeMag, dirCode, luma(raw.rgb), raw.a);
}
`;
