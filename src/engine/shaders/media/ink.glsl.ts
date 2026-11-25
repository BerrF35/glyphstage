import { MEDIA_COLOR_HELPERS } from './primitives.glsl';

/**
 * Family 2: Ink, Engraving, Hatching & Plotter Line Art
 *
 * 1. Coherent Line Drawing (ETF + FDoG + XDoG)
 *    - Kang, Lee & Chui (NPAR 2007 / SSARCandy Coherent-Line-Drawing): perpendicular DoG across ETF normal
 *      followed by streamline integration along ETF tangent.
 *    - Winnemöller et al. (2012) & Garrett Gunnell (AcerolaFX_DifferenceOfGaussians.fx): CIELAB L*,
 *      soft tanh thresholding, depth silhouette outlines, and multi-angle midtone hatching.
 *
 * 2. Line Integral Convolution (LIC) Silk, Charcoal & Woodcut Engraving (Cabral & Leedom SIGGRAPH 1993)
 *
 * 3. Real-Time Tonal Art Maps (TAM) Cross-Hatching (Praun, Hoppe, Webb & Finkelstein SIGGRAPH 2001 / spite)
 *
 * 4. GPU FM/AM Pen-Plotter Squiggle Waves (SquiggleCam / SquiggleDraw via Hillis-Steele phase integral)
 *
 * 5. Analytical Topographic Isolines (Ricky Reusser glsl-solid-wireframe fwidth contours)
 */

// Pass A of FDoG: Perpendicular Difference-of-Gaussians across the bilateral ETF normal in CIELAB L*
export const FDOG_PERP_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uEtfTex;
uniform vec2 uTexelSize;
uniform float uScale;  // nib width sigma_c [0..1]
uniform float uDetail; // sensitivity tau / p [0..1]

${MEDIA_COLOR_HELPERS}

void main() {
  vec2 t = texture(uEtfTex, vUv).xy;
  float lenT = length(t);
  t = (lenT > 1e-4) ? (t / lenT) : vec2(1.0, 0.0);
  // Edge normal (perpendicular to tangent)
  vec2 n = vec2(-t.y, t.x);

  float sigmaE = mix(0.85, 2.4, uScale);
  float sigmaR = sigmaE * 1.6;
  float twoSigmaE2 = 2.0 * sigmaE * sigmaE;
  float twoSigmaR2 = 2.0 * sigmaR * sigmaR;

  float sumE = 0.0;
  float sumR = 0.0;
  float wSumE = 0.0;
  float wSumR = 0.0;

  int halfW = min(6, int(ceil(2.0 * sigmaR)));
  for (int i = -6; i <= 6; i++) {
    if (i < -halfW || i > halfW) continue;
    float d = float(i);
    vec2 suv = clamp(vUv + n * d * uTexelSize, vec2(0.0), vec2(1.0));
    float L = rgbToCielabL(texture(uSceneTex, suv).rgb);
    float wE = exp(-(d * d) / twoSigmaE2);
    float wR = exp(-(d * d) / twoSigmaR2);
    sumE += L * wE;
    sumR += L * wR;
    wSumE += wE;
    wSumR += wR;
  }

  float gE = sumE / max(1e-5, wSumE);
  float gR = sumR / max(1e-5, wSumR);

  // Winnemöller XDoG difference: (1 + p) * G_e - p * G_r
  float p = mix(10.0, 34.0, uDetail);
  float dog = (1.0 + p) * gE - p * gR;

  // Also preserve depth discontinuity for crisp 3D silhouettes (AcerolaFX_EdgeDetect)
  float zC = texture(uSceneTex, vUv).a;
  float zMaxDiff = max(
    max(abs(zC - texture(uSceneTex, vUv + vec2(uTexelSize.x, 0.0)).a),
        abs(zC - texture(uSceneTex, vUv - vec2(uTexelSize.x, 0.0)).a)),
    max(abs(zC - texture(uSceneTex, vUv + vec2(0.0, uTexelSize.y)).a),
        abs(zC - texture(uSceneTex, vUv - vec2(0.0, uTexelSize.y)).a))
  );

  fragColor = vec4(dog, gE, zMaxDiff, 1.0);
}
`;

// Pass B of FDoG: Tangent streamline integration + Winnemöller XDoG tanh soft threshold + midtone cross-hatch
export const FDOG_FLOW_XDOG_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uEtfTex;
uniform sampler2D uFdogTex;
uniform sampler2D uSubstrateTex;
uniform vec2 uTexelSize;
uniform vec2 uResolution;
uniform float uScale;
uniform float uDetail;
uniform float uTexture;
uniform float uColorMix;
uniform int uVariant; // 0=Arch Ink, 1=Manga XDoG, 2=Colored Pencil, 3=Blueprint White

${MEDIA_COLOR_HELPERS}

void main() {
  float sigmaM = mix(1.8, 4.5, uScale);
  float twoSigmaM2 = 2.0 * sigmaM * sigmaM;

  vec3 f0 = texture(uFdogTex, vUv).rgb;
  float sumDog = f0.r;
  float sumDepth = f0.b;
  float wSum = 1.0;

  // Bidirectional Euler streamline integration along ETF tangent (Kang et al. NPAR 2007 Eq. 9)
  for (int dir = -1; dir <= 1; dir += 2) {
    vec2 pos = vUv;
    vec2 prevT = texture(uEtfTex, pos).xy;
    float len0 = length(prevT);
    prevT = (len0 > 1e-4) ? (prevT / len0) * float(dir) : vec2(float(dir), 0.0);

    for (int s = 1; s <= 6; s++) {
      pos = clamp(pos + prevT * uTexelSize * 1.15, vec2(0.0), vec2(1.0));
      vec2 curT = texture(uEtfTex, pos).xy;
      float lenC = length(curT);
      if (lenC > 1e-4) {
        curT /= lenC;
        if (dot(curT, prevT) < 0.0) curT = -curT;
        prevT = curT;
      }
      float w = exp(-float(s * s) / twoSigmaM2);
      vec3 fs = texture(uFdogTex, pos).rgb;
      sumDog += fs.r * w;
      sumDepth += fs.b * w;
      wSum += w;
    }
  }

  float dog = sumDog / max(1e-5, wSum);
  float depthEdge = sumDepth / max(1e-5, wSum);

  // Winnemöller XDoG soft threshold (AcerolaFX_DifferenceOfGaussians.fx)
  float eps = mix(0.46, 0.22, uDetail);
  float phi = mix(8.0, 26.0, uDetail);
  float edge = (dog >= eps) ? 1.0 : (1.0 + tanh(phi * (dog - eps)));
  edge = clamp(edge, 0.0, 1.0);

  // Inject crisp depth contour outlines
  float sil = smoothstep(0.055, 0.14, depthEdge);
  edge = min(edge, 1.0 - sil * 0.92);

  vec3 src = texture(uSceneTex, vUv).rgb;
  float L = rgbToCielabL(src);
  float paper = texture(uSubstrateTex, vUv * vec2(4.0, 2.6)).r;

  // Optional 4-angle XDoG midtone hatching (AcerolaFX style)
  float hatch = 1.0;
  if (uTexture > 0.02) {
    vec2 px = gl_FragCoord.xy * mix(0.55, 0.95, 1.0 - uScale);
    float h1 = smoothstep(-0.25, 0.35, sin((px.x + px.y) * 0.72 + (paper - 0.5) * 1.6));
    float h2 = smoothstep(-0.25, 0.35, sin((px.x - px.y) * 0.72 + (paper - 0.5) * 1.6));
    float h3 = smoothstep(-0.25, 0.35, sin(px.y * 0.85));
    float shadow = 1.0 - L;
    if (shadow > 0.35) hatch = min(hatch, mix(1.0, h1, smoothstep(0.35, 0.58, shadow) * uTexture));
    if (shadow > 0.58) hatch = min(hatch, mix(1.0, h2, smoothstep(0.58, 0.76, shadow) * uTexture));
    if (shadow > 0.78) hatch = min(hatch, mix(1.0, h3, smoothstep(0.78, 0.94, shadow) * uTexture));
  }

  float inkMask = clamp(1.0 - edge * hatch, 0.0, 1.0);

  vec3 outCol;
  if (uVariant == 1) {
    // Manga crisp black-and-white screentone XDoG
    float screenDot = step(0.5, fract(gl_FragCoord.x * 0.25) * fract(gl_FragCoord.y * 0.25) + L * 0.9);
    float tone = min(edge, mix(1.0, screenDot, uTexture * 0.65 * (1.0 - smoothstep(0.15, 0.6, L))));
    vec3 bg = vec3(0.97, 0.97, 0.95);
    vec3 ink = vec3(0.05, 0.05, 0.07);
    outCol = mix(ink, bg, tone);
    outCol = mix(outCol, outCol * mix(vec3(1.0), src * 1.2, 0.8), uColorMix);
  } else if (uVariant == 2) {
    // Colored Pencil on warm toothy paper (AcerolaFX Colored Pencil mode)
    vec3 paperCol = vec3(0.95, 0.92, 0.86) * (0.94 + paper * 0.1);
    vec3 pencilHue = oklabToSrgb(vec3(clamp(L * 0.8 + 0.15, 0.15, 0.85), srgbToOklab(src).yz * 1.45));
    vec3 strokeCol = mix(pencilHue * 0.38, pencilHue, 0.55);
    outCol = mix(paperCol, strokeCol, clamp(inkMask * 0.85 + (1.0 - L) * 0.28 * uColorMix, 0.0, 1.0));
  } else if (uVariant == 3) {
    // Architectural Cyanotype Blueprint (white drafting ink on Prussian blue)
    vec3 blueBg = vec3(0.05, 0.16, 0.34) * (0.9 + paper * 0.18);
    vec3 chalkInk = vec3(0.88, 0.95, 1.0);
    // Subtle blueprint grid
    vec2 grid = abs(fract(gl_FragCoord.xy / 48.0 - 0.5) - 0.5) / max(fwidth(gl_FragCoord.xy / 48.0), vec2(1e-4));
    float gridLine = 1.0 - min(min(grid.x, grid.y), 1.0);
    blueBg += vec3(0.04, 0.10, 0.16) * gridLine * 0.55;
    outCol = mix(blueBg, chalkInk, inkMask);
  } else {
    // Archival Pen & Ink on warm rag paper
    vec3 paperCol = vec3(0.945, 0.925, 0.88) * (0.93 + paper * 0.11);
    vec3 inkCol = vec3(0.08, 0.085, 0.10);
    vec3 washedPaper = mix(paperCol, mix(paperCol, src, 0.65), uColorMix * smoothstep(0.05, 0.45, L));
    outCol = mix(washedPaper, inkCol, inkMask);
  }

  fragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
}
`;

// Cabral & Leedom (SIGGRAPH 1993) Line Integral Convolution along bilateral ETF streamlines
export const LIC_ENGRAVE_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uEtfTex;
uniform sampler2D uSubstrateTex;
uniform vec2 uTexelSize;
uniform vec2 uResolution;
uniform float uScale;    // streamline integration length [0..1]
uniform float uDetail;   // engraving carving contrast [0..1]
uniform float uTexture;  // grain frequency [0..1]
uniform float uColorMix; // chromatic silk vs monochrome engraving [0..1]
uniform int uVariant;    // 0=Copperplate, 1=Charcoal Silk, 2=Flowing Oil, 3=Noir Woodcut

${MEDIA_COLOR_HELPERS}

void main() {
  float noiseScale = mix(2.2, 6.8, uTexture);
  vec2 aspectScale = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  int steps = int(mix(5.0, 14.0, uScale));

  float acc = texture(uSubstrateTex, vUv * noiseScale * aspectScale).a;
  float wSum = 1.0;

  for (int dir = -1; dir <= 1; dir += 2) {
    vec2 pos = vUv;
    vec2 t = texture(uEtfTex, pos).xy;
    float lt = length(t);
    t = (lt > 1e-4) ? (t / lt) * float(dir) : vec2(float(dir), 0.0);

    for (int s = 1; s <= 14; s++) {
      if (s > steps) break;
      pos = clamp(pos + t * uTexelSize * 1.25, vec2(0.0), vec2(1.0));
      vec2 nt = texture(uEtfTex, pos).xy;
      float lnt = length(nt);
      if (lnt > 1e-4) {
        nt /= lnt;
        if (dot(nt, t) < 0.0) nt = -nt;
        t = nt;
      }
      // Hann window kernel k(s)
      float u = float(s) / float(steps + 1);
      float w = 0.5 * (1.0 + cos(3.14159265 * u));
      acc += texture(uSubstrateTex, pos * noiseScale * aspectScale).a * w;
      wSum += w;
    }
  }

  float lic = acc / max(1e-5, wSum);
  // Re-center LIC variance around 0.5 (standard LIC contrast boost)
  float contrast = mix(2.2, 5.5, uDetail);
  float streak = clamp((lic - 0.5) * contrast + 0.5, 0.0, 1.0);

  vec4 sc = texture(uSceneTex, vUv);
  float lum = rgbToCielabL(sc.rgb);
  float paper = texture(uSubstrateTex, vUv * 3.5).r;

  vec3 outCol;
  if (uVariant == 0) {
    // Copperplate Burin Engraving: bright areas carve clean fine lines, darks become deep ink
    float groove = smoothstep(0.18, 0.82, streak * 0.65 + lum * 0.85 - 0.15);
    vec3 parchment = vec3(0.95, 0.92, 0.85) * (0.94 + paper * 0.1);
    vec3 burinInk = vec3(0.07, 0.09, 0.12);
    outCol = mix(burinInk, parchment, groove);
    outCol = mix(outCol, mix(burinInk, sc.rgb * 1.15, groove), uColorMix);
  } else if (uVariant == 1) {
    // Charcoal Silk on dark museum paper
    float fiber = pow(clamp(lum * (0.55 + streak * 0.95), 0.0, 1.0), 0.92);
    vec3 charcoal = vec3(0.06, 0.065, 0.075);
    vec3 silver = vec3(0.93, 0.91, 0.87);
    outCol = mix(charcoal, mix(silver, sc.rgb * 1.25, uColorMix), fiber);
  } else if (uVariant == 2) {
    // Van Gogh Flowing Chromatic Silk
    vec3 boosted = oklabToSrgb(vec3(clamp(lum * (0.72 + streak * 0.58), 0.0, 1.0), srgbToOklab(sc.rgb).yz * (1.0 + uColorMix * 0.45)));
    outCol = boosted;
  } else {
    // High-contrast Noir Woodcut
    float cut = step(mix(0.62, 0.34, lum), streak);
    vec3 bg = vec3(0.05, 0.05, 0.06);
    vec3 fg = mix(vec3(0.95, 0.93, 0.88), sc.rgb * 1.35, uColorMix);
    outCol = mix(bg, fg, cut * smoothstep(0.03, 0.18, lum));
  }

  fragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
}
`;

// Praun, Hoppe, Webb & Finkelstein (SIGGRAPH 2001) + Jaume Sanchez (spite/cross-hatching)
// 6-tier strictly nested Tonal Art Map (TAM) cross-hatching with custom crisp mipmaps
export const TAM_HATCH_FRAG = `#version 300 es
precision highp float;
precision highp sampler2DArray;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uEtfTex;
uniform sampler2D uSubstrateTex;
uniform sampler2DArray uTamArray;
uniform vec2 uResolution;
uniform vec2 uTexelSize;
uniform float uScale;    // stroke tiling density [0..1]
uniform float uDetail;   // rim ink silhouette weight [0..1]
uniform float uTexture;  // rag paper multiply [0..1]
uniform float uColorMix; // watercolor underpaint blend [0..1]
uniform int uVariant;    // 0=Fountain Pen, 1=ETF Flow Hatch, 2=Sepia Sketch, 3=White Chalk

${MEDIA_COLOR_HELPERS}

// 6-tier piecewise linear TAM blending matching spite/cross-hatching index.html lines 178-218
float sampleTam6(vec2 uv, float shading) {
  float step6 = 1.0 / 6.0;
  float h0 = texture(uTamArray, vec3(uv, 0.0)).r;
  float h1 = texture(uTamArray, vec3(uv, 1.0)).r;
  float h2 = texture(uTamArray, vec3(uv, 2.0)).r;
  float h3 = texture(uTamArray, vec3(uv, 3.0)).r;
  float h4 = texture(uTamArray, vec3(uv, 4.0)).r;
  float h5 = texture(uTamArray, vec3(uv, 5.0)).r;

  if (shading <= step6) {
    return mix(h5, h4, shading / step6);
  } else if (shading <= 2.0 * step6) {
    return mix(h4, h3, (shading - step6) / step6);
  } else if (shading <= 3.0 * step6) {
    return mix(h3, h2, (shading - 2.0 * step6) / step6);
  } else if (shading <= 4.0 * step6) {
    return mix(h2, h1, (shading - 3.0 * step6) / step6);
  } else if (shading <= 5.0 * step6) {
    return mix(h1, h0, (shading - 4.0 * step6) / step6);
  } else {
    return mix(h0, 1.0, (shading - 5.0 * step6) / step6);
  }
}

void main() {
  vec4 sc = texture(uSceneTex, vUv);
  float shading = clamp(rgbToCielabL(sc.rgb), 0.0, 1.0);
  vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  float tile = mix(2.2, 7.5, uScale);
  vec2 hatchUv = vUv * aspect * tile;

  // Variant 1 rotates TAM stroke coordinates locally along bilateral ETF tangent
  if (uVariant == 1) {
    vec2 t = texture(uEtfTex, vUv).xy;
    float lt = length(t);
    t = (lt > 1e-4) ? (t / lt) : vec2(1.0, 0.0);
    // Quantize orientation gently into 4 directional buckets so strokes stay continuous without swirl distortion
    float ang = floor(atan(t.y, t.x) / 0.785398 + 0.5) * 0.785398;
    float ca = cos(ang);
    float sa = sin(ang);
    hatchUv = mat2(ca, -sa, sa, ca) * hatchUv;
  }

  float hatchVal = sampleTam6(hatchUv, shading);

  // Depth + gradient rim ink contour (emulates spite/cross-hatching inverted-hull outline)
  float edge = texture(uEtfTex, vUv).z;
  float zC = sc.a;
  float zDiff = max(
    abs(zC - texture(uSceneTex, vUv + vec2(uTexelSize.x, 0.0)).a),
    abs(zC - texture(uSceneTex, vUv + vec2(0.0, uTexelSize.y)).a)
  );
  float rimInk = smoothstep(0.14, 0.34, edge * 1.4 + zDiff * 3.5) * uDetail;
  float inkVal = clamp(hatchVal * (1.0 - rimInk * 0.88), 0.0, 1.0);

  float paper = texture(uSubstrateTex, vUv * vec2(3.6, 2.4)).r;

  vec3 outCol;
  if (uVariant == 3) {
    // White Chalk on Indigo/Charcoal Drafting Board
    vec3 board = vec3(0.08, 0.095, 0.125) * (0.88 + paper * 0.22 * uTexture);
    float chalkVal = sampleTam6(hatchUv, 1.0 - shading);
    float chalk = clamp(1.0 - chalkVal + rimInk * 0.7, 0.0, 1.0);
    vec3 chalkCol = mix(vec3(0.94, 0.94, 0.92), sc.rgb * 1.25, uColorMix);
    outCol = mix(board, chalkCol, chalk);
  } else {
    vec3 paperCol = (uVariant == 2)
      ? vec3(0.92, 0.86, 0.75) // warm aged sepia paper
      : vec3(0.955, 0.945, 0.915);
    vec3 inkCol = (uVariant == 2)
      ? vec3(0.22, 0.13, 0.08) // iron-gall sepia ink
      : vec3(0.07, 0.075, 0.10);

    paperCol *= mix(1.0, 0.88 + paper * 0.2, uTexture);
    vec3 underpaint = mix(paperCol, mix(paperCol, sc.rgb, 0.72), uColorMix);
    outCol = mix(inkCol, underpaint, inkVal);
  }

  fragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
}
`;

// 60fps GPU FM/AM Pen-Plotter Squiggle Waves (from Hillis-Steele horizontal phase integral)
// Faithfully implements SquiggleCam / SquiggleDraw: r = amp * z / lineCount, a = ∫ z / freq dx, y + sin(a) * r
export const SQUIGGLE_RENDER_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uPhaseTex; // R = prefix-sum phase integral ∫darkness dx, G = local darkness
uniform sampler2D uSceneTex;
uniform sampler2D uSubstrateTex;
uniform vec2 uResolution;
uniform float uScale;    // number of horizontal scanlines [0..1]
uniform float uDetail;   // FM frequency gain [0..1]
uniform float uTexture;  // AM wave amplitude [0..1]
uniform float uColorMix; // ink source color mix [0..1]
uniform int uVariant;    // 0=Ink on Rag, 1=Gold on Obsidian, 2=RGB Tri-Pen, 3=Oscillograph

float evalWaveDist(float bandIdx, float lineCount, float bandY, vec2 uv, float phaseScale, float ampScale, float channelOffset) {
  float sampleY = clamp((bandIdx + 0.5) / lineCount, 0.0, 1.0);
  vec2 p = texture(uPhaseTex, vec2(uv.x, sampleY)).rg;
  // Derivative along x gives local instantaneous frequency for exact fwidth-free anti-aliasing!
  float phase = p.r * phaseScale + channelOffset;
  float amp = p.g * ampScale;
  float waveY = 0.5 + sin(phase) * amp;

  // Analytical slope dy/dx = cos(phase) * (dPhase/dx) * amp for constant optical pen nib width
  float dPhaseDx = max(0.01, p.g * phaseScale) / max(1.0, uResolution.x);
  float dyDx = cos(phase) * dPhaseDx * amp * (uResolution.y / lineCount);
  float distPx = abs(bandY - waveY) * (uResolution.y / lineCount) / sqrt(1.0 + dyDx * dyDx);
  return distPx;
}

void main() {
  float lineCount = floor(mix(28.0, 96.0, uScale));
  float phaseScale = mix(0.28, 1.35, uDetail);
  float ampScale = mix(0.18, 0.62, uTexture);
  float nibPx = mix(1.25, 0.72, uScale);

  float rowPos = vUv.y * lineCount;
  float rowIdx = floor(rowPos);
  float bandY = fract(rowPos);

  float paper = texture(uSubstrateTex, vUv * 3.2).r;
  vec3 srcCol = texture(uSceneTex, vec2(vUv.x, (rowIdx + 0.5) / lineCount)).rgb;

  if (uVariant == 2) {
    // RGB Tri-Pen CMY-style offset pen plotter (Cyan, Magenta, Gold pens)
    vec3 bg = vec3(0.96, 0.945, 0.91) * (0.94 + paper * 0.09);
    float dC = 1e6;
    float dM = 1e6;
    float dY = 1e6;
    for (int k = -1; k <= 1; k++) {
      float bIdx = rowIdx + float(k);
      if (bIdx < 0.0 || bIdx >= lineCount) continue;
      float localY = bandY - float(k);
      dC = min(dC, evalWaveDist(bIdx, lineCount, localY, vUv, phaseScale * 1.0, ampScale, 0.0));
      dM = min(dM, evalWaveDist(bIdx, lineCount, localY, vUv, phaseScale * 1.03, ampScale * 0.95, 2.09));
      dY = min(dY, evalWaveDist(bIdx, lineCount, localY, vUv, phaseScale * 0.97, ampScale * 0.9, 4.18));
    }
    float aC = 1.0 - smoothstep(nibPx * 0.6, nibPx * 1.45, dC);
    float aM = 1.0 - smoothstep(nibPx * 0.6, nibPx * 1.45, dM);
    float aY = 1.0 - smoothstep(nibPx * 0.6, nibPx * 1.45, dY);
    vec3 outCol = bg;
    outCol *= mix(vec3(1.0), vec3(0.10, 0.72, 0.88), aC * (1.0 - srcCol.r * 0.55));
    outCol *= mix(vec3(1.0), vec3(0.92, 0.18, 0.58), aM * (1.0 - srcCol.g * 0.55));
    outCol *= mix(vec3(1.0), vec3(0.96, 0.74, 0.10), aY * (1.0 - srcCol.b * 0.55));
    fragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
    return;
  }

  // Evaluate current row and immediate neighbors so tall amplitude peaks cross cleanly without clipping
  float minDist = 1e6;
  for (int k = -1; k <= 1; k++) {
    float bIdx = rowIdx + float(k);
    if (bIdx < 0.0 || bIdx >= lineCount) continue;
    float localY = bandY - float(k);
    minDist = min(minDist, evalWaveDist(bIdx, lineCount, localY, vUv, phaseScale, ampScale, 0.0));
  }

  float ink = 1.0 - smoothstep(nibPx * 0.55, nibPx * 1.4, minDist);

  vec3 outCol;
  if (uVariant == 1) {
    // Gold nib on Obsidian card stock
    vec3 bg = vec3(0.045, 0.048, 0.058);
    vec3 pen = mix(vec3(0.96, 0.75, 0.34), srcCol * 1.35, uColorMix);
    outCol = mix(bg, pen, ink);
  } else if (uVariant == 3) {
    // Luminous Phosphor Oscillograph
    vec3 bg = vec3(0.02, 0.04, 0.035);
    float glow = exp(-minDist * 0.35) * 0.45;
    vec3 pen = mix(vec3(0.28, 0.98, 0.68), srcCol * 1.4, uColorMix);
    outCol = bg + pen * (ink + glow);
  } else {
    // Classic AxiDraw Black Micron Ink on Archival Cotton Rag
    vec3 bg = vec3(0.955, 0.94, 0.90) * (0.93 + paper * 0.11);
    vec3 pen = mix(vec3(0.07, 0.075, 0.095), srcCol * 0.55, uColorMix);
    outCol = mix(bg, pen, ink);
  }

  fragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
}
`;

// Ricky Reusser (rreusser/glsl-solid-wireframe) derivative-normalized analytical topographic isolines
export const CONTOUR_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uSubstrateTex;
uniform float uScale;    // contour band count [0..1]
uniform float uDetail;   // stroke thickness [0..1]
uniform float uTexture;  // blend between luminance and scene depth [0..1]
uniform float uColorMix; // hypsometric tint [0..1]
uniform int uVariant;    // 0=Cartography, 1=Neon Wire, 2=Bathymetry, 3=Blueprint

${MEDIA_COLOR_HELPERS}

void main() {
  vec4 sc = texture(uSceneTex, vUv);
  float lum = rgbToCielabL(sc.rgb);
  float depth = sc.a;

  // Blend scalar elevation field between luminance and true 3D depth
  float field = mix(lum, depth, uTexture);

  float bands = mix(8.0, 36.0, uScale);
  float v = field * bands;
  float df = max(fwidth(v), 1e-4);
  float distMajor = abs(fract(v * 0.25 - 0.5) - 0.5) / max(fwidth(v * 0.25), 1e-4);
  float distMinor = abs(fract(v - 0.5) - 0.5) / df;

  float widthMinor = mix(0.65, 2.0, uDetail);
  float widthMajor = widthMinor * 1.75;

  float minorLine = 1.0 - smoothstep(widthMinor * 0.5, widthMinor * 0.5 + 1.0, distMinor);
  float majorLine = 1.0 - smoothstep(widthMajor * 0.5, widthMajor * 0.5 + 1.0, distMajor);
  float line = max(minorLine * 0.62, majorLine);

  float paper = texture(uSubstrateTex, vUv * 3.5).r;

  vec3 outCol;
  if (uVariant == 1) {
    // Neon wireframe telemetry on obsidian
    vec3 bg = vec3(0.03, 0.035, 0.05);
    vec3 wire = mix(vec3(0.25, 0.92, 0.98), sc.rgb * 1.45, uColorMix);
    outCol = mix(bg, wire, line) + sc.rgb * 0.12 * uColorMix;
  } else if (uVariant == 2) {
    // Ocean Bathymetry hypsometric bands
    float qField = floor(field * bands) / bands;
    vec3 deep = vec3(0.03, 0.11, 0.24);
    vec3 mid = vec3(0.08, 0.42, 0.56);
    vec3 shoal = vec3(0.84, 0.92, 0.86);
    vec3 bathy = (qField < 0.5) ? mix(deep, mid, qField * 2.0) : mix(mid, shoal, (qField - 0.5) * 2.0);
    bathy = mix(bathy, sc.rgb, uColorMix * 0.45);
    outCol = mix(bathy, vec3(0.94, 0.98, 1.0), line * 0.78);
  } else if (uVariant == 3) {
    // Technical Blueprint
    vec3 bg = vec3(0.06, 0.18, 0.36) * (0.92 + paper * 0.14);
    outCol = mix(bg, vec3(0.90, 0.96, 1.0), line);
  } else {
    // Classic Swiss Cartography on warm topographic map paper
    float qField = floor(field * bands) / bands;
    vec3 mapBg = mix(vec3(0.94, 0.92, 0.86), vec3(0.86, 0.80, 0.69), qField * 0.65) * (0.94 + paper * 0.1);
    mapBg = mix(mapBg, mix(mapBg, sc.rgb, 0.48), uColorMix);
    vec3 topoInk = mix(vec3(0.36, 0.25, 0.17), vec3(0.11, 0.09, 0.08), majorLine);
    outCol = mix(mapBg, topoInk, line);
  }

  fragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
}
`;
