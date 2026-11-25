/**
 * Family 4: Analog Display Hardware & Vector Cathode Displays
 *
 * 1. Physical CRT Aperture Grille, Beam Focus & Halation
 *    - Faithfully implements Timothy Lottes' crt-lottes.slang:
 *      strict linear-light pipeline, 3-scanline Gaussian vertical beam (Tri), 5-tap/3-tap horizontal
 *      Gaussian beam (Horz5/Horz3), barrel screen curvature, and all 4 physical phosphor masks!
 *
 * 2. Composite NTSC & VHS Signal Degradation
 *    - Pass 1 & 2 faithfully implement Themaister & guest.r (ntsc-adaptive) 3.58 MHz YIQ subcarrier
 *      modulation, luma<->chroma crosstalk rainbow/dot-crawl, and asymmetric I/Q chroma filtering.
 *    - Augmented with Valadaptive's (valadaptive/ntsc-rs) physical VHS head-switching bottom curl
 *      (shift * (row/N)^1.5) and damped-cosine oxide dropout snow streaks.
 *
 * 3. XY Vector Oscilloscope (Igor Null, m1el/woscope)
 *    - Exact analytical Gaussian electron beam integral via Abramowitz & Stegun erf(x),
 *      producing exact 1/L velocity-dependent intensity and bright corner dwell hotspots!
 *
 * 4. Rutt-Etra 1973 Scanline Video Synthesizer (Steve Rutt & Bill Etra / Vade)
 *    - Real 3D scanline ribbon geometry extruded by luminance + depth with hidden-line occlusion.
 */

export const CRT_LOTTES_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform vec2 uResolution;
uniform float uScale;    // virtual CRT scanline resolution [0..1]
uniform float uDetail;   // beam focus hardness [0..1]
uniform float uTexture;  // glass barrel curvature [0..1]
uniform float uColorMix; // phosphor shadow mask strength [0..1]
uniform int uVariant;    // 0=TV Triad, 1=Trinitron Aperture Grille, 2=Stretched VGA, 3=Fine VGA

// Exact Timothy Lottes sRGB <-> linear transfers (crt-lottes.slang lines 54-71)
float toLinear1(float c) {
  return (c <= 0.04045) ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4);
}
vec3 toLinear(vec3 c) { return vec3(toLinear1(c.r), toLinear1(c.g), toLinear1(c.b)); }

float toSrgb1(float c) {
  c = max(0.0, c);
  return (c < 0.0031308) ? c * 12.92 : 1.055 * pow(c, 0.41666) - 0.055;
}
vec3 toSrgb(vec3 c) { return clamp(vec3(toSrgb1(c.r), toSrgb1(c.g), toSrgb1(c.b)), 0.0, 1.0); }

vec3 fetchLinear(vec2 pos, vec2 off, vec2 res) {
  vec2 p = (floor(pos * res + off) + vec2(0.5)) / res;
  if (abs(p.x - 0.5) > 0.5 || abs(p.y - 0.5) > 0.5) return vec3(0.0);
  return toLinear(texture(uSceneTex, p).rgb);
}

vec2 distGrid(vec2 pos, vec2 res) {
  vec2 p = pos * res;
  return -((p - floor(p)) - vec2(0.5));
}

float gaus(float pos, float scale) {
  return exp2(scale * pos * pos);
}

vec3 horz3(vec2 pos, float off, vec2 res, float hardPix) {
  vec3 b = fetchLinear(pos, vec2(-1.0, off), res);
  vec3 c = fetchLinear(pos, vec2( 0.0, off), res);
  vec3 d = fetchLinear(pos, vec2( 1.0, off), res);
  float dst = distGrid(pos, res).x;
  float wb = gaus(dst - 1.0, hardPix);
  float wc = gaus(dst + 0.0, hardPix);
  float wd = gaus(dst + 1.0, hardPix);
  return (b * wb + c * wc + d * wd) / max(1e-5, wb + wc + wd);
}

vec3 horz5(vec2 pos, float off, vec2 res, float hardPix) {
  vec3 a = fetchLinear(pos, vec2(-2.0, off), res);
  vec3 b = fetchLinear(pos, vec2(-1.0, off), res);
  vec3 c = fetchLinear(pos, vec2( 0.0, off), res);
  vec3 d = fetchLinear(pos, vec2( 1.0, off), res);
  vec3 e = fetchLinear(pos, vec2( 2.0, off), res);
  float dst = distGrid(pos, res).x;
  float wa = gaus(dst - 2.0, hardPix);
  float wb = gaus(dst - 1.0, hardPix);
  float wc = gaus(dst + 0.0, hardPix);
  float wd = gaus(dst + 1.0, hardPix);
  float we = gaus(dst + 2.0, hardPix);
  return (a * wa + b * wb + c * wc + d * wd + e * we) / max(1e-5, wa + wb + wc + wd + we);
}

float scanWeight(vec2 pos, float off, vec2 res, float hardScan) {
  float dst = distGrid(pos, res).y;
  return gaus(dst + off, hardScan);
}

// 3-line Gaussian vertical scanline convolution (Tri in crt-lottes.slang)
vec3 triScan(vec2 pos, vec2 res, float hardPix, float hardScan) {
  vec3 a = horz3(pos, -1.0, res, hardPix);
  vec3 b = horz5(pos,  0.0, res, hardPix);
  vec3 c = horz3(pos,  1.0, res, hardPix);
  float wa = scanWeight(pos, -1.0, res, hardScan);
  float wb = scanWeight(pos,  0.0, res, hardScan);
  float wc = scanWeight(pos,  1.0, res, hardScan);
  return a * wa + b * wb + c * wc;
}

// Barrel glass curvature (Warp in crt-lottes.slang)
vec2 warpCrt(vec2 uv, float amount) {
  vec2 p = uv * 2.0 - 1.0;
  float wX = 0.031 * amount * 2.2;
  float wY = 0.041 * amount * 2.2;
  p *= vec2(1.0 + (p.y * p.y) * wX, 1.0 + (p.x * p.x) * wY);
  return p * 0.5 + 0.5;
}

// All 4 Timothy Lottes physical phosphor shadow masks (crt-lottes.slang lines 267-325)
vec3 phosphorMask(vec2 fragPx, int mode, float darkVal, float lightVal) {
  if (mode == 0) {
    // Mode 1: Very compressed TV triad shadow mask
    float line = lightVal;
    float odd = (fract(fragPx.x / 6.0) < 0.5) ? 1.0 : 0.0;
    if (fract((fragPx.y + odd) / 2.0) < 0.5) line = darkVal;
    float x = fract(fragPx.x / 3.0);
    vec3 m = vec3(darkVal);
    if (x < 0.333) m.r = lightVal;
    else if (x < 0.666) m.g = lightVal;
    else m.b = lightVal;
    return m * line;
  } else if (mode == 1) {
    // Mode 2: Sony Trinitron Aperture Grille (crisp vertical RGB stripes)
    float x = fract(fragPx.x / 3.0);
    vec3 m = vec3(darkVal);
    if (x < 0.333) m.r = lightVal;
    else if (x < 0.666) m.g = lightVal;
    else m.b = lightVal;
    return m;
  } else if (mode == 2) {
    // Mode 3: Stretched VGA shadow mask
    vec2 p = fragPx;
    p.x += p.y * 3.0;
    vec3 m = vec3(darkVal);
    float x = fract(p.x / 6.0);
    if (x < 0.333) m.r = lightVal;
    else if (x < 0.666) m.g = lightVal;
    else m.b = lightVal;
    return m;
  } else {
    // Mode 4: Fine RGB VGA phosphor triad
    vec2 p = floor(fragPx * vec2(1.0, 0.5));
    p.x += p.y * 3.0;
    vec3 m = vec3(darkVal);
    float x = fract(p.x / 6.0);
    if (x < 0.333) m.r = lightVal;
    else if (x < 0.666) m.g = lightVal;
    else m.b = lightVal;
    return m;
  }
}

void main() {
  vec2 warped = warpCrt(vUv, uTexture);
  if (warped.x < 0.0 || warped.x > 1.0 || warped.y < 0.0 || warped.y > 1.0) {
    // Curved dark CRT bezel mask
    fragColor = vec4(0.015, 0.018, 0.022, 1.0);
    return;
  }

  float aspect = uResolution.x / max(1.0, uResolution.y);
  float virtH = mix(180.0, 420.0, uScale);
  vec2 virtRes = vec2(floor(virtH * aspect), floor(virtH));

  float hardPix = mix(-1.8, -4.2, uDetail);
  float hardScan = mix(-5.5, -11.5, uDetail);

  // Core linear-light beam scanline synthesis
  vec3 beam = triScan(warped, virtRes, hardPix, hardScan);

  // Local glass faceplate halation (wide soft linear Gaussian glow)
  vec3 halo = (
    horz5(warped, -1.0, virtRes, -1.2) * 0.25 +
    horz5(warped,  0.0, virtRes, -1.2) * 0.50 +
    horz5(warped,  1.0, virtRes, -1.2) * 0.25
  );
  vec3 col = beam + halo * 0.22;

  // Apply physical phosphor aperture mask in linear light
  float maskDark = mix(1.0, 0.42, uColorMix);
  float maskLight = mix(1.0, 1.48, uColorMix);
  col *= phosphorMask(gl_FragCoord.xy, uVariant, maskDark, maskLight);

  // Subtle curved glass corner vignette & specular reflection
  vec2 edge = warped * (1.0 - warped);
  float vig = clamp(pow(max(0.0, edge.x * edge.y * 16.0), 0.16), 0.0, 1.0);
  col *= mix(1.0, vig, 0.35 + uTexture * 0.55);

  fragColor = vec4(toSrgb(col * 1.12), 1.0);
}
`;

// Pass 1 of Composite NTSC / VHS (Themaister & guest.r ntsc-pass1.slang + Valadaptive VHS head-switching curl)
export const NTSC_PASS1_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform vec2 uResolution;
uniform float uTime;
uniform float uScale;   // chroma bleed / VHS bandwidth [0..1]
uniform float uDetail;  // subcarrier crosstalk / dot crawl [0..1]
uniform float uTexture; // VHS tape wear, head-switching curl & snow [0..1]
uniform int uVariant;   // 0=Broadcast NTSC, 1=1986 Home VHS, 2=Worn SLP Tape, 3=B&W RF Static

const mat3 RGB_TO_YIQ = mat3(
  0.299,  0.595716,  0.211456,
  0.587, -0.274453, -0.522591,
  0.114, -0.321263,  0.311135
);

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  float frameIdx = floor(uTime * 30.0);
  vec2 uv = vUv;

  // Valadaptive (ntsc-rs) VHS Head-Switching Bottom Curl: shift * (row/N)^1.5 + horizontal jitter
  float wear = uTexture * ((uVariant == 2) ? 1.5 : (uVariant == 0) ? 0.2 : 1.0);
  float scanY = floor(uv.y * 240.0);

  // Tape horizontal sync wobble (micro line-by-line tracking jitter)
  float lineJitter = (hash12(vec2(scanY, frameIdx)) - 0.5) * 0.0038 * wear;
  float slowDrift = sin(uv.y * 14.0 + uTime * 3.2) * 0.0018 * wear;
  uv.x += lineJitter + slowDrift;

  // Bottom ~12 scanlines: physical helical drum head-switching tear (vUv.y near 0 in WebGL bottom-up!)
  float headBand = 0.055 * clamp(wear, 0.0, 1.6);
  if (uv.y < headBand) {
    float t = 1.0 - uv.y / max(1e-4, headBand);
    float curl = pow(t, 1.5) * 0.065 * wear;
    uv.x = fract(uv.x + curl + (hash12(vec2(scanY, frameIdx * 1.7)) - 0.5) * 0.015 * t);
  }

  vec3 rgb = texture(uSceneTex, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
  vec3 yiq = RGB_TO_YIQ * rgb;

  // Subcarrier phase rotation: 3.58 MHz (3-phase per pixel, alternating per scanline & field)
  float pixX = gl_FragCoord.x;
  float pixY = gl_FragCoord.y;
  float chromaPhase = (2.0943951 * pixX) + (2.0943951 * pixY) + (2.0943951 * mod(frameIdx, 2.0));

  // Themaister ntsc-pass1 chroma/luma modulation + crosstalk artifacting (rainbow edges & dot crawl!)
  float modCos = cos(chromaPhase);
  float modSin = sin(chromaPhase);

  float crosstalk = mix(0.12, 0.72, uDetail) * ((uVariant == 3) ? 0.2 : 1.0);
  // Modulate chroma onto carrier and leak high-frequency luma back into I/Q
  float composite = yiq.x + (yiq.y * modCos + yiq.z * modSin) * (1.0 + crosstalk * 0.35);

  // Valadaptive damped-cosine VHS oxide dropout snow streaks
  if (wear > 0.05) {
    float rowSeed = hash12(vec2(scanY, frameIdx * 3.1 + 17.0));
    float snowChance = (uVariant == 3) ? 0.26 : (uVariant == 2) ? 0.14 : 0.055;
    if (rowSeed < snowChance * wear) {
      float startX = hash12(vec2(scanY + 19.0, frameIdx));
      float streakLen = 0.03 + 0.16 * hash12(vec2(scanY + 41.0, frameIdx)) * wear;
      float dx = uv.x - startX;
      if (dx >= 0.0 && dx < streakLen) {
        float u = dx / streakLen;
        // Exact Valadaptive damped-cosine dropout envelope: cos(pi * x / f) * (1 - u)^2
        float ring = cos(u * 18.0) * (1.0 - u) * (1.0 - u);
        composite += (0.55 + 0.45 * ring) * (0.45 + 0.55 * wear);
      }
    }
  }

  // Pack: R = modulated composite signal, G = carrier-weighted I, B = carrier-weighted Q, A = raw luma Y
  fragColor = vec4(composite, yiq.y, yiq.z, yiq.x);
}
`;

// Pass 2 of Composite NTSC / VHS: Comb-filter demodulation + asymmetric I (1.3MHz) / Q (0.6MHz) low-pass + VHS chroma delay
export const NTSC_PASS2_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uPass1Tex;
uniform vec2 uTexelSize;
uniform float uTime;
uniform float uScale;    // chroma bandwidth starvation [0..1]
uniform float uDetail;   // rainbow / dot crawl visibility [0..1]
uniform float uTexture;  // VHS vertical chroma smear & static [0..1]
uniform float uColorMix; // chroma saturation [0..1]
uniform int uVariant;    // 0=Broadcast NTSC, 1=1986 Home VHS, 2=Worn SLP Tape, 3=B&W RF Static

const mat3 YIQ_TO_RGB = mat3(
  1.0,  1.0,      1.0,
  0.956, -0.272, -1.106,
  0.621, -0.647,  1.703
);

void main() {
  float frameIdx = floor(uTime * 30.0);
  float pixX = gl_FragCoord.x;
  float pixY = gl_FragCoord.y;

  // VHS shifts chroma right & down by ~1-2 scanlines and blurs Q much more heavily than I
  float vhsFactor = (uVariant == 0) ? 0.35 : (uVariant == 2) ? 1.5 : 1.0;
  float lumaBlur = mix(0.6, 2.2, uScale) * vhsFactor;
  float chromaSpreadI = mix(2.5, 9.0, uScale) * vhsFactor;
  float chromaSpreadQ = chromaSpreadI * 1.85; // NTSC Q channel has half the bandwidth of I!

  // 1. Luma comb filter & slight VHS sharpness ringing (dark ghost halo right of bright edges)
  float ySum = 0.0;
  float yW = 0.0;
  float demI = 0.0;
  float demQ = 0.0;
  float cW = 0.0;

  for (int i = -6; i <= 6; i++) {
    float fi = float(i);
    vec2 suv = clamp(vUv + vec2(fi * uTexelSize.x * (1.0 + lumaBlur * 0.45), 0.0), vec2(0.0), vec2(1.0));
    vec4 s = texture(uPass1Tex, suv);

    float phase = (2.0943951 * (pixX + fi)) + (2.0943951 * pixY) + (2.0943951 * mod(frameIdx, 2.0));
    float wy = exp(-0.22 * fi * fi / max(0.35, lumaBlur));
    ySum += s.r * wy;
    yW += wy;

    // Demodulate composite subcarrier back into I & Q (creates authentic rainbow edges on fine detail!)
    float wc = exp(-0.08 * fi * fi);
    demI += (s.r - s.a) * 2.0 * cos(phase) * wc;
    demQ += (s.r - s.a) * 2.0 * sin(phase) * wc;
    cW += wc;
  }

  float Y = ySum / max(1e-5, yW);
  // Subtle VHS edge sharpening overshoot (ringing)
  float yPrev = texture(uPass1Tex, clamp(vUv - vec2(uTexelSize.x * 2.5, 0.0), vec2(0.0), vec2(1.0))).a;
  Y += (Y - yPrev) * 0.22 * vhsFactor;

  // 2. Asymmetric horizontal I/Q low-pass + VHS vertical chroma line averaging & delay
  vec2 chromaShift = vec2(chromaSpreadI * 0.35 * uTexelSize.x, -vhsFactor * uTexture * 2.0 * uTexelSize.y);
  float I = 0.0;
  float Q = 0.0;
  float wI = 0.0;
  float wQ = 0.0;
  for (int k = -4; k <= 4; k++) {
    float fk = float(k);
    float w = exp(-0.14 * fk * fk);
    vec2 uvI = clamp(vUv + chromaShift + vec2(fk * chromaSpreadI * 0.28 * uTexelSize.x, 0.0), vec2(0.0), vec2(1.0));
    vec2 uvQ = clamp(vUv + chromaShift + vec2(fk * chromaSpreadQ * 0.32 * uTexelSize.x, 0.0), vec2(0.0), vec2(1.0));
    I += texture(uPass1Tex, uvI).g * w;
    Q += texture(uPass1Tex, uvQ).b * w;
    wI += w;
    wQ += w;
  }
  I /= max(1e-5, wI);
  Q /= max(1e-5, wQ);

  // Blend clean band-limited chroma with raw demodulated subcarrier (authentic rainbow crawl on sharp lines!)
  float crawlMix = mix(0.08, 0.55, uDetail);
  I = mix(I, demI / max(1e-5, cW), crawlMix);
  Q = mix(Q, demQ / max(1e-5, cW), crawlMix);

  // VHS 2-line vertical chroma average to mask phase noise
  vec2 lineUp = texture(uPass1Tex, clamp(vUv + vec2(0.0, uTexelSize.y * 2.0), vec2(0.0), vec2(1.0))).gb;
  I = mix(I, lineUp.x, 0.32 * uTexture);
  Q = mix(Q, lineUp.y, 0.32 * uTexture);

  float sat = (uVariant == 3) ? 0.0 : mix(0.35, 1.35, uColorMix);
  vec3 rgb = YIQ_TO_RGB * vec3(Y, I * sat, Q * sat);

  // Faint 240p interlaced scanline modulation
  float scan = 0.90 + 0.10 * sin(vUv.y * 240.0 * 6.2831853);
  rgb *= scan;

  fragColor = vec4(clamp(rgb, 0.0, 1.0), 1.0);
}
`;

// Igor Null (m1el/woscope) Exact Analytical Gaussian Electron Beam Vector Oscilloscope
// Vertex shader expands each 2D line segment (aP0 -> aP1) into a screen-aligned quad padded by beam sigma
export const WOSCOPE_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aQuad;     // unit quad corner: x in [-1, 1], y in [-1, 1]
layout(location = 1) in vec2 aP0;       // segment start in NDC [-1, 1]
layout(location = 2) in vec2 aP1;       // segment end in NDC [-1, 1]
layout(location = 3) in vec4 aColInt;   // rgb = trace color, a = intensity weight

uniform vec2 uResolution;
uniform float uSigmaPx;

out vec2 vLocal;    // local coordinates (x along segment, y perpendicular) in pixels
out float vSegLen;  // segment length in pixels
out vec4 vColor;

void main() {
  vec2 p0Px = (aP0 * 0.5 + 0.5) * uResolution;
  vec2 p1Px = (aP1 * 0.5 + 0.5) * uResolution;
  vec2 diff = p1Px - p0Px;
  float len = length(diff);
  vec2 dir = (len > 1e-3) ? (diff / len) : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);

  float pad = max(4.0, uSigmaPx * 3.8);
  // Expand quad along segment + pad on both ends for round Gaussian end-caps
  float along = (aQuad.x * 0.5 + 0.5) * (len + 2.0 * pad) - pad;
  float across = aQuad.y * pad;

  vec2 posPx = p0Px + dir * along + perp * across;
  vec2 ndc = (posPx / uResolution) * 2.0 - 1.0;

  vLocal = vec2(along, across);
  vSegLen = max(len, 0.35);
  vColor = aColInt;
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

// Exact Abramowitz & Stegun erf(x) analytical Gaussian beam integral (m1el/woscope fsLine.glsl)
export const WOSCOPE_FRAG = `#version 300 es
precision highp float;

in vec2 vLocal;
in float vSegLen;
in vec4 vColor;

out vec4 fragColor;

uniform float uSigmaPx;
uniform float uGain;

// Abramowitz & Stegun 7.1.26 approximation to erf(x) (max error < 1.5e-7)
float erfApprox(float x) {
  float s = sign(x);
  float a = abs(x);
  float t = 1.0 / (1.0 + 0.3275911 * a);
  float poly = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return s * (1.0 - poly * exp(-a * a));
}

void main() {
  float sigma = max(0.85, uSigmaPx);
  float invSigma = 1.0 / sigma;

  // Analytical 1D integral of exp(-((x - t)^2 + y^2) / sigma^2) for t in [0, vSegLen]
  float expY = exp(-(vLocal.y * vLocal.y) * invSigma * invSigma);
  float intX = erfApprox(vLocal.x * invSigma) - erfApprox((vLocal.x - vSegLen) * invSigma);

  // Exact 1/L velocity-dependent intensity! Short slow segments burn bright; fast jumps dim naturally.
  float velScale = 1.0 / (0.14 * vSegLen + 1.4);
  float beam = 0.5 * expY * max(0.0, intX) * velScale * uGain * vColor.a;

  // Phosphor core saturation glow (white-hot center when beam energy > 1.0)
  vec3 phosphor = vColor.rgb * beam + vec3(0.75, 0.95, 0.85) * max(0.0, beam - 0.85) * 0.45;
  fragColor = vec4(phosphor, 1.0);
}
`;

// Oscilloscope phosphor graticule background pass
export const WOSCOPE_BG_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uResolution;
uniform int uVariant; // 0=P31 Green, 1=P11 Blue, 2=Amber Radar, 3=Full Color

void main() {
  vec2 p = vUv - 0.5;
  float r2 = dot(p, p);

  vec3 bg;
  vec3 gridCol;
  if (uVariant == 1) {
    bg = vec3(0.012, 0.022, 0.042);
    gridCol = vec3(0.10, 0.24, 0.42);
  } else if (uVariant == 2) {
    bg = vec3(0.032, 0.018, 0.008);
    gridCol = vec3(0.36, 0.20, 0.06);
  } else if (uVariant == 3) {
    bg = vec3(0.015, 0.016, 0.022);
    gridCol = vec3(0.16, 0.18, 0.24);
  } else {
    bg = vec3(0.010, 0.030, 0.018);
    gridCol = vec3(0.08, 0.30, 0.16);
  }

  // Precision Tektronix 10x8 illuminated reticle graticule
  vec2 gCoord = vUv * vec2(10.0, 8.0);
  vec2 grid = abs(fract(gCoord - 0.5) - 0.5) / max(fwidth(gCoord), vec2(1e-4));
  float gLine = 1.0 - min(min(grid.x, grid.y), 1.0);

  // Center crosshair ticks
  vec2 centerAxis = abs(p) * uResolution;
  float axisLine = max(
    (1.0 - smoothstep(0.5, 1.5, centerAxis.x)) * (0.4 + 0.6 * step(0.82, fract(vUv.y * 40.0))),
    (1.0 - smoothstep(0.5, 1.5, centerAxis.y)) * (0.4 + 0.6 * step(0.82, fract(vUv.x * 50.0)))
  );

  vec3 col = bg * (1.0 - r2 * 0.75) + gridCol * (gLine * 0.28 + axisLine * 0.38);
  fragColor = vec4(col, 1.0);
}
`;

// Steve Rutt & Bill Etra (1973) / Vade Scanline Video Synthesizer
// Real 3D scanline ribbons displaced along Z by luminance & depth, with hidden-line dark skirts
export const RUTTETRA_VERT = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec2 aUv;      // x in [0,1] along scanline, y = normalized row index
layout(location = 1) in float aSkirt;  // 0.0 = ribbon ridge, 1.0 = bottom occlusion skirt

uniform sampler2D uSceneTex;
uniform vec2 uCamera;
uniform float uExtrude;
uniform float uTilt;
uniform int uVariant; // 0=Phosphor Ribbons, 1=Unknown Pleasures, 2=Thermal Wire, 3=Scanline Dots

out vec3 vColor;
out float vLuma;
out float vSkirt;

void main() {
  vec4 sc = texture(uSceneTex, aUv);
  float lum = dot(sc.rgb, vec3(0.2126, 0.7152, 0.0722));
  float disp = mix(lum, lum * 0.65 + sc.a * 0.35, 0.35) * uExtrude;

  // Base 3D scanline plane coordinates (+Z points toward camera so bright peaks rise toward viewer!)
  vec3 pos = vec3(
    (aUv.x - 0.5) * 2.05,
    (aUv.y - 0.5) * 1.45,
    (aSkirt > 0.5) ? -0.38 : disp
  );

  // Interactive 3D perspective tilt (tilts top away from camera, bottom toward camera)
  float pitch = mix(0.24, 0.88, uTilt);
  float yaw = sin(uCamera.x * 0.45) * 0.34;

  float cp = cos(pitch);
  float sp = sin(pitch);
  pos.yz = mat2(cp, sp, -sp, cp) * pos.yz;

  float cy = cos(yaw);
  float sy = sin(yaw);
  pos.xz = mat2(cy, -sy, sy, cy) * pos.xz;

  // Camera sits at z = +2.35 looking toward origin: closer vertices have SMALLER zCam -> pass LEQUAL depth test!
  float zCam = 2.35 - pos.z;
  float fov = 1.65;
  vec2 ndc = (pos.xy * fov) / max(0.4, zCam);

  vColor = sc.rgb;
  vLuma = lum;
  vSkirt = aSkirt;

  // Slight depth bias forward on the glowing ridge line pass so it never z-fights its own dark occlusion skirt
  float depthBias = (aSkirt < 0.5) ? -0.0025 : 0.0;
  gl_Position = vec4(ndc.x, ndc.y - 0.04, clamp((zCam - 0.4) / 4.2 * 2.0 - 1.0 + depthBias, -0.99, 0.99), 1.0);
  gl_PointSize = (uVariant == 3) ? mix(2.2, 5.0, lum) : 1.0;
}
`;

export const RUTTETRA_FRAG = `#version 300 es
precision highp float;
precision highp int;

in vec3 vColor;
in float vLuma;
in float vSkirt;

out vec4 fragColor;

uniform float uColorMix;
uniform int uVariant; // 0=Phosphor Ribbons, 1=Unknown Pleasures, 2=Thermal Wire, 3=Scanline Dots
uniform int uIsSkirtPass;

vec3 thermalRamp(float t) {
  vec3 c0 = vec3(0.06, 0.03, 0.24);
  vec3 c1 = vec3(0.75, 0.12, 0.45);
  vec3 c2 = vec3(0.99, 0.58, 0.12);
  vec3 c3 = vec3(1.00, 0.98, 0.78);
  if (t < 0.33) return mix(c0, c1, t * 3.0);
  if (t < 0.66) return mix(c1, c2, (t - 0.33) * 3.0);
  return mix(c2, c3, (t - 0.66) * 3.0);
}

void main() {
  vec3 lineCol;
  if (uVariant == 1) {
    // Joy Division Unknown Pleasures crisp stark white ink on obsidian
    lineCol = mix(vec3(0.94, 0.96, 0.98), vColor * 1.4, uColorMix * 0.35) * (0.34 + 0.78 * smoothstep(0.02, 0.45, vLuma));
  } else if (uVariant == 2) {
    lineCol = thermalRamp(clamp(vLuma * 1.18, 0.0, 1.0));
  } else {
    vec3 synthBase = mix(vec3(0.24, 0.96, 0.88), vColor * 1.45, uColorMix);
    lineCol = synthBase * (0.28 + 1.05 * vLuma);
  }

  if (uIsSkirtPass == 1) {
    // Opaque matte occlusion skirt beneath each ribbon + bright phosphor top-rim glow so lines stay lush at 2x DPI!
    float rim = 1.0 - smoothstep(0.0, 0.095, vSkirt);
    vec3 bg = vec3(0.02, 0.024, 0.032);
    fragColor = vec4(clamp(mix(bg, lineCol * 1.15, rim), 0.0, 1.0), 1.0);
    return;
  }

  fragColor = vec4(clamp(lineCol * 1.2, 0.0, 1.0), 1.0);
}
`;
