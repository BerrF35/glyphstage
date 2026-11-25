import { MEDIA_COLOR_HELPERS } from './primitives.glsl';

/**
 * Family 1: Painterly & Pigmented Media
 *
 * 1. Anisotropic Kuwahara Oil Painting
 *    - Exact half-ellipse 8-sector polynomial formulation from Jan Eric Kyprianidis (jkyprian/polyakf akf_v3n8.glsl, PG 2009)
 *      preserving his 2x symmetry optimization (j = 0..max_y, sampling ±(i,j) into opposite sectors k and (k+4)&7).
 *    - Combined with Garrett Gunnell's depth-modulated brush radius (AcerolaFX_KuwaharaFilter.fx) using sceneRt.a
 *      and directional canvas impasto relief.
 *
 * 2. Wet-on-Wet Watercolor & Kubelka-Munk Spectral Pigment Wash
 *    - Bousseau et al. (NPAR 2006) ColorMod(c, d) = c - (c - c^2)(d - 1)
 *    - Gooch warm/cool color temperature shift (SIGGRAPH 1998)
 *    - Capillary wet-edge backrun darkening (nobnak/WaterColorFilter)
 *    - Cold-press cotton paper granulation + Ronald van Wijnen Kubelka-Munk spectral pigment wash.
 */

export const KUWAHARA_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uEtfTex;
uniform sampler2D uSubstrateTex;
uniform vec2 uTexelSize;
uniform float uScale;    // brush radius control [0..1]
uniform float uDetail;   // anisotropy strength [0..1]
uniform float uTexture;  // impasto relief / canvas weave [0..1]
uniform float uColorMix; // saturation / pigment richness [0..1]
uniform int uVariant;    // 0=Classic Oil, 1=Depth Brush, 2=Thick Impasto, 3=Gouache Flat

const float HALF_SQRT2 = 0.7071067811865475;

${MEDIA_COLOR_HELPERS}

void main() {
  vec4 centerSample = texture(uSceneTex, vUv);
  float depth = centerSample.a;

  // Bilateral ETF tensor: xy = edge tangent, z = gradient mag, w = anisotropy A in [0,1]
  vec4 tf = texture(uEtfTex, vUv);
  vec2 tang = tf.xy;
  float aniso = tf.w;
  float lenT = length(tang);
  tang = (lenT > 1e-4) ? (tang / lenT) : vec2(1.0, 0.0);

  // Brush radius (2.5..8.5 px); variant 1 modulates brush size by scene depth (AcerolaFX depth-aware Kuwahara)
  float baseRadius = mix(2.5, 8.2, uScale);
  if (uVariant == 1) {
    baseRadius *= mix(0.65, 1.45, clamp(1.0 - depth, 0.0, 1.0));
  } else if (uVariant == 2) {
    baseRadius *= 1.15;
  }

  // Kyprianidis anisotropy ellipse semi-axes: a along tangent, b across edge
  float alpha = mix(2.6, 0.35, uDetail);
  float a = baseRadius * clamp((alpha + aniso) / alpha, 0.2, 2.0);
  float b = baseRadius * clamp(alpha / (alpha + aniso), 0.2, 2.0);

  float cosPhi = tang.x;
  float sinPhi = tang.y;
  mat2 SR = mat2(cosPhi / a, -sinPhi / b, sinPhi / a, cosPhi / b);

  int maxX = min(10, max(1, int(ceil(sqrt(a * a * cosPhi * cosPhi + b * b * sinPhi * sinPhi)))));
  int maxY = min(10, max(1, int(ceil(sqrt(a * a * sinPhi * sinPhi + b * b * cosPhi * cosPhi)))));

  vec4 m[8];
  vec3 s[8];

  // Center pixel seeded equally into all 8 sectors (akf_v3n8.glsl lines 51-60)
  {
    vec3 c = centerSample.rgb;
    float w0 = 0.125;
    vec4 cww = vec4(c * w0, w0);
    vec3 ccw = c * c * w0;
    for (int k = 0; k < 8; k++) {
      m[k] = cww;
      s[k] = ccw;
    }
  }

  // Kyprianidis 2x half-ellipse symmetry optimization: loop j >= 0 and mirror ±(i, j) into opposite sectors
  for (int j = 0; j <= 10; j++) {
    if (j > maxY) break;
    for (int i = -10; i <= 10; i++) {
      if (i < -maxX || i > maxX) continue;
      if (j == 0 && i <= 0) continue;

      vec2 offset = vec2(float(i), float(j));
      vec2 v = SR * offset;
      float dotV = dot(v, v);
      if (dotV <= 1.0) {
        vec2 duv = offset * uTexelSize;
        vec3 c0 = texture(uSceneTex, clamp(vUv + duv, vec2(0.0), vec2(1.0))).rgb;
        vec3 c1 = texture(uSceneTex, clamp(vUv - duv, vec2(0.0), vec2(1.0))).rgb;
        vec3 cc0 = c0 * c0;
        vec3 cc1 = c1 * c1;

        float sum = 0.0;
        float w[8];
        float z;

        // Exact Kyprianidis polynomial sector weights (zeta = 0.33, eta = 3.77)
        float vxx = 0.33 - 3.77 * v.x * v.x;
        float vyy = 0.33 - 3.77 * v.y * v.y;
        z = max(0.0,  v.y + vxx); w[0] = z * z; sum += w[0];
        z = max(0.0, -v.x + vyy); w[2] = z * z; sum += w[2];
        z = max(0.0, -v.y + vxx); w[4] = z * z; sum += w[4];
        z = max(0.0,  v.x + vyy); w[6] = z * z; sum += w[6];

        vec2 vr = HALF_SQRT2 * vec2(v.x - v.y, v.x + v.y);
        vxx = 0.33 - 3.77 * vr.x * vr.x;
        vyy = 0.33 - 3.77 * vr.y * vr.y;
        z = max(0.0,  vr.y + vxx); w[1] = z * z; sum += w[1];
        z = max(0.0, -vr.x + vyy); w[3] = z * z; sum += w[3];
        z = max(0.0, -vr.y + vxx); w[5] = z * z; sum += w[5];
        z = max(0.0,  vr.x + vyy); w[7] = z * z; sum += w[7];

        float g = exp(-3.125 * dotV) / max(1e-5, sum);

        for (int k = 0; k < 8; k++) {
          float wk = w[k] * g;
          int opp = (k + 4) & 7;
          m[k] += vec4(c0 * wk, wk);
          s[k] += cc0 * wk;
          m[opp] += vec4(c1 * wk, wk);
          s[opp] += cc1 * wk;
        }
      }
    }
  }

  float q = (uVariant == 3) ? 14.0 : 8.0;
  vec4 outAcc = vec4(0.0);
  for (int k = 0; k < 8; k++) {
    vec3 mean = m[k].rgb / max(1e-5, m[k].w);
    vec3 var = abs(s[k] / max(1e-5, m[k].w) - mean * mean);
    float sigma2 = var.r + var.g + var.b;
    float wk = 1.0 / (1.0 + pow(max(0.0, 64.0 * sigma2), 0.5 * q));
    outAcc += vec4(mean * wk, wk);
  }

  vec3 painted = outAcc.rgb / max(1e-5, outAcc.w);

  // Subtle OKLab vibrancy boost so oil pigments feel saturated like linseed oil
  vec3 lab = srgbToOklab(painted);
  float satBoost = mix(0.85, 1.32, uColorMix);
  lab.yz *= satBoost;
  if (uVariant == 3) {
    // Gouache flat posterization in perceptual lightness
    lab.x = floor(lab.x * 11.0 + 0.5) / 11.0;
  }
  painted = oklabToSrgb(lab);

  // Tactile canvas weave & impasto directional bristle lighting
  if (uTexture > 0.01 && uVariant != 3) {
    vec2 canvasUv = vUv * vec2(5.0, 3.2);
    float weave = texture(uSubstrateTex, canvasUv).r;
    // Directional bristle micro-ridge aligned with ETF tangent
    vec2 bristleUv = vec2(dot(vUv * 12.0, tang), dot(vUv * 42.0, vec2(-tang.y, tang.x)));
    float bristle = texture(uSubstrateTex, bristleUv * 0.25).r;
    float lR = luma709(texture(uSceneTex, vUv + vec2(uTexelSize.x * 2.0, 0.0)).rgb);
    float lU = luma709(texture(uSceneTex, vUv + vec2(0.0, uTexelSize.y * 2.0)).rgb);
    float lC = luma709(centerSample.rgb);
    float ridge = (lC - lR) + (lC - lU);

    float impastoGain = (uVariant == 2) ? 1.7 : 1.0;
    float relief = (bristle - 0.5) * 0.14 + ridge * 0.65 + (weave - 0.5) * 0.06;
    painted += vec3(relief * uTexture * impastoGain * 0.45);
  }

  fragColor = vec4(clamp(painted, 0.0, 1.0), 1.0);
}
`;

export const WATERCOLOR_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uEtfTex;
uniform sampler2D uSubstrateTex;
uniform vec2 uTexelSize;
uniform float uScale;    // organic wash wobble amplitude [0..1]
uniform float uDetail;   // capillary wet-edge darkening [0..1]
uniform float uTexture;  // cold-press cotton paper granulation [0..1]
uniform float uColorMix; // Kubelka-Munk spectral wash vs Gooch [0..1]
uniform int uVariant;    // 0=Warm Paper, 1=Sumi-e Ink Wash, 2=Gooch Studio, 3=Nocturne Wash
uniform float uTime;

${MEDIA_COLOR_HELPERS}

// Bousseau et al. (NPAR 2006) / Curtis (SIGGRAPH 1997) pigment density operator:
// Leaves paper white (1.0) and pure black (0.0) invariant while richly saturating midtones.
vec3 colorMod(vec3 c, float d) {
  return clamp(c - (c - c * c) * (d - 1.0), 0.0, 1.0);
}

void main() {
  // 1. Turbulent wet-wash UV wobble (breaks straight digital edges into hand-brushed contours)
  vec2 flowSample = texture(uSubstrateTex, vUv * 2.4).rb - 0.5;
  vec2 fineWobble = texture(uSubstrateTex, vUv * 7.5 + 0.37).rb - 0.5;
  vec2 wobble = (flowSample * 0.72 + fineWobble * 0.28) * uTexelSize * mix(1.5, 11.0, uScale);
  vec2 wuv = clamp(vUv + wobble, vec2(0.002), vec2(0.998));

  // 2. Soft wet-on-wet multi-tap pigment bleed using Kubelka-Munk spectral blending
  vec4 cCenter = texture(uSceneTex, wuv);
  vec2 blurStep = uTexelSize * mix(1.4, 3.8, uScale);
  vec3 c1 = texture(uSceneTex, clamp(wuv + vec2(blurStep.x, 0.0), vec2(0.0), vec2(1.0))).rgb;
  vec3 c2 = texture(uSceneTex, clamp(wuv - vec2(blurStep.x, 0.0), vec2(0.0), vec2(1.0))).rgb;
  vec3 c3 = texture(uSceneTex, clamp(wuv + vec2(0.0, blurStep.y), vec2(0.0), vec2(1.0))).rgb;
  vec3 c4 = texture(uSceneTex, clamp(wuv - vec2(0.0, blurStep.y), vec2(0.0), vec2(1.0))).rgb;

  vec3 bleedH = spectralMix(c1, c2, 0.5);
  vec3 bleedV = spectralMix(c3, c4, 0.5);
  vec3 bleed = spectralMix(bleedH, bleedV, 0.5);
  vec3 baseCol = spectralMix(cCenter.rgb, bleed, mix(0.25, 0.65, uColorMix));

  float lum = luma709(baseCol);

  // 3. Gooch warm-to-cool pigment toning & paper-stock mapping
  vec3 paperStock = vec3(0.955, 0.935, 0.895); // Arches warm cold-press cotton
  vec3 coolPigment = vec3(0.14, 0.24, 0.44);   // Prussian / Ultramarine
  vec3 warmPigment = vec3(0.86, 0.56, 0.26);   // Raw Sienna / Ochre

  vec3 wash;
  if (uVariant == 1) {
    // Sumi-e Japanese black-ink wash on mulberry washi paper
    paperStock = vec3(0.94, 0.92, 0.87);
    vec3 sumiInk = vec3(0.11, 0.12, 0.14);
    float inkDensity = smoothstep(0.04, 0.88, 1.0 - lum);
    // In dark 3D worlds, map luminous forms as expressive dark ink strokes on light paper
    float strokeMask = smoothstep(0.06, 0.92, lum);
    wash = mix(paperStock, sumiInk, pow(strokeMask, 0.85));
    wash = mix(wash, mix(paperStock, baseCol, 0.45), uColorMix * 0.22 * strokeMask);
    // Avoid unused warning
    inkDensity = inkDensity;
  } else if (uVariant == 2) {
    // Gooch technical watercolor studio (cool cobalt shadows, warm ochre highlights)
    vec3 gooch = spectralMix(coolPigment, warmPigment, smoothstep(0.12, 0.88, lum));
    wash = spectralMix(gooch, baseCol, uColorMix * 0.65);
    float paintCoverage = smoothstep(0.03, 0.28, lum);
    wash = mix(paperStock, mix(paperStock * 0.98, wash, 0.86), paintCoverage);
  } else if (uVariant == 3) {
    // Nocturne watercolor on indigo-tinted dark rag paper
    paperStock = vec3(0.08, 0.10, 0.15);
    vec3 lifted = spectralMix(vec3(0.12, 0.22, 0.42), baseCol * 1.15, clamp(lum * 1.4, 0.0, 1.0));
    wash = mix(paperStock, lifted, smoothstep(0.02, 0.22, lum));
  } else {
    // Classic Warm Cold-Press Watercolor: invert dark void background to clean cream paper, paint luminous forms with rich pigments
    float presence = smoothstep(0.025, 0.24, lum);
    vec3 vibrant = clamp(baseCol * 1.18 + vec3(0.06, 0.04, 0.02), 0.0, 1.0);
    // Shift shadows subtly cool (Gooch) and midtones painterly
    vec3 coolShift = spectralMix(vibrant, coolPigment, (1.0 - lum) * 0.28);
    // Transparent watercolor glazing: high values stay luminous on paper, mid-values saturate
    vec3 glazed = mix(paperStock, coolShift, 0.78 * presence);
    wash = mix(coolShift, glazed, 0.85);
  }

  // 4. Capillary edge darkening (wet-edge backrun ring from ETF gradient + depth edges)
  float edgeCenter = texture(uEtfTex, wuv).z;
  float edgeBlur =
    (texture(uEtfTex, wuv + vec2(uTexelSize.x * 2.0, 0.0)).z +
     texture(uEtfTex, wuv - vec2(uTexelSize.x * 2.0, 0.0)).z +
     texture(uEtfTex, wuv + vec2(0.0, uTexelSize.y * 2.0)).z +
     texture(uEtfTex, wuv - vec2(0.0, uTexelSize.y * 2.0)).z) * 0.25;
  float backrun = smoothstep(0.04, 0.42, max(edgeCenter, edgeBlur) * 2.1);

  // 5. Cold-press paper heightfield granulation (pigment pools in paper valleys)
  float paperH = texture(uSubstrateTex, vUv * vec2(4.2, 2.8)).r;
  float granNoise = texture(uSubstrateTex, vUv * vec2(2.1, 1.4) + 0.19).b;
  float density = 1.0
    + backrun * mix(0.3, 1.85, uDetail)
    + (0.52 - paperH) * mix(0.0, 1.35, uTexture)
    + (granNoise - 0.5) * 0.45 * uTexture;

  vec3 outCol = colorMod(wash, clamp(density, 0.35, 2.75));

  // Fine paper tooth lighting on highlights
  float tooth = (paperH - 0.5) * 0.075 * uTexture;
  outCol = clamp(outCol + vec3(tooth), 0.0, 1.0);

  fragColor = vec4(outCol, 1.0);
}
`;
