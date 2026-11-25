/**
 * Shared GPU Primitives & Color-Space Helpers:
 * - Kubelka-Munk spectral pigment mixing (derived from Ronald van Wijnen's spectral.js)
 * - Björn Ottosson OKLab perceptual color space (used in Dylan Ebert's texel-splatting)
 * - CIELAB L* lightness (used in Garrett Gunnell's AcerolaFX)
 * - Kyprianidis Smoothed Structure Tensor (jkyprian/polyakf sst.glsl)
 * - Kang, Lee & Chui Bilateral Edge Tangent Flow (NPAR 2007 / SSARCandy Coherent-Line-Drawing)
 * - Rong & Tan Jump Flooding Algorithm Voronoi (Euclidean + Hausner ETF-aligned L1 Manhattan)
 * - Hillis-Steele horizontal prefix sum for 60fps GPU FM Squiggle phase integration
 */

export const MEDIA_COLOR_HELPERS = `
float srgbToLinearCh(float x) {
  return (x <= 0.04045) ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4);
}
float linearToSrgbCh(float x) {
  x = max(0.0, x);
  return (x <= 0.0031308) ? x * 12.92 : 1.055 * pow(x, 1.0 / 2.4) - 0.055;
}
vec3 srgbToLinear(vec3 c) {
  return vec3(srgbToLinearCh(c.r), srgbToLinearCh(c.g), srgbToLinearCh(c.b));
}
vec3 linearToSrgb(vec3 c) {
  return clamp(vec3(linearToSrgbCh(c.r), linearToSrgbCh(c.g), linearToSrgbCh(c.b)), 0.0, 1.0);
}

float luma709(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// CIELAB L* in [0, 1] (Garrett Gunnell AcerolaFX_DifferenceOfGaussians.fx)
float rgbToCielabL(vec3 srgb) {
  vec3 lin = srgbToLinear(clamp(srgb, 0.0, 1.0));
  float y = dot(lin, vec3(0.2126729, 0.7151522, 0.0721750));
  float f = (y > 0.008856) ? pow(y, 1.0 / 3.0) : (7.787 * y + 16.0 / 116.0);
  return clamp((116.0 * f - 16.0) / 100.0, 0.0, 1.0);
}

// Björn Ottosson OKLab <-> sRGB (exact matrices from Dylan Ebert's texel-splatting src/oklab.ts)
vec3 srgbToOklab(vec3 c) {
  vec3 lin = srgbToLinear(clamp(c, 0.0, 1.0));
  float l = 0.4122214708 * lin.r + 0.5363325363 * lin.g + 0.0514459929 * lin.b;
  float m = 0.2119034982 * lin.r + 0.6806995451 * lin.g + 0.1073969566 * lin.b;
  float s = 0.0883024619 * lin.r + 0.2817188376 * lin.g + 0.6299787005 * lin.b;
  float l_ = pow(max(0.0, l), 1.0 / 3.0);
  float m_ = pow(max(0.0, m), 1.0 / 3.0);
  float s_ = pow(max(0.0, s), 1.0 / 3.0);
  return vec3(
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
  );
}

vec3 oklabToSrgb(vec3 lab) {
  float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  float l = l_ * l_ * l_;
  float m = m_ * m_ * m_;
  float s = s_ * s_ * s_;
  vec3 lin = vec3(
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
  return linearToSrgb(lin);
}

// Fast 6-band Kubelka-Munk spectral pigment mixer (distilled from rvanwijnen/spectral.js):
// Decomposes linear sRGB into smooth physical reflectance bands, mixes linearly in K/S = (1-R)^2/(2R),
// and inverts back so Yellow + Blue yields luminous emerald green instead of muddy RGB gray.
void rgbToKm6(vec3 lrgb, out float R[6]) {
  float w = min(lrgb.r, min(lrgb.g, lrgb.b));
  vec3 d = lrgb - w;
  float c = min(d.g, d.b);
  float m = min(d.r, d.b);
  float y = min(d.r, d.g);
  float r = max(0.0, d.r - max(d.g, d.b));
  float g = max(0.0, d.g - max(d.r, d.b));
  float b = max(0.0, d.b - max(d.r, d.g));
  // 6 representative visible bands: 430nm, 480nm, 530nm, 575nm, 620nm, 670nm
  R[0] = clamp(w + c*0.97 + m*0.92 + y*0.04 + r*0.02 + g*0.03 + b*0.96, 0.004, 0.996);
  R[1] = clamp(w + c*0.99 + m*0.43 + y*0.24 + r*0.01 + g*0.38 + b*0.76, 0.004, 0.996);
  R[2] = clamp(w + c*0.99 + m*0.03 + y*0.95 + r*0.01 + g*0.97 + b*0.05, 0.004, 0.996);
  R[3] = clamp(w + c*0.89 + m*0.20 + y*0.98 + r*0.11 + g*0.79 + b*0.01, 0.004, 0.996);
  R[4] = clamp(w + c*0.06 + m*0.91 + y*0.98 + r*0.94 + g*0.09 + b*0.01, 0.004, 0.996);
  R[5] = clamp(w + c*0.02 + m*0.97 + y*0.98 + r*0.98 + g*0.03 + b*0.02, 0.004, 0.996);
}

vec3 km6ToLinearRgb(float R[6]) {
  // Smooth band reconstruction calibrated to unity on white (R = 1)
  vec3 lrgb = vec3(
    R[3] * 0.14 + R[4] * 0.46 + R[5] * 0.40,
    R[1] * 0.14 + R[2] * 0.56 + R[3] * 0.30,
    R[0] * 0.56 + R[1] * 0.38 + R[2] * 0.06
  );
  return clamp(lrgb, 0.0, 1.0);
}

vec3 spectralMix(vec3 srgbA, vec3 srgbB, float t) {
  vec3 linA = srgbToLinear(clamp(srgbA, 0.0, 1.0));
  vec3 linB = srgbToLinear(clamp(srgbB, 0.0, 1.0));
  float RA[6];
  float RB[6];
  float RM[6];
  rgbToKm6(linA, RA);
  rgbToKm6(linB, RB);
  for (int i = 0; i < 6; i++) {
    float ksA = (1.0 - RA[i]) * (1.0 - RA[i]) / (2.0 * RA[i]);
    float ksB = (1.0 - RB[i]) * (1.0 - RB[i]) / (2.0 * RB[i]);
    float ks = mix(ksA, ksB, t);
    RM[i] = clamp(1.0 + ks - sqrt(max(0.0, ks * ks + 2.0 * ks)), 0.0, 1.0);
  }
  return linearToSrgb(km6ToLinearRgb(RM));
}

// Spectral subtractive overprint (for Risograph & glazed watercolor washes)
vec3 spectralOverprint(vec3 baseSrgb, vec3 inkSrgb, float coverage) {
  if (coverage <= 0.001) return baseSrgb;
  vec3 linBase = srgbToLinear(clamp(baseSrgb, 0.0, 1.0));
  vec3 linInk = srgbToLinear(clamp(inkSrgb, 0.0, 1.0));
  float RBase[6];
  float RInk[6];
  float ROut[6];
  rgbToKm6(linBase, RBase);
  rgbToKm6(linInk, RInk);
  for (int i = 0; i < 6; i++) {
    float ksBase = (1.0 - RBase[i]) * (1.0 - RBase[i]) / (2.0 * RBase[i]);
    float ksInk = (1.0 - RInk[i]) * (1.0 - RInk[i]) / (2.0 * RInk[i]);
    float ks = ksBase + ksInk * coverage;
    ROut[i] = clamp(1.0 + ks - sqrt(max(0.0, ks * ks + 2.0 * ks)), 0.0, 1.0);
  }
  return linearToSrgb(km6ToLinearRgb(ROut));
}
`;

// Pass 1 of Bilateral ETF (Kang, Lee & Chui NPAR 2007 / SSARCandy Coherent-Line-Drawing):
// Computes initial Sobel gradient tangent (tx, ty), gradient magnitude, and structure tensor anisotropy.
export const ETF_INIT_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform vec2 uTexelSize;

${MEDIA_COLOR_HELPERS}

void main() {
  vec2 d = uTexelSize;
  // Rotational-symmetry 3x3 Sobel on RGB + depth cue for clean 3D silhouettes
  vec3 c00 = texture(uSceneTex, vUv + vec2(-d.x, -d.y)).rgb;
  vec3 c10 = texture(uSceneTex, vUv + vec2( 0.0, -d.y)).rgb;
  vec3 c20 = texture(uSceneTex, vUv + vec2( d.x, -d.y)).rgb;
  vec3 c01 = texture(uSceneTex, vUv + vec2(-d.x,  0.0)).rgb;
  vec3 c21 = texture(uSceneTex, vUv + vec2( d.x,  0.0)).rgb;
  vec3 c02 = texture(uSceneTex, vUv + vec2(-d.x,  d.y)).rgb;
  vec3 c12 = texture(uSceneTex, vUv + vec2( 0.0,  d.y)).rgb;
  vec3 c22 = texture(uSceneTex, vUv + vec2( d.x,  d.y)).rgb;

  vec3 gx = (-3.0 * c00 - 10.0 * c01 - 3.0 * c02 + 3.0 * c20 + 10.0 * c21 + 3.0 * c22) / 16.0;
  vec3 gy = (-3.0 * c00 - 10.0 * c10 - 3.0 * c20 + 3.0 * c02 + 10.0 * c12 + 3.0 * c22) / 16.0;

  // Depth gradient reinforces geometric boundaries even across flat-lit surfaces
  float zL = texture(uSceneTex, vUv - vec2(d.x, 0.0)).a;
  float zR = texture(uSceneTex, vUv + vec2(d.x, 0.0)).a;
  float zD = texture(uSceneTex, vUv - vec2(0.0, d.y)).a;
  float zU = texture(uSceneTex, vUv + vec2(0.0, d.y)).a;
  float dzx = (zR - zL) * 0.85;
  float dzy = (zU - zD) * 0.85;

  // Structure tensor components E, F, G (Kyprianidis sst.glsl)
  float E = dot(gx, gx) + dzx * dzx;
  float F = dot(gx, gy) + dzx * dzy;
  float G = dot(gy, gy) + dzy * dzy;

  float disc = sqrt(max(0.0, (E - G) * (E - G) + 4.0 * F * F));
  float lambda1 = 0.5 * (E + G + disc);
  float lambda2 = 0.5 * (E + G - disc);

  // Minor eigenvector = tangent along edge (orthogonal to gradient)
  vec2 v = vec2(lambda1 - E, -F);
  float vLen = length(v);
  vec2 tangent = (vLen > 1e-5) ? (v / vLen) : vec2(0.0, 1.0);

  float mag = sqrt(max(0.0, lambda1));
  float aniso = (lambda1 + lambda2 > 1e-5) ? clamp((lambda1 - lambda2) / (lambda1 + lambda2), 0.0, 1.0) : 0.0;

  // Pack: rg = tangent [-1,1] (in RGBA16F), b = gradient magnitude, a = anisotropy coherence
  fragColor = vec4(tangent, mag, aniso);
}
`;

// Pass 2 & 3 of Bilateral ETF (Kang, Lee & Chui NPAR 2007 exact bilateral tangent smoothing):
// Preserves crisp 90-degree architectural corners instead of rounding them.
export const ETF_BILATERAL_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uEtfTex;
uniform vec2 uTexelSize;
uniform int uAxis; // 0 = horizontal pass, 1 = vertical pass (separable bilateral ETF)

void main() {
  vec4 center = texture(uEtfTex, vUv);
  vec2 tc = center.xy;
  float gc = center.z;

  vec2 sumT = vec2(0.0);
  float sumAniso = 0.0;
  float sumW = 0.0;

  vec2 dir = (uAxis == 0) ? vec2(uTexelSize.x, 0.0) : vec2(0.0, uTexelSize.y);
  const int RADIUS = 4;

  for (int i = -RADIUS; i <= RADIUS; i++) {
    vec4 s = texture(uEtfTex, vUv + dir * float(i));
    vec2 ty = s.xy;
    float gy = s.z;

    // Spatial Gaussian falloff
    float ws = exp(-0.18 * float(i * i));
    // Magnitude weight wm = 0.5 * (1 + tanh(eta * (gy - gc))) (Kang et al. Eq. 2)
    float wm = 0.5 * (1.0 + tanh(2.5 * (gy - gc)));
    // Sign alignment phi & direction weight wd = |dot(tc, ty)| (Kang et al. Eq. 3-4)
    float dp = dot(tc, ty);
    float phi = (dp >= 0.0) ? 1.0 : -1.0;
    float wd = abs(dp);

    float w = ws * wm * wd;
    sumT += phi * ty * w;
    sumAniso += s.w * ws;
    sumW += ws;
  }

  float tLen = length(sumT);
  vec2 tNew = (tLen > 1e-5) ? (sumT / tLen) : tc;
  float aniso = sumAniso / max(1e-5, sumW);

  fragColor = vec4(tNew, gc, aniso);
}
`;

// Jump Flooding Voronoi Initialization (Rong & Tan I3D 2006)
// Places organic jittered grid seeds (optionally importance-weighted by scene darkness for Stippling!)
export const JFA_INIT_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform vec2 uResolution;
uniform float uCellPitch;
uniform float uTime;
uniform int uImportanceWeight; // 0 = uniform jittered (stained glass/mosaic), 1 = luma-weighted (stipple)

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

void main() {
  vec2 px = floor(gl_FragCoord.xy);
  float pitch = max(4.0, uCellPitch);
  vec2 cell = floor(px / pitch);
  vec2 rnd = hash22(cell + vec2(13.7, 29.1));

  // Subtle organic drift only for stipple or slow breathing if desired; locked in world-clean grid otherwise
  vec2 seedPx = (cell + 0.14 + rnd * 0.72) * pitch;
  vec2 seedFloor = floor(seedPx);

  bool isSeed = (abs(px.x - seedFloor.x) < 0.5 && abs(px.y - seedFloor.y) < 0.5);

  if (isSeed && uImportanceWeight == 1) {
    vec3 col = texture(uSceneTex, (px + 0.5) / uResolution).rgb;
    float dark = 1.0 - dot(col, vec3(0.2126, 0.7152, 0.0722));
    float accept = hash22(cell * 1.73 + 5.1).x;
    // Retain faint coverage in bright areas (Secord / StippleGen non-zero density floor)
    if (accept > clamp(dark * 1.12 + 0.04, 0.04, 1.0)) {
      isSeed = false;
    }
  }

  if (isSeed) {
    vec2 normPos = (px + 0.5) / uResolution;
    fragColor = vec4(normPos, 1.0, 1.0);
  } else {
    fragColor = vec4(-1.0, -1.0, 0.0, 0.0);
  }
}
`;

// Jump Flooding Voronoi Step (supports Euclidean for Stained Glass/Stipple AND Hausner ETF-rotated L1 Manhattan for Mosaics)
export const JFA_STEP_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uJfaTex;
uniform sampler2D uEtfTex;
uniform vec2 uTexelSize;
uniform vec2 uResolution;
uniform float uStep;
uniform int uMetric; // 0 = Euclidean, 1 = Hausner ETF-aligned L1 Manhattan

float seedDistance(vec2 pPx, vec2 sUv) {
  vec2 sPx = sUv * uResolution;
  vec2 d = pPx - sPx;
  if (uMetric == 1) {
    vec2 t = texture(uEtfTex, sUv).xy;
    float lenT = length(t);
    t = (lenT > 1e-4) ? (t / lenT) : vec2(1.0, 0.0);
    // Rotate displacement into the seed's local ETF tangent frame (Hausner SIGGRAPH 2001)
    vec2 rot = vec2(d.x * t.x + d.y * t.y, -d.x * t.y + d.y * t.x);
    return abs(rot.x) + abs(rot.y);
  }
  return length(d);
}

void main() {
  vec2 pPx = gl_FragCoord.xy;
  vec4 best = texture(uJfaTex, vUv);
  float bestDist = (best.z > 0.5) ? seedDistance(pPx, best.xy) : 1e9;

  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      if (dx == 0 && dy == 0) continue;
      vec2 suv = vUv + vec2(float(dx), float(dy)) * uStep * uTexelSize;
      if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
      vec4 cand = texture(uJfaTex, suv);
      if (cand.z > 0.5) {
        float dist = seedDistance(pPx, cand.xy);
        if (dist < bestDist) {
          bestDist = dist;
          best = cand;
        }
      }
    }
  }

  fragColor = best;
}
`;

// Horizontal Hillis-Steele Prefix-Sum Seed for 60fps FM Squiggle Wave Phase Integral
export const SQUIGGLE_SEED_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform float uInvert;

${MEDIA_COLOR_HELPERS}

void main() {
  vec3 col = texture(uSceneTex, vUv).rgb;
  float l = luma709(col);
  if (uInvert > 0.5) l = 1.0 - l;
  float darkness = clamp(1.0 - l, 0.0, 1.0);
  // Store darkness in R (to integrate into phase) and original darkness in G (for AM amplitude)
  fragColor = vec4(darkness, darkness, 0.0, 1.0);
}
`;

export const PREFIX_SUM_X_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform float uOffsetPx;
uniform float uWidth;

void main() {
  vec4 cur = texture(uTex, vUv);
  float xPx = gl_FragCoord.x - 0.5;
  if (xPx >= uOffsetPx) {
    vec2 prevUv = vec2((xPx - uOffsetPx + 0.5) / uWidth, vUv.y);
    cur.r += texture(uTex, prevUv).r;
  }
  fragColor = cur;
}
`;
