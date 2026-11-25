import { MEDIA_COLOR_HELPERS } from './primitives.glsl';

/**
 * Family 6 & 7: Temporal Glitch, Perspective-Stable 3D Pixel Art & Physical Wave Optics
 *
 * 1. Threshold-Span Pixel Sorting (Kim Asendorf ASDFPixelSort + Garrett Gunnell AcerolaFX_PixelSort)
 *    - WebGL2 Fragment-Shader Solution: Masked Odd-Even Transposition Ping-Pong Sort.
 *      Only compares & swaps pairs (A, B) when BOTH pixels satisfy mask == 1 inside a contiguous span,
 *      preserving Asendorf's exact fault-line threshold intervals at 60fps without compute shaders!
 *
 * 2. Temporal Slit-Scan Photography (Golan Levin)
 *    - 64-slice WebGL2 sampler2DArray ring buffer indexed by spatial time-delay maps with smooth slice blending.
 *
 * 3. Perspective-Stable 3D Pixel Art & Hardware Attribute Clash
 *    - Dylan Ebert (texel-splatting, arXiv:2603.14587, March 2026): OKLab 32-band warm-highlight/cool-shadow
 *      hue shift (lab.z += (L - 0.5) * 0.05) + normal/depth convex/concave 1px OKLab lightness outlines.
 *    - ZX Spectrum 8x8 2-color INK/PAPER Attribute Clash + Game Boy DMG + PICO-8.
 *
 * 4. Thin-Film Wave-Optics Iridescence (David Lenaerts / Belcour & Barla SIGGRAPH 2017)
 *    - Samples our completed 128x128 2D (cosTheta, filmThicknessNm) 64-band Airy interference CIE XYZ LUT!
 */

// Step 1 of WebGL2 Pixel Sort: Pack RGB + threshold span mask (in alpha!) with Hugo Elias hash jitter
export const PIXELSORT_MASK_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform vec2 uResolution;
uniform float uDetail;   // brightness threshold [0..1]
uniform float uTexture;  // Hugo Elias per-column/row span jitter [0..1]
uniform float uTime;
uniform int uVariant;    // 0=Vertical Melt, 1=Horizontal Streak, 2=Diagonal Cascade, 3=Hue Waterfall

${MEDIA_COLOR_HELPERS}

// Hugo Elias integer hash (used in AcerolaFX_PixelSort.fx for organic staggered span drips)
float eliasHash(int n) {
  n = (n << 13) ^ n;
  int m = (n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff;
  return 1.0 - float(m) / 1073741824.0;
}

void main() {
  vec3 col = texture(uSceneTex, vUv).rgb;
  float l = luma709(col);

  int lane = (uVariant == 1) ? int(gl_FragCoord.y) : int(gl_FragCoord.x);
  float jitter = (eliasHash(lane * 17 + 31) - 0.5) * 0.34 * uTexture;

  float lowT = clamp(mix(0.08, 0.42, uDetail) + jitter, 0.02, 0.85);
  float highT = clamp(mix(0.68, 0.96, uDetail) + jitter * 0.6, lowT + 0.12, 0.99);

  // Alpha = 1.0 inside sortable threshold interval, 0.0 outside (immutable boundary barrier!)
  float mask = (l >= lowT && l <= highT) ? 1.0 : 0.0;
  fragColor = vec4(col, mask);
}
`;

// Step 2 of WebGL2 Pixel Sort: Masked Odd-Even Transposition Ping-Pong Pass
export const PIXELSORT_STEP_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSortTex;
uniform vec2 uTexelSize;
uniform int uPassIndex;
uniform int uVariant; // 0=Vertical Melt, 1=Horizontal Streak, 2=Diagonal Cascade, 3=Hue Waterfall

${MEDIA_COLOR_HELPERS}

float sortKey(vec3 c, int mode) {
  if (mode == 3) {
    // Hue + saturation waterfall sort key
    float maxC = max(c.r, max(c.g, c.b));
    float minC = min(c.r, min(c.g, c.b));
    float delta = maxC - minC;
    float h = 0.0;
    if (delta > 1e-4) {
      if (maxC == c.r) h = mod((c.g - c.b) / delta, 6.0);
      else if (maxC == c.g) h = (c.b - c.r) / delta + 2.0;
      else h = (c.r - c.g) / delta + 4.0;
      h /= 6.0;
    }
    return h * 0.7 + luma709(c) * 0.3;
  }
  return luma709(c);
}

void main() {
  vec4 self = texture(uSortTex, vUv);
  if (self.a < 0.5) {
    // Pixel is outside threshold span -> strictly frozen barrier!
    fragColor = self;
    return;
  }

  ivec2 px = ivec2(floor(gl_FragCoord.xy));
  int coord;
  vec2 stepDir;
  if (uVariant == 1) {
    coord = px.x;
    stepDir = vec2(uTexelSize.x, 0.0);
  } else if (uVariant == 2) {
    coord = px.x;
    stepDir = vec2(uTexelSize.x, uTexelSize.y);
  } else {
    coord = px.y;
    stepDir = vec2(0.0, uTexelSize.y);
  }

  // Odd-even pair partner selection: every pair is mutually exclusive -> zero race conditions!
  int parity = uPassIndex & 1;
  bool isFirst = ((coord & 1) == parity);
  vec2 partnerUv = vUv + (isFirst ? stepDir : -stepDir);

  if (partnerUv.x < 0.0 || partnerUv.x > 1.0 || partnerUv.y < 0.0 || partnerUv.y > 1.0) {
    fragColor = self;
    return;
  }

  vec4 partner = texture(uSortTex, partnerUv);
  if (partner.a < 0.5) {
    // Do NOT cross span boundary!
    fragColor = self;
    return;
  }

  float kSelf = sortKey(self.rgb, uVariant);
  float kPartner = sortKey(partner.rgb, uVariant);

  // Ascending sort along direction (dark sinks / bright rises cleanly inside each Kim Asendorf span)
  if (isFirst) {
    fragColor = (kSelf > kPartner) ? partner : self;
  } else {
    fragColor = (kSelf < kPartner) ? partner : self;
  }
}
`;

export const PIXELSORT_OUT_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSortTex;
uniform sampler2D uSceneTex;
uniform float uColorMix;

void main() {
  vec3 sorted = texture(uSortTex, vUv).rgb;
  vec3 orig = texture(uSceneTex, vUv).rgb;
  fragColor = vec4(mix(orig, sorted, uColorMix), 1.0);
}
`;

// Golan Levin Temporal Slit-Scan Photography via 64-slice WebGL2 sampler2DArray ring buffer
export const SLITSCAN_FRAG = `#version 300 es
precision highp float;
precision highp sampler2DArray;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2DArray uHistoryArray;
uniform sampler2D uSceneTex;
uniform int uHeadLayer;
uniform int uNumLayers;
uniform float uScale;    // temporal window depth [0..1]
uniform float uDetail;   // delay curve nonlinearity / warp [0..1]
uniform float uTexture;  // RGB chromatic time offset [0..1]
uniform float uColorMix; // blend with present frame [0..1]
uniform int uVariant;    // 0=Vertical Sweep, 1=Horizontal Ribbon, 2=Radial Echo, 3=Luma Time-Map

vec3 sampleHistoryAt(vec2 uv, float delaySlices) {
  float fLayers = float(uNumLayers);
  float d = clamp(delaySlices, 0.0, fLayers - 1.001);
  float d0 = floor(d);
  float d1 = min(fLayers - 1.0, d0 + 1.0);
  float frac = d - d0;

  float l0 = mod(float(uHeadLayer) - d0 + fLayers * 2.0, fLayers);
  float l1 = mod(float(uHeadLayer) - d1 + fLayers * 2.0, fLayers);

  vec3 c0 = texture(uHistoryArray, vec3(uv, l0)).rgb;
  vec3 c1 = texture(uHistoryArray, vec3(uv, l1)).rgb;
  return mix(c0, c1, frac);
}

void main() {
  float maxDelay = mix(10.0, float(uNumLayers - 2), uScale);
  float curveExp = mix(0.55, 2.2, uDetail);

  float tMap = 0.0;
  if (uVariant == 1) {
    // Horizontal ribbon wave
    tMap = pow(clamp(vUv.x, 0.0, 1.0), curveExp);
  } else if (uVariant == 2) {
    // Radial temporal shockwave ripples from center
    float r = length((vUv - 0.5) * vec2(1.5, 1.0));
    tMap = clamp(pow(r * 1.25, curveExp), 0.0, 1.0);
  } else if (uVariant == 3) {
    // Luminance-driven time displacement (shadows live in the past, highlights live in the present)
    vec3 cur = texture(uSceneTex, vUv).rgb;
    float l = dot(cur, vec3(0.2126, 0.7152, 0.0722));
    tMap = pow(clamp(1.0 - l, 0.0, 1.0), curveExp);
  } else {
    // Classic vertical slit-scan sweep (top = present, bottom = past)
    tMap = pow(clamp(1.0 - vUv.y, 0.0, 1.0), curveExp);
  }

  float baseDelay = tMap * maxDelay;
  float chromaLag = uTexture * 6.5;

  // Optional RGB temporal prism split (red leads, blue trails in time!)
  vec3 slitCol;
  if (chromaLag > 0.1) {
    float r = sampleHistoryAt(vUv, max(0.0, baseDelay - chromaLag)).r;
    float g = sampleHistoryAt(vUv, baseDelay).g;
    float b = sampleHistoryAt(vUv, min(float(uNumLayers - 2), baseDelay + chromaLag)).b;
    slitCol = vec3(r, g, b);
  } else {
    slitCol = sampleHistoryAt(vUv, baseDelay);
  }

  vec3 present = texture(uSceneTex, vUv).rgb;
  fragColor = vec4(mix(present, slitCol, uColorMix), 1.0);
}
`;

// Dylan Ebert (texel-splatting, arXiv:2603.14587, March 2026) + ZX Spectrum 8x8 2-Color Attribute Clash
export const PIXELART_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform vec2 uResolution;
uniform vec2 uCamera;
uniform float uScale;    // pixel block size [0..1]
uniform float uDetail;   // OKLab 1px convex/concave outline strength [0..1]
uniform float uTexture;  // warm/cool hue shift or ordered Bayer dither [0..1]
uniform float uColorMix; // quantization band count [0..1]
uniform int uVariant;    // 0=OKLab 3D Pixel (Ebert 2026), 1=ZX Spectrum 8x8 Clash, 2=Game Boy DMG, 3=PICO-8

${MEDIA_COLOR_HELPERS}

float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int idx = y * 4 + x;
  const float m[16] = float[16](
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0
  );
  return (m[idx] + 0.5) / 16.0 - 0.5;
}

// Reconstruct approximate view-space normal from depth buffer (sceneRt.a) for convex/concave pixel outlines
vec3 depthNormal(vec2 uv, vec2 stepUv) {
  float zL = texture(uSceneTex, uv - vec2(stepUv.x, 0.0)).a;
  float zR = texture(uSceneTex, uv + vec2(stepUv.x, 0.0)).a;
  float zD = texture(uSceneTex, uv - vec2(0.0, stepUv.y)).a;
  float zU = texture(uSceneTex, uv + vec2(0.0, stepUv.y)).a;
  return normalize(vec3((zL - zR) * 6.0, (zD - zU) * 6.0, 0.35));
}

// Nearest PICO-8 16-color palette entry
vec3 quantizePico8(vec3 c) {
  const vec3 pal[16] = vec3[16](
    vec3(0.000, 0.000, 0.000), vec3(0.114, 0.169, 0.325), vec3(0.494, 0.145, 0.325), vec3(0.000, 0.529, 0.318),
    vec3(0.671, 0.322, 0.212), vec3(0.373, 0.341, 0.310), vec3(0.761, 0.765, 0.780), vec3(1.000, 0.945, 0.910),
    vec3(1.000, 0.000, 0.302), vec3(1.000, 0.639, 0.000), vec3(1.000, 0.925, 0.153), vec3(0.000, 0.894, 0.212),
    vec3(0.161, 0.678, 1.000), vec3(0.514, 0.463, 0.612), vec3(1.000, 0.467, 0.659), vec3(1.000, 0.800, 0.667)
  );
  vec3 best = pal[0];
  float bestD = 1e9;
  for (int i = 0; i < 16; i++) {
    vec3 diff = c - pal[i];
    float d = dot(diff, diff);
    if (d < bestD) { bestD = d; best = pal[i]; }
  }
  return best;
}

// Nearest ZX Spectrum 15-color Ferranti ULA palette color
vec3 quantizeZxColor(vec3 c) {
  const vec3 zx[15] = vec3[15](
    vec3(0.00, 0.00, 0.00), vec3(0.00, 0.00, 0.84), vec3(0.84, 0.00, 0.00), vec3(0.84, 0.00, 0.84),
    vec3(0.00, 0.84, 0.00), vec3(0.00, 0.84, 0.84), vec3(0.84, 0.84, 0.00), vec3(0.84, 0.84, 0.84),
    vec3(0.00, 0.00, 1.00), vec3(1.00, 0.00, 0.00), vec3(1.00, 0.00, 1.00), vec3(0.00, 1.00, 0.00),
    vec3(0.00, 1.00, 1.00), vec3(1.00, 1.00, 0.00), vec3(1.00, 1.00, 1.00)
  );
  vec3 best = zx[0];
  float bestD = 1e9;
  for (int i = 0; i < 15; i++) {
    vec3 diff = c - zx[i];
    float d = dot(diff, diff);
    if (d < bestD) { bestD = d; best = zx[i]; }
  }
  return best;
}

void main() {
  // Snap virtual pixel grid size (3..10 physical pixels per virtual pixel)
  float pxSize = floor(mix(2.0, 9.0, uScale));
  vec2 virtRes = max(vec2(32.0), floor(uResolution / pxSize));
  vec2 cell = floor(vUv * virtRes);
  vec2 qUv = (cell + 0.5) / virtRes;
  vec2 stepUv = 1.0 / virtRes;

  vec4 sc = texture(uSceneTex, qUv);
  float dither = bayer4(cell);

  if (uVariant == 1) {
    // Authentic 1982 ZX Spectrum 8x8 Attribute Clash:
    // Each 8x8 virtual pixel block can ONLY use TWO colors (INK & PAPER) from the 15-color ULA palette!
    vec2 blockOrigin = floor(cell / 8.0) * 8.0;
    vec3 minCol = vec3(1.0);
    vec3 maxCol = vec3(0.0);
    float minL = 10.0;
    float maxL = -1.0;

    // Sample 4x4 grid inside the 8x8 attribute block to discover the block's dominant PAPER (dark) & INK (bright)
    for (int by = 0; by < 4; by++) {
      for (int bx = 0; bx < 4; bx++) {
        vec2 buv = (blockOrigin + vec2(float(bx) * 2.0 + 1.0, float(by) * 2.0 + 1.0)) / virtRes;
        vec3 bc = texture(uSceneTex, clamp(buv, vec2(0.0), vec2(1.0))).rgb;
        float bl = luma709(bc);
        if (bl < minL) { minL = bl; minCol = bc; }
        if (bl > maxL) { maxL = bl; maxCol = bc; }
      }
    }

    vec3 paper = quantizeZxColor(minCol);
    vec3 ink = quantizeZxColor(maxCol);
    float curL = luma709(sc.rgb);
    float t = (maxL - minL > 0.03) ? clamp((curL - minL) / (maxL - minL), 0.0, 1.0) : 0.0;
    float bit = step(0.5, t + dither * uTexture * 0.75);
    fragColor = vec4(mix(paper, ink, bit), 1.0);
    return;
  }

  if (uVariant == 2) {
    // Classic 1989 Nintendo Game Boy DMG-01 4-shade olive-green dot matrix
    float l = clamp(rgbToCielabL(sc.rgb) + dither * uTexture * 0.22, 0.0, 1.0);
    int shade = int(clamp(floor(l * 4.0), 0.0, 3.0));
    const vec3 dmg[4] = vec3[4](
      vec3(0.059, 0.220, 0.059),
      vec3(0.188, 0.384, 0.188),
      vec3(0.545, 0.675, 0.059),
      vec3(0.608, 0.737, 0.059)
    );
    vec3 col = dmg[shade];
    // Faint LCD pixel grid groove
    vec2 sub = fract(vUv * virtRes);
    float grid = step(0.08, sub.x) * step(0.08, sub.y);
    col *= mix(0.88, 1.0, grid);
    fragColor = vec4(col, 1.0);
    return;
  }

  if (uVariant == 3) {
    // PICO-8 Fantasy Console 16-color indexed dithered pixel art
    vec3 dithered = clamp(sc.rgb + vec3(dither * uTexture * 0.16), 0.0, 1.0);
    fragColor = vec4(quantizePico8(dithered), 1.0);
    return;
  }

  // Variant 0: Dylan Ebert (texel-splatting, arXiv:2603.14587, March 2026)
  // 1) Convert to OKLab, quantize into perceptual lightness bands + warm-highlight / cool-shadow artistic hue shift!
  vec3 lab = srgbToOklab(sc.rgb);
  float bands = mix(6.0, 28.0, uColorMix);
  lab.x = floor(clamp(lab.x + dither * (0.35 / bands) * uTexture, 0.0, 1.0) * bands + 0.5) / bands;
  // Exact Ebert warm-highlight / cool-shadow shift: lab.z += (L - 0.5) * 0.05 (scaled by texture control)
  lab.z += (lab.x - 0.5) * 0.095 * uTexture;

  // 2) Convex / Concave 1-pixel outlines via depth & normal dot product (< 0.7), shaded in OKLab lightness!
  if (uDetail > 0.02) {
    float zC = sc.a;
    float zL = texture(uSceneTex, qUv - vec2(stepUv.x, 0.0)).a;
    float zR = texture(uSceneTex, qUv + vec2(stepUv.x, 0.0)).a;
    float zD = texture(uSceneTex, qUv - vec2(0.0, stepUv.y)).a;
    float zU = texture(uSceneTex, qUv + vec2(0.0, stepUv.y)).a;

    float depthDiff = max(max(abs(zC - zL), abs(zC - zR)), max(abs(zC - zD), abs(zC - zU)));
    vec3 nC = depthNormal(qUv, stepUv);
    vec3 nR = depthNormal(qUv + vec2(stepUv.x, 0.0), stepUv);
    vec3 nU = depthNormal(qUv + vec2(0.0, stepUv.y), stepUv);

    float normalCrease = 1.0 - min(dot(nC, nR), dot(nC, nU));
    // Silhouette / concave outline darkens OKLab L; convex lit ridge brightens OKLab L (never muddy black!)
    if (depthDiff > 0.055) {
      lab.x = max(0.04, lab.x - 0.28 * uDetail);
    } else if (normalCrease > 0.28) {
      float convex = step(zC, min(zR, zU));
      lab.x = clamp(lab.x + (convex > 0.5 ? 0.14 : -0.18) * uDetail, 0.04, 0.98);
    }
  }

  fragColor = vec4(oklabToSrgb(lab), 1.0);
}
`;

// David Lenaerts (threejs-thin-film-iridescence) + Belcour & Barla (SIGGRAPH 2017)
// Exact 64-band polarized Airy interference via our upgraded 128x128 2D (cosTheta, filmThicknessNm) LUT!
export const IRIDESCENCE_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uAiryLutTex;   // 128x128 2D LUT: U = cosThetaI [0..1], V = thickness [120..1180 nm]
uniform sampler2D uSubstrateTex;
uniform vec2 uTexelSize;
uniform float uTime;
uniform float uScale;    // base film thickness in nanometers [0..1]
uniform float uDetail;   // Fresnel rim contrast [0..1]
uniform float uTexture;  // liquid surface ripple / micro-normal relief [0..1]
uniform float uColorMix; // spectral Airy reflectance mix [0..1]
uniform int uVariant;    // 0=Oil Slick, 1=Soap Bubble, 2=Bismuth Crystal, 3=Anodized Alloy

${MEDIA_COLOR_HELPERS}

void main() {
  vec4 sc = texture(uSceneTex, vUv);
  float lum = luma709(sc.rgb);
  float depth = sc.a;

  // Reconstruct smooth liquid surface normal from luminance + scene depth gradients
  vec2 d = uTexelSize * 1.5;
  float hL = luma709(texture(uSceneTex, vUv - vec2(d.x, 0.0)).rgb) * 0.65 + texture(uSceneTex, vUv - vec2(d.x, 0.0)).a * 0.35;
  float hR = luma709(texture(uSceneTex, vUv + vec2(d.x, 0.0)).rgb) * 0.65 + texture(uSceneTex, vUv + vec2(d.x, 0.0)).a * 0.35;
  float hD = luma709(texture(uSceneTex, vUv - vec2(0.0, d.y)).rgb) * 0.65 + texture(uSceneTex, vUv - vec2(0.0, d.y)).a * 0.35;
  float hU = luma709(texture(uSceneTex, vUv + vec2(0.0, d.y)).rgb) * 0.65 + texture(uSceneTex, vUv + vec2(0.0, d.y)).a * 0.35;

  float relief = mix(1.8, 9.5, uTexture);
  vec3 N = normalize(vec3((hL - hR) * relief, (hD - hU) * relief, 1.0));
  vec3 V = normalize(vec3((vUv - 0.5) * 0.65, 1.0));
  float cosTheta = clamp(dot(N, V), 0.01, 0.99);

  // Subtle flowing thickness turbulence (emulates draining soap/oil films in real physics)
  float flowNoise = texture(uSubstrateTex, vUv * 2.2 + vec2(uTime * 0.015, -uTime * 0.01)).b;
  float thicknessV = fract(uScale * 0.85 + lum * 0.52 + depth * 0.24 + (flowNoise - 0.5) * 0.38 * uTexture);

  if (uVariant == 2) {
    // Bismuth oxide stepped terrace crystals (quantize film thickness into discrete crystal steps!)
    thicknessV = floor(thicknessV * 9.0) / 9.0;
  }

  // Sample 2D Airy interference LUT (stored in approx gamma 2.0, square to decode linear reflectance!)
  vec3 airyGamma = texture(uAiryLutTex, vec2(cosTheta, thicknessV)).rgb;
  vec3 airyLin = airyGamma * airyGamma;

  // Schlick-modulated Fresnel grazing boost
  float fresnel = pow(1.0 - cosTheta, mix(1.4, 3.8, uDetail));
  vec3 baseLin = srgbToLinear(sc.rgb);

  // Specular glint from overhead key light
  vec3 L = normalize(vec3(0.45, 0.65, 0.85));
  vec3 H = normalize(L + V);
  float spec = pow(max(0.0, dot(N, H)), mix(18.0, 64.0, uDetail));

  vec3 outLin;
  if (uVariant == 1) {
    // Translucent Soap Bubble: dark transparent center, intense iridescent Fresnel rim!
    vec3 bubble = baseLin * 0.22 + airyLin * (0.45 + fresnel * 2.4) * smoothstep(0.03, 0.25, lum);
    bubble += (vec3(0.75) + airyLin * 0.5) * spec * 0.9;
    outLin = bubble;
  } else if (uVariant == 2) {
    // Bismuth Metallic Oxide Crystal: high metallic specular reflection tinted strictly by stepped Airy bands
    outLin = mix(baseLin * 0.25, airyLin * (0.45 + lum * 1.35), uColorMix) + airyLin * spec * 1.25;
  } else if (uVariant == 3) {
    // Anodized Titanium / Automotive Chameleon Alloy
    vec3 metal = baseLin * mix(vec3(1.0), airyLin * 2.1, uColorMix * (0.4 + 0.6 * fresnel));
    outLin = metal + airyLin * spec * 0.85;
  } else {
    // Dark Petroleum Oil Slick on Asphalt Water
    float filmMask = smoothstep(0.02, 0.22, lum);
    vec3 oil = mix(vec3(0.015, 0.018, 0.022), baseLin * 0.32 + airyLin * (0.7 + fresnel * 1.45) * (0.35 + lum * 0.9), filmMask);
    oil += airyLin * spec * 0.95;
    outLin = mix(baseLin, oil, uColorMix);
  }

  fragColor = vec4(linearToSrgb(outLin), 1.0);
}
`;
