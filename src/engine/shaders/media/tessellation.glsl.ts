import { MEDIA_COLOR_HELPERS } from './primitives.glsl';

/**
 * Family 5: Geometric Tessellation, Stippling & Decorative Mosaics
 *
 * 1. JFA Cathedral Stained Glass (Rong & Tan I3D 2006 Jump Flooding Voronoi)
 * 2. Byzantine Edge-Aligned Tile Mosaics (Alejo Hausner SIGGRAPH 2001, ETF-rotated L1 Manhattan JFA)
 * 3. Weighted Voronoi Stippling (Adrian Secord NPAR 2002 / Windell Oskay StippleGen)
 */

export const STAINED_GLASS_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uJfaTex;
uniform sampler2D uSubstrateTex;
uniform vec2 uTexelSize;
uniform vec2 uResolution;
uniform float uScale;    // pane density [0..1]
uniform float uDetail;   // lead came border width [0..1]
uniform float uTexture;  // backlit caustic transmission & beveled glass ripples [0..1]
uniform float uColorMix; // jewel saturation [0..1]
uniform int uVariant;    // 0=Cathedral Lead, 1=Rose Window, 2=Frosted Crystal, 3=Obsidian Wire

${MEDIA_COLOR_HELPERS}

void main() {
  vec4 seed = texture(uJfaTex, vUv);
  vec2 seedUv = (seed.z > 0.5) ? seed.xy : vUv;

  // Sample average pane color around seed center for unified solid stained-glass shards
  vec3 c0 = texture(uSceneTex, seedUv).rgb;
  vec3 c1 = texture(uSceneTex, clamp(seedUv + uTexelSize * 2.0, vec2(0.0), vec2(1.0))).rgb;
  vec3 c2 = texture(uSceneTex, clamp(seedUv - uTexelSize * 2.0, vec2(0.0), vec2(1.0))).rgb;
  vec3 paneCol = (c0 * 0.5 + c1 * 0.25 + c2 * 0.25);

  // Detect cell boundaries (lead cames) where neighbors belong to a different Voronoi seed
  float borderPx = mix(1.0, 3.2, uDetail);
  vec2 off = uTexelSize * borderPx;
  vec2 sL = texture(uJfaTex, clamp(vUv - vec2(off.x, 0.0), vec2(0.0), vec2(1.0))).xy;
  vec2 sR = texture(uJfaTex, clamp(vUv + vec2(off.x, 0.0), vec2(0.0), vec2(1.0))).xy;
  vec2 sD = texture(uJfaTex, clamp(vUv - vec2(0.0, off.y), vec2(0.0), vec2(1.0))).xy;
  vec2 sU = texture(uJfaTex, clamp(vUv + vec2(0.0, off.y), vec2(0.0), vec2(1.0))).xy;

  float diff =
    step(0.0025, length(sL - seedUv)) +
    step(0.0025, length(sR - seedUv)) +
    step(0.0025, length(sD - seedUv)) +
    step(0.0025, length(sU - seedUv));
  float leadMask = smoothstep(0.2, 1.5, diff);

  // Distance from pane center -> backlit interior caustic gradient & beveled edge refraction
  vec2 dPx = (vUv - seedUv) * uResolution;
  float distNorm = clamp(length(dPx) / mix(34.0, 10.0, uScale), 0.0, 1.2);
  float ripple = texture(uSubstrateTex, vUv * 4.5 + seedUv * 3.0).r;

  // Enrich glass color into luminous cathedral jewel tones in OKLab
  vec3 lab = srgbToOklab(paneCol);
  lab.x = clamp(lab.x * 1.08 + 0.04, 0.0, 1.0);
  lab.yz *= mix(0.9, 1.55, uColorMix);
  vec3 jewel = oklabToSrgb(lab);

  // Backlit transmission: bright luminous core, richer saturated bevel near lead came
  float caustic = (1.0 - distNorm * 0.42) + (ripple - 0.5) * 0.28 * uTexture;
  // Directional sunlight glint across glass shard tilt derived from seed hash
  vec2 tilt = normalize(fract(seedUv * vec2(41.7, 73.1)) - 0.5 + 1e-4);
  float bevelLight = clamp(dot(normalize(dPx + 1e-4), tilt) * 0.22 * uTexture, -0.18, 0.25);

  vec3 glassCol = jewel * clamp(caustic + bevelLight, 0.35, 1.45);
  vec3 leadCol = vec3(0.045, 0.048, 0.055) + vec3(0.08) * max(0.0, bevelLight * 2.0);

  if (uVariant == 1) {
    // Gothic Rose Window: warm golden-hour sunlight bloom through ruby/cobalt glass
    glassCol *= vec3(1.08, 0.98, 0.92);
    glassCol += jewel * (1.0 - distNorm) * 0.35 * uTexture;
  } else if (uVariant == 2) {
    // Frosted Crystal / Tiffany translucent opalescent glass
    glassCol = mix(glassCol, vec3(0.92, 0.95, 0.98), 0.28 * uTexture + ripple * 0.16);
    leadCol = vec3(0.24, 0.26, 0.29);
  } else if (uVariant == 3) {
    // Obsidian glowing wireframe Voronoi shards
    glassCol = jewel * 0.25 + vec3(0.02);
    leadCol = mix(vec3(0.95, 0.78, 0.38), jewel * 1.65, uColorMix);
  }

  vec3 outCol = mix(glassCol, leadCol, leadMask);
  fragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
}
`;

// Alejo Hausner (SIGGRAPH 2001) Edge-Aligned Byzantine Decorative Tile Mosaic
export const MOSAIC_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uJfaTex;
uniform sampler2D uEtfTex;
uniform sampler2D uSubstrateTex;
uniform vec2 uTexelSize;
uniform vec2 uResolution;
uniform float uScale;    // tesserae size [0..1]
uniform float uDetail;   // tile bevel crispness [0..1]
uniform float uTexture;  // mortar grout width & stone grain [0..1]
uniform float uColorMix; // ceramic glaze saturation [0..1]
uniform int uVariant;    // 0=Roman Ceramic, 1=Gold Leaf, 2=Stone Travertine, 3=Terrazzo Shard

${MEDIA_COLOR_HELPERS}

void main() {
  vec4 seed = texture(uJfaTex, vUv);
  vec2 seedUv = (seed.z > 0.5) ? seed.xy : vUv;

  vec3 tileCol = texture(uSceneTex, seedUv).rgb;
  vec2 t = texture(uEtfTex, seedUv).xy;
  float lenT = length(t);
  t = (lenT > 1e-4) ? (t / lenT) : vec2(1.0, 0.0);

  // Local tile coordinates rotated into the Hausner ETF tangent frame
  vec2 dPx = (vUv - seedUv) * uResolution;
  vec2 rot = vec2(dPx.x * t.x + dPx.y * t.y, -dPx.x * t.y + dPx.y * t.x);
  float tileHalf = mix(15.0, 4.5, uScale);

  // Detect neighbor Voronoi boundary to carve mortar grout seamlessly between tiles
  float groutPx = mix(0.6, 2.6, uTexture);
  vec2 off = uTexelSize * groutPx;
  float edgeDiff =
    step(0.0025, length(texture(uJfaTex, clamp(vUv - vec2(off.x, 0.0), vec2(0.0), vec2(1.0))).xy - seedUv)) +
    step(0.0025, length(texture(uJfaTex, clamp(vUv + vec2(off.x, 0.0), vec2(0.0), vec2(1.0))).xy - seedUv)) +
    step(0.0025, length(texture(uJfaTex, clamp(vUv - vec2(0.0, off.y), vec2(0.0), vec2(1.0))).xy - seedUv)) +
    step(0.0025, length(texture(uJfaTex, clamp(vUv + vec2(0.0, off.y), vec2(0.0), vec2(1.0))).xy - seedUv));

  // Combine neighbor boundary with square L_inf / L1 tesserae inset for crisp hand-cut ceramic corners
  float boxMask = smoothstep(tileHalf * 0.82, tileHalf * 1.05, max(abs(rot.x), abs(rot.y)));
  float groutMask = clamp(max(smoothstep(0.2, 1.4, edgeDiff), boxMask * uTexture), 0.0, 1.0);

  float stoneGrain = texture(uSubstrateTex, vUv * 5.0).r;
  float tileRand = fract(sin(dot(seedUv * 127.1, vec2(12.9898, 78.233))) * 43758.5453);

  // Subtle ceramic glaze variation per tile (hand-fired kiln jitter)
  vec3 lab = srgbToOklab(tileCol);
  lab.x = clamp(lab.x + (tileRand - 0.5) * 0.06, 0.0, 1.0);
  lab.yz *= mix(0.7, 1.35, uColorMix);
  vec3 glaze = oklabToSrgb(lab);

  // Ceramic edge bevel highlight catching overhead raking light
  vec2 bevelN = normalize(rot / max(1.0, tileHalf) + vec2(0.001));
  float spec = pow(max(0.0, dot(bevelN, normalize(vec2(-0.6, 0.8)))), 4.0) * 0.28 * uDetail;
  glaze += vec3(spec) + (stoneGrain - 0.5) * 0.08 * uTexture;

  vec3 mortarCol = vec3(0.22, 0.20, 0.18) * (0.85 + stoneGrain * 0.3);

  if (uVariant == 1) {
    // Byzantine Ravenna Gold Leaf Tesserae on luminous regions
    float lum = luma709(tileCol);
    vec3 gold = vec3(0.96, 0.78, 0.30) * (0.85 + 0.35 * tileRand + spec * 1.8);
    glaze = mix(glaze * 0.85, gold, smoothstep(0.45, 0.85, lum) * 0.82);
    mortarCol = vec3(0.14, 0.11, 0.08);
  } else if (uVariant == 2) {
    // Matte Roman Travertine Stone (earthy warm palette)
    vec3 travertine = mix(vec3(0.76, 0.68, 0.56), glaze, 0.58);
    glaze = travertine * (0.88 + stoneGrain * 0.24);
    mortarCol = vec3(0.84, 0.80, 0.73);
  } else if (uVariant == 3) {
    // Terrazzo polished aggregate chips set in pale cream concrete
    mortarCol = vec3(0.90, 0.88, 0.84) * (0.92 + stoneGrain * 0.15);
    groutMask = smoothstep(0.15, 0.65, max(groutMask, smoothstep(tileHalf * 0.62, tileHalf * 0.92, length(rot))));
  }

  vec3 outCol = mix(glaze, mortarCol, groutMask);
  fragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
}
`;

// Adrian Secord (NPAR 2002) / Windell Oskay (StippleGen) Importance-Weighted Voronoi Stippling
export const STIPPLE_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uJfaTex;
uniform sampler2D uSubstrateTex;
uniform vec2 uTexelSize;
uniform vec2 uResolution;
uniform float uScale;    // stipple density [0..1]
uniform float uDetail;   // dot radius [0..1]
uniform float uTexture;  // paper grain [0..1]
uniform float uColorMix; // Seurat pointillism color mix [0..1]
uniform int uVariant;    // 0=Archival Ink, 1=Seurat Pointillism, 2=Chalk on Slate, 3=Voronoi Mesh

${MEDIA_COLOR_HELPERS}

void main() {
  vec4 seed = texture(uJfaTex, vUv);
  float paper = texture(uSubstrateTex, vUv * 3.8).r;

  if (seed.z < 0.5) {
    vec3 emptyBg = (uVariant == 2) ? vec3(0.07, 0.08, 0.10) : vec3(0.955, 0.94, 0.90);
    fragColor = vec4(emptyBg, 1.0);
    return;
  }

  vec2 seedUv = seed.xy;
  vec3 sc = texture(uSceneTex, seedUv).rgb;
  float lum = rgbToCielabL(sc);
  float darkness = clamp(1.0 - lum, 0.0, 1.0);

  vec2 dPx = (vUv - seedUv) * uResolution;
  float distPx = length(dPx);

  // Secord / StippleGen variable dot radius proportional to local darkness
  float maxR = mix(4.2, 1.8, uScale) * mix(0.55, 1.55, uDetail);
  float dotR = (uVariant == 2)
    ? maxR * (0.25 + 0.85 * lum)
    : maxR * (0.2 + 0.92 * darkness);

  float dotMask = 1.0 - smoothstep(dotR - 0.65, dotR + 0.55, distPx);

  vec3 outCol;
  if (uVariant == 1) {
    // Georges Seurat Chromatic Pointillism on luminous canvas
    vec3 canvasCol = vec3(0.96, 0.94, 0.89) * (0.93 + paper * 0.12 * uTexture);
    vec3 lab = srgbToOklab(sc);
    lab.yz *= 1.45;
    vec3 dab = oklabToSrgb(lab);
    float dabR = maxR * 1.15;
    float dabMask = 1.0 - smoothstep(dabR - 0.7, dabR + 0.5, distPx);
    outCol = mix(canvasCol, dab, dabMask * (0.35 + 0.65 * max(darkness, 0.35)));
  } else if (uVariant == 2) {
    // White Chalk Stipple on Dark Drafting Slate
    vec3 slate = vec3(0.06, 0.068, 0.085) * (0.88 + paper * 0.22 * uTexture);
    vec3 chalk = mix(vec3(0.94, 0.94, 0.91), sc * 1.35, uColorMix);
    outCol = mix(slate, chalk, dotMask * smoothstep(0.04, 0.22, lum));
  } else if (uVariant == 3) {
    // Dual Voronoi Cell Mesh + Stipple Centroids
    vec2 off = uTexelSize * 1.25;
    float border =
      step(0.0025, length(texture(uJfaTex, clamp(vUv + vec2(off.x, 0.0), vec2(0.0), vec2(1.0))).xy - seedUv)) +
      step(0.0025, length(texture(uJfaTex, clamp(vUv + vec2(0.0, off.y), vec2(0.0), vec2(1.0))).xy - seedUv));
    vec3 bg = vec3(0.05, 0.06, 0.08);
    vec3 wire = mix(vec3(0.24, 0.72, 0.88), sc * 1.25, uColorMix);
    outCol = bg + wire * clamp(border * 0.55, 0.0, 0.7) + vec3(0.98, 0.84, 0.42) * dotMask;
  } else {
    // Archival StippleGen Pen-Plotter Ink Dots on Warm Rag Paper
    vec3 rag = vec3(0.955, 0.94, 0.90) * (0.93 + paper * 0.12 * uTexture);
    vec3 ink = mix(vec3(0.07, 0.075, 0.095), sc * 0.45, uColorMix);
    outCol = mix(rag, ink, dotMask * smoothstep(0.03, 0.18, darkness));
  }

  fragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
}
`;
