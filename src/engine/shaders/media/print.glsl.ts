import { MEDIA_COLOR_HELPERS } from './primitives.glsl';

/**
 * Family 3: Printmaking, Halftone & Surface-Stable Dithering
 *
 * 1. Surface-Stable 3D Fractal Dithering (Rune Skovbo Johansen, runevision/Dither3D, 2025)
 *    - Exact 2x2 Jacobian SVD (maxFreq, minFreq)
 *    - 3D recursive Bayer radial distance-field lookup + inverse-CDF brightness calibration ramp
 *    - Unified Bayer-to-Halftone continuum via SizeVariability + optional 4-angle CMYK fractal screen
 *
 * 2. Parallel GPU Error Diffusion / Obra Dinn (Brent Werness, akavel/WernessDithering)
 *    - Exact 9-phase 3x3 modulo checkerboard ping-pong pass with symmetrized 5x5 Atkinson,
 *      Gaussian, and Anisotropic Woodcut Hatching error-diffusion kernels!
 *
 * 3. CMYK Halftone & Spider-Verse Print Split
 *    - Stefan Gustavson (glsl-halftone) 15°/75°/0°/45° rosette + sqrt area-preserving dots + aastep
 *    - AcerolaFX_Halftone + Sony Spider-Verse depth-driven plate misregistration & highlight-hatch / shadow-Ben-Day split
 *
 * 4. Risograph Spot-Color Overprint
 *    - Rob Payot stochastic grain clamping + 3 curated fluorescent soy-ink drums + Kubelka-Munk spectral overprint
 */

export const DITHER3D_FRAG = `#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler3D uDither3DTex;
uniform sampler2D uDitherRampTex;
uniform vec2 uResolution;
uniform vec2 uCamera;
uniform float uZoom;
uniform float uScale;    // fractal dot scale [0..1]
uniform float uDetail;   // edge sharpness / contrast [0..1]
uniform float uTexture;  // _SizeVariability: 0 = Bayer stipple, 1 = halftone variable dots
uniform float uColorMix; // color fidelity [0..1]
uniform int uVariant;    // 0=1-Bit Fractal, 1=Color Stipple, 2=CMYK 4-Angle, 3=Halftone Dots

${MEDIA_COLOR_HELPERS}

// Exact Rune Skovbo Johansen (Dither3DInclude.cginc) 3D fractal dither evaluator
float evalDither3D(vec2 uvDither, float brightness, float scaleParam, float sizeVar, float contrastParam) {
  float xRes = 64.0;
  float invXRes = 1.0 / xRes;
  float dotsPerSide = 4.0;
  float dotsTotal = 16.0;
  float invZRes = 1.0 / dotsTotal;

  float lookupU = 0.5 / 256.0 + (1.0 - 1.0 / 256.0) * clamp(brightness, 0.0, 1.0);
  float brightnessCurve = texture(uDitherRampTex, vec2(lookupU, 0.5)).r;

  // Exact 2x2 Jacobian SVD (Dither3DInclude.cginc lines 68-84)
  vec2 dx = dFdx(uvDither);
  vec2 dy = dFdy(uvDither);
  mat2 matr = mat2(dx, dy);
  vec4 vectorized = vec4(dx, dy);
  float Q = dot(vectorized, vectorized);
  float R = determinant(matr);
  float disc = sqrt(max(0.0, Q * Q - 4.0 * R * R));
  vec2 freq = sqrt(max(vec2(1e-8), vec2(Q + disc, Q - disc) * 0.5));

  float spacing = max(1e-5, freq.y);
  float scaleExp = exp2(scaleParam);
  spacing *= scaleExp * (dotsPerSide * 0.125);

  float brightnessSpacingMul = pow(brightnessCurve * 2.0 + 0.001, -(1.0 - sizeVar));
  spacing *= brightnessSpacingMul;

  float spacingLog = log2(max(1e-5, spacing));
  float patternScaleLevel = floor(spacingLog);
  float f = spacingLog - patternScaleLevel;

  vec2 uv = uvDither / exp2(patternScaleLevel);
  float subLayer = mix(0.25 * dotsTotal, dotsTotal, 1.0 - f);
  subLayer = (subLayer - 0.5) * invZRes;

  float pattern = texture(uDither3DTex, vec3(uv, clamp(subLayer, 0.0, 1.0))).r;

  float contrast = contrastParam * scaleExp * brightnessSpacingMul * 0.1;
  contrast *= pow(clamp(freq.y / max(1e-5, freq.x), 0.05, 1.0), 1.0);

  float baseVal = mix(brightnessCurve, 0.5, clamp(contrast * 0.25, 0.0, 1.0));
  float threshold = 1.0 - brightnessCurve;
  float dotVal = clamp((pattern - threshold) * contrast + baseVal, 0.0, 1.0);
  // Anti-aliased crisp dot decision
  return smoothstep(0.32, 0.68, dotVal + (brightnessCurve - 0.5) * 0.08);
}

mat2 rot2(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec4 sc = texture(uSceneTex, vUv);
  float depth = sc.a;
  vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);

  // Camera-coupled equirectangular + depth-parallax surface coordinates so dots lock to rotating 3D worlds
  vec2 p = (vUv - 0.5) * aspect;
  float yaw = uCamera.x;
  float pitch = uCamera.y;
  // Perspective-aware pseudo-world UV anchored by camera yaw/pitch + scene depth
  vec2 surfUv = (p / max(0.35, uZoom)) * (0.85 + (1.0 - depth) * 0.55) + vec2(yaw * 0.38, pitch * 0.38);
  surfUv *= 2.8;

  float scaleParam = mix(2.2, 5.2, uScale);
  float contrastParam = mix(10.0, 42.0, uDetail);
  float sizeVar = (uVariant == 3) ? 1.0 : uTexture;

  if (uVariant == 2) {
    // 4-Angle CMYK Surface-Stable Fractal Screen (RuneVision Dither3D CMYK mode)
    vec3 cmy = 1.0 - clamp(sc.rgb, 0.0, 1.0);
    float k = min(cmy.x, min(cmy.y, cmy.z)) * 0.78;
    vec3 cmyAdj = (cmy - k) / max(0.05, 1.0 - k);

    float dC = evalDither3D(rot2(0.2618) * surfUv, cmyAdj.x, scaleParam, max(0.35, sizeVar), contrastParam);
    float dM = evalDither3D(rot2(1.3090) * surfUv, cmyAdj.y, scaleParam, max(0.35, sizeVar), contrastParam);
    float dY = evalDither3D(surfUv,                cmyAdj.z, scaleParam, max(0.35, sizeVar), contrastParam);
    float dK = evalDither3D(rot2(0.7854) * surfUv, k,        scaleParam, max(0.35, sizeVar), contrastParam);

    vec3 paper = vec3(0.96, 0.945, 0.91);
    vec3 outCol = paper;
    outCol *= mix(vec3(1.0), vec3(0.05, 0.72, 0.92), dC);
    outCol *= mix(vec3(1.0), vec3(0.92, 0.14, 0.56), dM);
    outCol *= mix(vec3(1.0), vec3(0.98, 0.84, 0.08), dY);
    outCol *= mix(vec3(1.0), vec3(0.09, 0.09, 0.11), dK);
    fragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
    return;
  }

  float lum = rgbToCielabL(sc.rgb);
  float d = evalDither3D(surfUv, lum, scaleParam, sizeVar, contrastParam);

  vec3 outCol;
  if (uVariant == 1) {
    // Vibrant RGB channel-dithered fractal stipple
    float dR = evalDither3D(surfUv, sc.r, scaleParam, sizeVar, contrastParam);
    float dG = evalDither3D(surfUv + vec2(0.37, 0.19), sc.g, scaleParam, sizeVar, contrastParam);
    float dB = evalDither3D(surfUv + vec2(0.71, 0.53), sc.b, scaleParam, sizeVar, contrastParam);
    outCol = mix(vec3(d), vec3(dR, dG, dB), max(0.45, uColorMix));
  } else if (uVariant == 3) {
    // Surface-stable halftone print dots on cream paper
    vec3 paper = vec3(0.95, 0.935, 0.895);
    vec3 ink = mix(vec3(0.08, 0.085, 0.10), sc.rgb * 0.55, uColorMix);
    outCol = mix(ink, paper, d);
  } else {
    // Obra-Dinn / Macintosh 1-Bit Fractal Stipple
    vec3 bg = vec3(0.09, 0.10, 0.11);
    vec3 fg = mix(vec3(0.93, 0.94, 0.88), sc.rgb * 1.25, uColorMix);
    outCol = mix(bg, fg, d);
  }

  fragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
}
`;

// Brent Werness Parallel GPU Error Diffusion (akavel/WernessDithering DitherShader.pde)
// Channel layout: R = input luminance, G = |diffused error|, B = binary output (0 or 1, also sign bit)
export const WERNESS_INIT_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uPrevDitherTex;
uniform sampler2D uEtfTex;
uniform float uEdgeBoost;
uniform float uWarmStart;

${MEDIA_COLOR_HELPERS}

void main() {
  vec3 sc = texture(uSceneTex, vUv).rgb;
  float l = rgbToCielabL(sc);
  // Subtle silhouette ink boost like Obra Dinn 1-bit edge lines
  float edge = texture(uEtfTex, vUv).z;
  l = clamp(l - smoothstep(0.12, 0.35, edge) * uEdgeBoost * 0.45, 0.0, 1.0);

  vec4 prev = texture(uPrevDitherTex, vUv);
  // Warm-start error buffer slightly from previous converged frame to eliminate frame-to-frame shimmer
  float err = prev.g * uWarmStart * 0.35;
  float outBit = (uWarmStart > 0.1) ? prev.b : step(0.5, l);
  fragColor = vec4(l, err, outBit, 1.0);
}
`;

export const WERNESS_STEP_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform vec2 uTexelSize;
uniform int uPx;
uniform int uPy;
uniform int uKernelMode; // 0=Symmetrized Atkinson, 1=Gaussian Fine, 2=Anisotropic Woodcut Hatch

float sampleErr(vec2 uv, float ox, float oy) {
  vec4 t = texture(uTex, clamp(uv + vec2(ox, oy) * uTexelSize, vec2(0.0), vec2(1.0)));
  // Exact Brent Werness error decoding: +err when out=0, -err when out=1
  return t.g * (1.0 - t.b) - t.g * t.b;
}

void main() {
  vec4 cur = texture(uTex, vUv);
  int fx = int(gl_FragCoord.x);
  int fy = int(gl_FragCoord.y);

  // 9-phase 3x3 modulo non-interfering checkerboard update (DitherShader.pde line 155)
  if ((fx % 3) != uPx || (fy % 3) != uPy) {
    fragColor = cur;
    return;
  }

  float diffErr = 0.0;
  if (uKernelMode == 0) {
    // Exact Symmetrized Bill Atkinson 5x5 kernel (DitherShader.pde line 151, bilinearly accelerated)
    diffErr = (
      2.0 * sampleErr(vUv, -1.5,  0.0) +
      2.0 * sampleErr(vUv,  1.5,  0.0) +
      2.0 * sampleErr(vUv,  0.0, -1.5) +
      2.0 * sampleErr(vUv,  0.0,  1.5) +
      sampleErr(vUv, -1.0, -1.0) +
      sampleErr(vUv,  1.0, -1.0) +
      sampleErr(vUv, -1.0,  1.0) +
      sampleErr(vUv,  1.0,  1.0)
    ) / 12.0;
  } else if (uKernelMode == 1) {
    // Smooth isotropic Gaussian sigma=1.0 error diffusion (DitherShader.pde initMyDither)
    diffErr = (
      0.145 * (sampleErr(vUv, -1.0, 0.0) + sampleErr(vUv, 1.0, 0.0) + sampleErr(vUv, 0.0, -1.0) + sampleErr(vUv, 0.0, 1.0)) +
      0.088 * (sampleErr(vUv, -1.0, -1.0) + sampleErr(vUv, 1.0, -1.0) + sampleErr(vUv, -1.0, 1.0) + sampleErr(vUv, 1.0, 1.0)) +
      0.017 * (sampleErr(vUv, -2.0, 0.0) + sampleErr(vUv, 2.0, 0.0) + sampleErr(vUv, 0.0, -2.0) + sampleErr(vUv, 0.0, 2.0))
    );
  } else {
    // Anisotropic Directional Woodcut Hatching Diffusion (DitherShader.pde initDirDither)
    diffErr = (
      0.24 * (sampleErr(vUv, -1.0, -1.0) + sampleErr(vUv, 1.0, 1.0)) +
      0.14 * (sampleErr(vUv, -2.0, -2.0) + sampleErr(vUv, 2.0, 2.0)) +
      0.06 * (sampleErr(vUv, -1.0,  0.0) + sampleErr(vUv, 1.0, 0.0) + sampleErr(vUv, 0.0, -1.0) + sampleErr(vUv, 0.0, 1.0))
    );
  }

  float sum = cur.r + diffErr;
  if (sum > 0.5) {
    fragColor = vec4(cur.r, clamp(1.0 - sum, 0.0, 1.0), 1.0, 1.0);
  } else {
    fragColor = vec4(cur.r, clamp(sum, 0.0, 1.0), 0.0, 1.0);
  }
}
`;

export const WERNESS_OUT_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uDitherTex;
uniform sampler2D uSceneTex;
uniform float uColorMix;
uniform int uVariant; // 0=Atkinson 1-Bit (Obra Dinn), 1=Gaussian Fine, 2=Woodcut Hatch, 3=Amber Mac SE

void main() {
  float bit = texture(uDitherTex, vUv).b;
  vec3 src = texture(uSceneTex, vUv).rgb;

  vec3 darkCol;
  vec3 lightCol;
  if (uVariant == 3) {
    // Vintage Amber Phosphor Macintosh / IBM 1-Bit
    darkCol = vec3(0.09, 0.055, 0.02);
    lightCol = vec3(0.98, 0.72, 0.24);
  } else if (uVariant == 2) {
    // Woodcut ink on warm ivory rag
    darkCol = vec3(0.07, 0.075, 0.09);
    lightCol = vec3(0.95, 0.93, 0.87);
  } else {
    // Classic Obra Dinn 1-Bit Macintosh 1984 cream-and-charcoal
    darkCol = vec3(0.11, 0.125, 0.12);
    lightCol = vec3(0.90, 0.92, 0.84);
  }

  vec3 mono = mix(darkCol, lightCol, bit);
  vec3 colored = mix(darkCol, clamp(src * 1.35 + 0.12, 0.0, 1.0), bit);
  fragColor = vec4(mix(mono, colored, uColorMix), 1.0);
}
`;

// Stefan Gustavson (glsl-halftone) + Garrett Gunnell (AcerolaFX_Halftone) + Sony Spider-Verse Print Split
export const HALFTONE_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uEtfTex;
uniform sampler2D uSubstrateTex;
uniform vec2 uResolution;
uniform vec2 uTexelSize;
uniform float uScale;    // Screen LPI frequency [0..1]
uniform float uDetail;   // Ink contrast & Spider-Verse edge ink [0..1]
uniform float uTexture;  // Depth-driven chromatic plate misregistration [0..1]
uniform float uColorMix; // Color saturation [0..1]
uniform int uVariant;    // 0=Spider-Verse Split, 1=CMYK Rosette, 2=Newsprint Mono, 3=Pop Ben-Day

${MEDIA_COLOR_HELPERS}

// Stefan Gustavson derivative anti-aliased step
float aastep(float threshold, float value) {
  float afwidth = 0.7 * length(vec2(dFdx(value), dFdy(value)));
  return smoothstep(threshold - afwidth, threshold + afwidth, value);
}

float halftoneDot(vec2 pos, float angle, float freq, float coverage) {
  float c = cos(angle);
  float s = sin(angle);
  vec2 st = mat2(c, -s, s, c) * pos * freq;
  vec2 nearest = 2.0 * fract(st) - 1.0;
  float dist = length(nearest);
  // Area-preserving dot radius = sqrt(coverage) (glsl-halftone index.glsl)
  float radius = sqrt(clamp(coverage, 0.0, 1.0)) * 1.12;
  return 1.0 - aastep(radius, dist);
}

void main() {
  vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  vec2 pos = (vUv - 0.5) * aspect;
  float freq = mix(28.0, 96.0, uScale);
  float paper = texture(uSubstrateTex, vUv * 3.8).r;

  vec4 centerSample = texture(uSceneTex, vUv);
  float depth = centerSample.a;

  // Depth-of-field circle-of-confusion drives chromatic plate misregistration (Spider-Verse trick!)
  float coc = abs(depth - 0.52) * 2.0;
  float shiftPx = mix(0.0, 14.0, uTexture) * (0.25 + coc * 1.1);
  vec2 offC = vec2( shiftPx,  shiftPx * 0.35) * uTexelSize;
  vec2 offM = vec2(-shiftPx * 0.6,  shiftPx * 0.85) * uTexelSize;
  vec2 offY = vec2( shiftPx * 0.3, -shiftPx * 0.75) * uTexelSize;

  vec3 colC = texture(uSceneTex, clamp(vUv + offC, vec2(0.0), vec2(1.0))).rgb;
  vec3 colM = texture(uSceneTex, clamp(vUv + offM, vec2(0.0), vec2(1.0))).rgb;
  vec3 colY = texture(uSceneTex, clamp(vUv + offY, vec2(0.0), vec2(1.0))).rgb;
  vec3 colK = centerSample.rgb;

  if (uVariant == 2) {
    // Newsprint Monochrome Halftone (45-deg classic screen + ink bleed grain)
    float l = rgbToCielabL(colK);
    float dotMask = halftoneDot(pos, 0.7854, freq, 1.0 - l + (paper - 0.5) * 0.08);
    vec3 newsPaper = vec3(0.91, 0.89, 0.84) * (0.92 + paper * 0.14);
    vec3 newsInk = vec3(0.10, 0.105, 0.115);
    fragColor = vec4(mix(newsPaper, newsInk, dotMask), 1.0);
    return;
  }

  // Standard CMYK separation with UCR
  vec3 cmy = vec3(1.0 - colC.r, 1.0 - colM.g, 1.0 - colY.b);
  float kBase = 1.0 - max(colK.r, max(colK.g, colK.b));
  float k = kBase * 0.72;
  vec3 cmyk = clamp((cmy - k * 0.7) / max(0.08, 1.0 - k * 0.7), 0.0, 1.0);

  // Classic optical rosette angles: C=15°, M=75°, Y=0°, K=45°
  float dC = halftoneDot(pos, 0.2618, freq, cmyk.x);
  float dM = halftoneDot(pos, 1.3090, freq, cmyk.y);
  float dY = halftoneDot(pos, 0.0,    freq, cmyk.z);
  float dK = halftoneDot(pos, 0.7854, freq, k * mix(0.65, 1.15, uDetail));

  vec3 stock = vec3(0.96, 0.945, 0.905) * (0.94 + paper * 0.09);
  vec3 printed = stock;
  printed *= mix(vec3(1.0), vec3(0.04, 0.70, 0.92), dC * uColorMix);
  printed *= mix(vec3(1.0), vec3(0.92, 0.12, 0.54), dM * uColorMix);
  printed *= mix(vec3(1.0), vec3(0.99, 0.84, 0.06), dY * uColorMix);
  printed *= mix(vec3(1.0), vec3(0.08, 0.085, 0.10), dK);

  if (uVariant == 0) {
    // Sony Spider-Verse Compositing Split:
    // Shadows get graphic Ben-Day dots, highlights get crisp parallel ink hatch lines, midtones stay vivid & cel-clean!
    float lum = rgbToCielabL(colK);
    vec3 comicCel = oklabToSrgb(vec3(floor(lum * 6.0 + 0.5) / 6.0, srgbToOklab(colK).yz * 1.25));
    // Highlight parallel hatch lines (Sony Hatcher)
    float hatchCoord = (pos.x * 0.78 + pos.y * 0.62) * freq * 1.35;
    float hiHatch = 1.0 - aastep(0.28, abs(fract(hatchCoord) - 0.5) * 2.0);
    float hiMask = smoothstep(0.62, 0.88, lum);
    // Shadow Ben-Day dot screen (Sony Thresher)
    float shadowMask = 1.0 - smoothstep(0.18, 0.48, lum);
    vec3 merged = mix(comicCel, printed, shadowMask * 0.75 + coc * 0.55);
    merged = mix(merged, vec3(0.98, 0.96, 0.92), hiHatch * hiMask * 0.55);
    // Bold comic ink outline from ETF gradient
    float edge = texture(uEtfTex, vUv).z;
    float inkEdge = smoothstep(0.14, 0.32, edge * 1.6) * uDetail;
    merged = mix(merged, vec3(0.05, 0.05, 0.07), inkEdge);
    printed = merged;
  } else if (uVariant == 3) {
    // Roy Lichtenstein Pop Ben-Day bold flat primaries + oversized halftone
    vec3 cel = oklabToSrgb(vec3(floor(rgbToCielabL(colK) * 4.0 + 0.5) / 4.0, srgbToOklab(colK).yz * 1.4));
    printed = mix(cel, printed, 0.72);
    float edge = texture(uEtfTex, vUv).z;
    printed = mix(printed, vec3(0.04, 0.04, 0.05), smoothstep(0.12, 0.28, edge * 1.8) * uDetail);
  }

  fragColor = vec4(clamp(printed, 0.0, 1.0), 1.0);
}
`;

// Rob Payot Risograph Spot-Color Ink Grain + Kubelka-Munk Subtractive Overprint
export const RISOGRAPH_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uSubstrateTex;
uniform vec2 uResolution;
uniform vec2 uTexelSize;
uniform float uScale;    // mechanical drum misregistration offset [0..1]
uniform float uDetail;   // stochastic grain crispness [0..1]
uniform float uTexture;  // warm uncoated paper texture [0..1]
uniform float uColorMix; // ink saturation / overprint coverage [0..1]
uniform int uVariant;    // 0=Fluo Pink+Blue, 1=Teal+Sunflower, 2=Crimson+Indigo, 3=Green+Orange

${MEDIA_COLOR_HELPERS}

void main() {
  float shift = mix(1.0, 9.0, uScale);
  vec2 offA = vec2( shift, -shift * 0.45) * uTexelSize;
  vec2 offB = vec2(-shift * 0.7,  shift * 0.8) * uTexelSize;

  vec3 colA = texture(uSceneTex, clamp(vUv + offA, vec2(0.0), vec2(1.0))).rgb;
  vec3 colB = texture(uSceneTex, clamp(vUv + offB, vec2(0.0), vec2(1.0))).rgb;

  // Curated authentic Riso soy-ink drum pairings + warm cream stock
  vec3 inkA;
  vec3 inkB;
  vec3 inkC;
  vec3 paperStock = vec3(0.955, 0.935, 0.885);

  if (uVariant == 1) {
    inkA = vec3(0.00, 0.56, 0.58); // Riso Teal
    inkB = vec3(0.99, 0.72, 0.06); // Riso Sunflower
    inkC = vec3(0.12, 0.14, 0.24); // Deep Slate
  } else if (uVariant == 2) {
    inkA = vec3(0.88, 0.16, 0.28); // Riso Crimson
    inkB = vec3(0.14, 0.22, 0.58); // Riso Federal Blue
    inkC = vec3(0.95, 0.62, 0.22); // Warm Apricot
  } else if (uVariant == 3) {
    inkA = vec3(0.06, 0.64, 0.36); // Riso Kelly Green
    inkB = vec3(0.99, 0.38, 0.12); // Riso Bright Orange
    inkC = vec3(0.16, 0.12, 0.38); // Violet Accent
  } else {
    inkA = vec3(0.99, 0.24, 0.54); // Riso Fluorescent Pink
    inkB = vec3(0.08, 0.34, 0.78); // Riso Medium Blue
    inkC = vec3(0.99, 0.82, 0.08); // Riso Yellow
  }

  // Project source colors onto the 3 ink drums using hue/channel affinity + tonal density
  float lumA = rgbToCielabL(colA);
  float lumB = rgbToCielabL(colB);

  float covA = clamp((colA.r * 0.7 + colA.b * 0.3) * 1.15 - lumA * 0.2 + (1.0 - lumA) * 0.32, 0.0, 1.0);
  float covB = clamp((colB.b * 0.65 + colB.g * 0.35) * 1.15 + (1.0 - lumB) * 0.42 - 0.1, 0.0, 1.0);
  float covC = clamp((colA.g * 0.55 + colA.r * 0.45) * 1.05 * smoothstep(0.35, 0.9, lumA), 0.0, 1.0);

  // Rob Payot stochastic soy-ink grain clamping (blue-noise + paper tooth)
  vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  vec2 grainUv = vUv * aspect * mix(4.0, 11.0, uDetail);
  float gA = texture(uSubstrateTex, grainUv).g;
  float gB = texture(uSubstrateTex, grainUv + vec2(0.37, 0.61)).g;
  float gC = texture(uSubstrateTex, grainUv + vec2(0.73, 0.19)).g;
  float paper = texture(uSubstrateTex, vUv * vec2(3.6, 2.4)).r;

  float soft = mix(0.28, 0.06, uDetail);
  float plateA = smoothstep(gA - soft, gA + soft, covA * uColorMix);
  float plateB = smoothstep(gB - soft, gB + soft, covB * uColorMix);
  float plateC = smoothstep(gC - soft, gC + soft, covC * uColorMix * 0.72);

  // Physical Kubelka-Munk subtractive drum overprinting (Blue + Yellow = Emerald, Pink + Blue = Violet!)
  vec3 result = paperStock * mix(1.0, 0.90 + paper * 0.17, uTexture);
  result = spectralOverprint(result, inkC, plateC * 0.72);
  result = spectralOverprint(result, inkA, plateA * 0.82);
  result = spectralOverprint(result, inkB, plateB * 0.88);

  fragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
}
`;
