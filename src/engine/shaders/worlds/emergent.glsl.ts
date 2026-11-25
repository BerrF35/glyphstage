import { SCENE_PREAMBLE } from '../sceneBase.glsl';

const SIM_PREAMBLE = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uPrevSim;
uniform vec2 uSimRes;
uniform float uTime;
uniform int uFrame;
uniform vec2 uPointer;
uniform float uPointerActive;
uniform float uPointerDown;
uniform vec4 uAudio;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
`;

export interface StatefulSimPair {
  sim: string;
  view: string;
  substeps: number;
}

export const EMERGENT_SIMS: Record<
  'grayscott' | 'fluid' | 'life' | 'ripple' | 'slime' | 'doomsim',
  StatefulSimPair
> = {
  // 1. Karl Sims Gray-Scott Reaction-Diffusion Coral PDE
  grayscott: {
    substeps: 8,
    sim: `${SIM_PREAMBLE}
void main() {
  vec2 tx = 1.0 / uSimRes;
  if (uFrame <= 1) {
    vec2 c = vUv - 0.5;
    float seed = 0.0;
    // Initial organic seed ring & clusters so coral blooms immediately
    float ring = abs(length(c * vec2(1.5, 1.0)) - 0.16);
    if (ring < 0.025) seed = 1.0;
    if (length(c) < 0.045) seed = 1.0;
    if (hash21(floor(vUv * 42.0)) > 0.965) seed = 1.0;
    fragColor = vec4(1.0 - seed * 0.5, seed * 0.5, 0.0, 1.0);
    return;
  }

  vec2 ab = texture(uPrevSim, vUv).rg;
  float a = ab.x;
  float b = ab.y;

  // 9-point isotropic Laplacian stencil
  vec2 lap = -ab;
  lap += texture(uPrevSim, vUv + vec2(tx.x, 0.0)).rg * 0.2;
  lap += texture(uPrevSim, vUv - vec2(tx.x, 0.0)).rg * 0.2;
  lap += texture(uPrevSim, vUv + vec2(0.0, tx.y)).rg * 0.2;
  lap += texture(uPrevSim, vUv - vec2(0.0, tx.y)).rg * 0.2;
  lap += texture(uPrevSim, vUv + vec2(tx.x, tx.y)).rg * 0.05;
  lap += texture(uPrevSim, vUv + vec2(-tx.x, tx.y)).rg * 0.05;
  lap += texture(uPrevSim, vUv + vec2(tx.x, -tx.y)).rg * 0.05;
  lap += texture(uPrevSim, vUv + vec2(-tx.x, -tx.y)).rg * 0.05;

  float feed = 0.037 + 0.008 * sin(uTime * 0.22) + uAudio.x * 0.006;
  float kill = 0.060 + 0.003 * cos(uTime * 0.19);
  float abb = a * b * b;

  float nextA = a + (1.0 * lap.x - abb + feed * (1.0 - a)) * 0.95;
  float nextB = b + (0.5 * lap.y + abb - (kill + feed) * b) * 0.95;

  // Interactive cursor painting seeds fresh reaction blooms
  if (uPointerActive > 0.5) {
    float md = length((vUv - uPointer) * vec2(uSimRes.x / max(1.0, uSimRes.y), 1.0));
    float brushR = uPointerDown > 0.5 ? 0.055 : 0.028;
    if (md < brushR) {
      nextB = max(nextB, 0.65);
      nextA = min(nextA, 0.45);
    }
  }

  fragColor = vec4(clamp(nextA, 0.0, 1.0), clamp(nextB, 0.0, 1.0), 0.0, 1.0);
}
`,
    view: `${SCENE_PREAMBLE}
void main() {
  vec2 tx = 1.0 / vec2(256.0, 160.0);
  float v = texture(uSimTex, vUv).g;
  float vx = texture(uSimTex, vUv + vec2(tx.x, 0.0)).g - texture(uSimTex, vUv - vec2(tx.x, 0.0)).g;
  float vy = texture(uSimTex, vUv + vec2(0.0, tx.y)).g - texture(uSimTex, vUv - vec2(0.0, tx.y)).g;
  vec3 n = normalize(vec3(-vx * 9.0, -vy * 9.0, 0.45));
  float diff = max(0.0, dot(n, normalize(uLightDir)));
  float spec = pow(max(0.0, dot(reflect(-normalize(uLightDir), n), vec3(0.0, 0.0, 1.0))), 24.0);

  float ridge = smoothstep(0.06, 0.36, v);
  float rim = smoothstep(0.14, 0.28, v) * (1.0 - smoothstep(0.28, 0.42, v));
  vec3 col = mix(vec3(0.08, 0.26, 0.38), vec3(0.94, 0.97, 1.0), ridge) * (0.35 + diff * uLightIntensity * 0.9);
  col += vec3(0.24, 0.95, 0.82) * rim * 0.85 + vec3(1.0, 0.86, 0.6) * spec * 0.65;
  col *= smoothstep(0.03, 0.14, v);
  fragColor = finishTone(col, smoothstep(0.04, 0.28, v));
}
`,
  },

  // 2. Interactive Curl-Advected Bi-Color ASCII Smoke Fluid
  fluid: {
    substeps: 3,
    sim: `${SIM_PREAMBLE}
vec2 curlField(vec2 p, float t) {
  float e = 0.015;
  float n1 = sin(p.x * 6.5 + t * 0.7) * cos(p.y * 5.8 - t * 0.5)
           + 0.5 * sin((p.x + p.y) * 11.0 - t * 0.9);
  float nx = sin((p.x + e) * 6.5 + t * 0.7) * cos(p.y * 5.8 - t * 0.5)
           + 0.5 * sin((p.x + e + p.y) * 11.0 - t * 0.9);
  float ny = sin(p.x * 6.5 + t * 0.7) * cos((p.y + e) * 5.8 - t * 0.5)
           + 0.5 * sin((p.x + p.y + e) * 11.0 - t * 0.9);
  return vec2((ny - n1) / e, -(nx - n1) / e) * 0.14;
}

void main() {
  vec2 tx = 1.0 / uSimRes;
  if (uFrame <= 1) {
    fragColor = vec4(0.5, 0.5, 0.0, 0.0);
    return;
  }

  vec4 cur = texture(uPrevSim, vUv);
  vec2 storedVel = (cur.rg - 0.5) * 2.0;
  vec2 flow = storedVel * 0.72 + curlField(vUv, uTime);

  // Smooth clamped semi-Lagrangian backtrace (zero edge seam artifacts)
  vec2 backUv = clamp(vUv - flow * tx * 2.1, tx, 1.0 - tx);
  vec4 adv = texture(uPrevSim, backUv);

  vec4 nL = texture(uPrevSim, vec2(max(tx.x, vUv.x - tx.x), vUv.y));
  vec4 nR = texture(uPrevSim, vec2(min(1.0 - tx.x, vUv.x + tx.x), vUv.y));
  vec4 nD = texture(uPrevSim, vec2(vUv.x, max(tx.y, vUv.y - tx.y)));
  vec4 nU = texture(uPrevSim, vec2(vUv.x, min(1.0 - tx.y, vUv.y + tx.y)));

  vec2 vAvg = ((nL.rg + nR.rg + nD.rg + nU.rg) * 0.25 - 0.5) * 2.0;
  vec2 vNext = mix((adv.rg - 0.5) * 2.0, vAvg, 0.14) * 0.975;

  // Dual-dye channels: b = cyan smoke, a = amber plasma
  float dyeA = mix(adv.b, (nL.b + nR.b + nD.b + nU.b) * 0.25, 0.05) * 0.986;
  float dyeB = mix(adv.a, (nL.a + nR.a + nD.a + nU.a) * 0.25, 0.05) * 0.986;

  // Soft boundary fade so smoke dissipates smoothly at walls
  float wall = smoothstep(0.0, 0.06, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  dyeA *= mix(0.86, 1.0, wall);
  dyeB *= mix(0.86, 1.0, wall);

  // Three opposing orbital smoke jets filling the canvas with swirling vortices
  float aspect = uSimRes.x / max(1.0, uSimRes.y);
  float jet = 1.0 + uAudio.x * 1.1;

  vec2 e1 = vec2(0.26 + sin(uTime * 0.55) * 0.1, 0.5 + cos(uTime * 0.72) * 0.28);
  vec2 e2 = vec2(0.74 - sin(uTime * 0.48) * 0.1, 0.5 - cos(uTime * 0.65) * 0.28);
  vec2 e3 = vec2(0.5 + cos(uTime * 0.62) * 0.28, 0.22 + sin(uTime * 0.85) * 0.08);

  float d1 = length((vUv - e1) * vec2(aspect, 1.0));
  if (d1 < 0.055) {
    float f = smoothstep(0.055, 0.0, d1);
    vNext += normalize(vec2(0.85, sin(uTime * 0.9) * 0.55)) * f * 0.48 * jet;
    dyeA = min(1.0, dyeA + f * 0.42);
  }
  float d2 = length((vUv - e2) * vec2(aspect, 1.0));
  if (d2 < 0.055) {
    float f = smoothstep(0.055, 0.0, d2);
    vNext += normalize(vec2(-0.85, -cos(uTime * 0.8) * 0.55)) * f * 0.48 * jet;
    dyeB = min(1.0, dyeB + f * 0.42);
  }
  float d3 = length((vUv - e3) * vec2(aspect, 1.0));
  if (d3 < 0.048) {
    float f = smoothstep(0.048, 0.0, d3);
    vNext += vec2(sin(uTime * 1.1) * 0.35, 0.85) * f * 0.44 * jet;
    dyeA = min(1.0, dyeA + f * 0.26);
    dyeB = min(1.0, dyeB + f * 0.26);
  }

  // Interactive cursor vortex stirrer
  if (uPointerActive > 0.5) {
    vec2 dp = (vUv - uPointer) * vec2(aspect, 1.0);
    float md = length(dp);
    float r = uPointerDown > 0.5 ? 0.095 : 0.06;
    if (md < r) {
      float f = smoothstep(r, 0.0, md);
      vec2 tang = vec2(-dp.y, dp.x) / max(md, 0.008);
      vNext += tang * f * (uPointerDown > 0.5 ? 0.85 : 0.38);
      dyeB = min(1.0, dyeB + f * 0.55);
      dyeA = min(1.0, dyeA + f * 0.22);
    }
  }

  vNext = clamp(vNext, vec2(-1.0), vec2(1.0));
  fragColor = vec4(vNext * 0.5 + 0.5, clamp(dyeA, 0.0, 1.0), clamp(dyeB, 0.0, 1.0));
}
`,
    view: `${SCENE_PREAMBLE}
void main() {
  vec2 tx = 1.0 / vec2(512.0, 320.0);
  vec4 s = texture(uSimTex, vUv);
  // Pavel Dobryakov height-gradient 3D liquid shading on incompressible Navier-Stokes RGB dye
  // Soft filmic shoulder keeps overlapping multi-jet dye filaments richly saturated instead of clipping white
  vec3 rawC = s.rgb;
  vec3 c = rawC / (1.0 + rawC * 0.62);
  float lC = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 cL = texture(uSimTex, vUv - vec2(tx.x, 0.0)).rgb; cL = cL / (1.0 + cL * 0.62);
  vec3 cR = texture(uSimTex, vUv + vec2(tx.x, 0.0)).rgb; cR = cR / (1.0 + cR * 0.62);
  vec3 cD = texture(uSimTex, vUv - vec2(0.0, tx.y)).rgb; cD = cD / (1.0 + cD * 0.62);
  vec3 cU = texture(uSimTex, vUv + vec2(0.0, tx.y)).rgb; cU = cU / (1.0 + cU * 0.62);
  float lL = dot(cL, vec3(0.299, 0.587, 0.114));
  float lR = dot(cR, vec3(0.299, 0.587, 0.114));
  float lD = dot(cD, vec3(0.299, 0.587, 0.114));
  float lU = dot(cU, vec3(0.299, 0.587, 0.114));

  vec3 n = normalize(vec3((lL - lR) * 3.8, (lD - lU) * 3.8, 0.52));
  vec3 L = normalize(uLightDir);
  float diff = clamp(dot(n, L) * 0.55 + 0.55, 0.25, 1.35);
  float spec = pow(max(0.0, dot(reflect(-L, n), vec3(0.0, 0.0, 1.0))), 26.0) * uRimIntensity;

  vec3 col = c * diff * (0.75 + 0.35 * uLightIntensity) + vec3(0.96, 0.98, 1.0) * spec * smoothstep(0.05, 0.4, lC) * 0.42;
  float depth = clamp(smoothstep(0.03, 0.65, lC), 0.0, 1.0);
  fragColor = finishTone(col, depth);
}
`,
  },

  // 3. Conway's Game of Life with Generational Phosphor Trails
  life: {
    substeps: 1,
    sim: `${SIM_PREAMBLE}
void main() {
  vec2 tx = 1.0 / uSimRes;
  vec2 cell = floor(vUv * uSimRes);
  if (uFrame <= 1) {
    float rnd = hash21(cell * 1.13 + 7.1);
    float alive = step(0.76, rnd);
    fragColor = vec4(alive, alive, alive * 0.4, 1.0);
    return;
  }

  vec4 cur = texture(uPrevSim, vUv);
  float self = step(0.5, cur.r);
  float trail = cur.g;
  float age = cur.b;

  // Step every 2nd frame for crisp readable automaton cadence
  if ((uFrame & 1) == 0) {
    float n = 0.0;
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        if (dx == 0 && dy == 0) continue;
        vec2 nuv = fract(vUv + vec2(float(dx), float(dy)) * tx);
        n += step(0.5, texture(uPrevSim, nuv).r);
      }
    }
    float nextAlive = self > 0.5
      ? ((n > 1.5 && n < 3.5) ? 1.0 : 0.0)
      : ((n > 2.5 && n < 3.5) ? 1.0 : 0.0);
    self = nextAlive;
    age = nextAlive > 0.5 ? min(1.0, age + 0.12) : 0.0;
    trail = nextAlive > 0.5 ? 1.0 : trail * 0.86;
  }

  // Periodic glider soup injection on audio kick or low activity
  if (uAudio.x > 0.65) {
    vec2 seedPos = vec2(hash21(vec2(float(uFrame), 1.3)), hash21(vec2(float(uFrame), 9.7)));
    if (length(vUv - seedPos) < 0.045 && hash21(cell + float(uFrame)) > 0.55) {
      self = 1.0;
      trail = 1.0;
    }
  }

  // Interactive cursor brush paints living cells
  if (uPointerActive > 0.5) {
    float aspect = uSimRes.x / max(1.0, uSimRes.y);
    float md = length((vUv - uPointer) * vec2(aspect, 1.0));
    float r = uPointerDown > 0.5 ? 0.065 : 0.032;
    if (md < r && hash21(cell + float(uFrame) * 0.37) > 0.45) {
      self = 1.0;
      trail = 1.0;
    }
  }

  fragColor = vec4(self, clamp(trail, 0.0, 1.0), age, 1.0);
}
`,
    view: `${SCENE_PREAMBLE}
void main() {
  vec4 s = texture(uSimTex, vUv);
  float alive = s.r;
  float trail = s.g;
  float age = s.b;
  vec3 wake = vec3(0.12, 0.68, 0.42) * trail * 0.65;
  vec3 liveCol = mix(vec3(0.45, 1.0, 0.68), vec3(1.0, 0.92, 0.45), age);
  vec3 col = mix(wake, liveCol * 1.45, alive);
  fragColor = finishTone(col, clamp(alive + trail * 0.6, 0.0, 1.0));
}
`,
  },

  // 4. Interactive 2D Damped Wave Ripple Tank PDE (inspired by pckerneis/textmode ripple.js)
  ripple: {
    substeps: 2,
    sim: `${SIM_PREAMBLE}
void main() {
  vec2 tx = 1.0 / uSimRes;
  if (uFrame <= 1) {
    fragColor = vec4(0.5, 0.5, 0.0, 1.0);
    return;
  }

  vec2 cur = texture(uPrevSim, vUv).rg;
  float hCurr = cur.r - 0.5;
  float hPrev = cur.g - 0.5;

  float nL = texture(uPrevSim, vUv - vec2(tx.x, 0.0)).r - 0.5;
  float nR = texture(uPrevSim, vUv + vec2(tx.x, 0.0)).r - 0.5;
  float nD = texture(uPrevSim, vUv - vec2(0.0, tx.y)).r - 0.5;
  float nU = texture(uPrevSim, vUv + vec2(0.0, tx.y)).r - 0.5;

  float nextH = ((nL + nR + nD + nU) * 0.5 - hPrev) * 0.991;

  // Absorbing boundary damping
  float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  nextH *= smoothstep(0.0, 0.045, edge);

  float aspect = uSimRes.x / max(1.0, uSimRes.y);
  // Dual rhythmic raindrop emitters for rich interlocking wave caustics
  for (int k = 0; k < 2; k++) {
    float rate = k == 0 ? 1.85 : 2.55;
    float tick = floor(uTime * rate + float(k) * 3.7);
    float phase = fract(uTime * rate + float(k) * 3.7);
    if (phase < 0.08) {
      vec2 dropPos = vec2(
        0.16 + 0.68 * hash21(vec2(tick, 2.7 + float(k) * 5.0)),
        0.16 + 0.68 * hash21(vec2(tick, 8.3 + float(k) * 3.0))
      );
      float d = length((vUv - dropPos) * vec2(aspect, 1.0));
      nextH += exp(-d * d * 1100.0) * (0.28 + uAudio.x * 0.22);
    }
  }

  // Interactive cursor wake & clicks
  if (uPointerActive > 0.5) {
    float d = length((vUv - uPointer) * vec2(aspect, 1.0));
    float amp = uPointerDown > 0.5 ? 0.34 : 0.14;
    nextH += exp(-d * d * 850.0) * amp;
  }

  nextH = clamp(nextH, -0.49, 0.49);
  fragColor = vec4(nextH + 0.5, hCurr + 0.5, abs(nextH) * 2.0, 1.0);
}
`,
    view: `${SCENE_PREAMBLE}
void main() {
  vec2 tx = 1.0 / vec2(256.0, 160.0);
  float hL = texture(uSimTex, vUv - vec2(tx.x, 0.0)).r;
  float hR = texture(uSimTex, vUv + vec2(tx.x, 0.0)).r;
  float hD = texture(uSimTex, vUv - vec2(0.0, tx.y)).r;
  float hU = texture(uSimTex, vUv + vec2(0.0, tx.y)).r;
  float hC = texture(uSimTex, vUv).r - 0.5;

  float gx = (hR - hL) * 18.0;
  float gy = (hU - hD) * 18.0;
  float slope = length(vec2(gx, gy));
  vec3 n = normalize(vec3(-gx, -gy, 0.48));
  float spec = pow(max(0.0, dot(reflect(-normalize(uLightDir), n), vec3(0.0, 0.0, 1.0))), 24.0);
  float crest = smoothstep(0.03, 0.42, slope);

  vec3 col = mix(vec3(0.05, 0.26, 0.56), vec3(0.42, 0.94, 1.0), crest) * (0.22 + crest * 1.1);
  col += vec3(0.95, 0.99, 1.0) * spec * 1.15 + vec3(0.24, 0.86, 0.98) * max(0.0, hC) * 1.35;
  col *= smoothstep(0.02, 0.16, slope + abs(hC) * 2.5);
  fragColor = finishTone(col, clamp(crest * 1.15 + spec, 0.0, 1.0));
}
`,
  },

  // 5. Physarum Slime Mold Vascular Network (anisotropic chemotaxis filaments on dark agar)
  slime: {
    substeps: 6,
    sim: `${SIM_PREAMBLE}
void main() {
  vec2 tx = 1.0 / uSimRes;
  if (uFrame <= 1) {
    vec2 c = (vUv - 0.5) * vec2(1.5, 1.0);
    float seed = 0.0;
    // Radial spoke seeds that bifurcate into organic vascular slime webs
    float r = length(c);
    float a = atan(c.y, c.x);
    if (r < 0.06) seed = 1.0;
    if (abs(r - 0.24) < 0.02 && sin(a * 5.0) > 0.3) seed = 1.0;
    if (hash21(floor(vUv * 55.0)) > 0.978) seed = 1.0;
    fragColor = vec4(1.0 - seed * 0.5, seed * 0.55, seed, 1.0);
    return;
  }

  vec3 s = texture(uPrevSim, vUv).rgb;
  float a = s.r;
  float b = s.g;
  float glow = s.b;

  // Mild directional chemotaxis warp toward orbiting food nodes & cursor
  vec2 food = uPointerActive > 0.5
    ? uPointer
    : vec2(0.5 + cos(uTime * 0.38) * 0.28, 0.5 + sin(uTime * 0.52) * 0.24);
  vec2 toFood = normalize(food - vUv + vec2(1e-4));
  vec2 uvShift = vUv - toFood * tx * 0.14;

  // Anisotropic Laplacian stencil creating fine branching slime tendrils
  vec2 lap = -texture(uPrevSim, uvShift).rg;
  lap += texture(uPrevSim, vUv + vec2(tx.x, 0.0)).rg * 0.2;
  lap += texture(uPrevSim, vUv - vec2(tx.x, 0.0)).rg * 0.2;
  lap += texture(uPrevSim, vUv + vec2(0.0, tx.y)).rg * 0.2;
  lap += texture(uPrevSim, vUv - vec2(0.0, tx.y)).rg * 0.2;
  lap += texture(uPrevSim, vUv + vec2(tx.x, tx.y)).rg * 0.05;
  lap += texture(uPrevSim, vUv + vec2(-tx.x, tx.y)).rg * 0.05;
  lap += texture(uPrevSim, vUv + vec2(tx.x, -tx.y)).rg * 0.05;
  lap += texture(uPrevSim, vUv + vec2(-tx.x, -tx.y)).rg * 0.05;

  // Vascular filament regime (f=0.026, k=0.058): sparse bright tendrils on dark void
  float feed = 0.026 + 0.004 * sin(uTime * 0.3 + vUv.x * 4.0) + uAudio.x * 0.004;
  float kill = 0.0585;
  float abb = a * b * b;

  float nextA = a + (1.0 * lap.x - abb + feed * (1.0 - a)) * 0.92;
  float nextB = b + (0.48 * lap.y + abb - (kill + feed) * b) * 0.92;
  float nextGlow = mix(glow * 0.96, smoothstep(0.18, 0.42, nextB), 0.22);

  // Orbiting food beacon + interactive cursor spore seeding
  float aspect = uSimRes.x / max(1.0, uSimRes.y);
  float fd = length((vUv - food) * vec2(aspect, 1.0));
  if (fd < 0.028) {
    nextB = max(nextB, 0.58);
    nextA = min(nextA, 0.48);
    nextGlow = max(nextGlow, 0.95);
  }
  if (uPointerActive > 0.5) {
    float md = length((vUv - uPointer) * vec2(aspect, 1.0));
    if (md < (uPointerDown > 0.5 ? 0.055 : 0.03)) {
      nextB = max(nextB, 0.68);
      nextA = min(nextA, 0.42);
      nextGlow = 1.0;
    }
  }

  fragColor = vec4(clamp(nextA, 0.0, 1.0), clamp(nextB, 0.0, 1.0), clamp(nextGlow, 0.0, 1.0), 1.0);
}
`,
    view: `${SCENE_PREAMBLE}
void main() {
  vec3 s = texture(uSimTex, vUv).rgb;
  float b = s.g;
  float glow = s.b;
  float core = smoothstep(0.14, 0.42, b);
  float edge = smoothstep(0.06, 0.22, b) * (1.0 - smoothstep(0.24, 0.44, b));
  vec3 col = vec3(0.08, 0.72, 0.52) * edge * 1.1 + vec3(1.0, 0.82, 0.28) * core * 1.25;
  col += vec3(0.22, 0.96, 0.76) * glow * 0.35 * smoothstep(0.04, 0.18, b);
  fragColor = finishTone(col, smoothstep(0.06, 0.34, b));
}
`,
  },

  // 6. Cellular Doom Fire Convection Buffer (inspired by play.core/doom_flame_full_color.js)
  doomsim: {
    substeps: 2,
    sim: `${SIM_PREAMBLE}
void main() {
  vec2 tx = 1.0 / uSimRes;
  if (uFrame <= 1) {
    float floorHeat = smoothstep(0.25, 0.0, vUv.y);
    fragColor = vec4(floorHeat, floorHeat, 0.0, 1.0);
    return;
  }

  // Bottom fuel emitter row stoked by scrolling turbulence + audio bass
  if (vUv.y < tx.y * 2.5) {
    float wave = 0.5 + 0.5 * sin(vUv.x * 19.0 + uTime * 3.4) * cos(vUv.x * 11.0 - uTime * 2.1);
    float rnd = hash21(vec2(floor(vUv.x * uSimRes.x), float(uFrame)));
    float fuel = clamp(0.76 + wave * 0.24 + (rnd - 0.5) * 0.32 + uAudio.x * 0.28, 0.35, 1.0);
    fragColor = vec4(fuel, fuel, 0.0, 1.0);
    return;
  }

  // Stochastic lateral wind drift + tall licking Doom flame convection
  float wind = sin(vUv.y * 7.0 - uTime * 2.6 + vUv.x * 5.0) * 0.85;
  float jitter = (hash21(vec2(floor(vUv * uSimRes)) + fract(uTime * 19.7)) - 0.5) * 3.0 + wind;
  vec2 belowUv = vec2(clamp(vUv.x + jitter * tx.x, 0.0, 1.0), max(0.0, vUv.y - tx.y * 1.65));
  float below = texture(uPrevSim, belowUv).r;
  float sideL = texture(uPrevSim, vec2(max(0.0, belowUv.x - tx.x), belowUv.y)).r;
  float sideR = texture(uPrevSim, vec2(min(1.0, belowUv.x + tx.x), belowUv.y)).r;
  float avg = below * 0.68 + (sideL + sideR) * 0.16;

  // Height-modulated cooling so jagged flame tongues reach 70-80% of canvas height
  float cool = 0.0028 + hash21(floor(vUv * uSimRes) + float(uFrame) * 0.23) * (0.0105 + vUv.y * 0.008);
  float heat = max(0.0, avg - cool);

  // Interactive torch cursor ignites blazing embers anywhere on stage
  if (uPointerActive > 0.5) {
    float aspect = uSimRes.x / max(1.0, uSimRes.y);
    float md = length((vUv - uPointer) * vec2(aspect, 1.0));
    if (md < (uPointerDown > 0.5 ? 0.085 : 0.045)) {
      heat = max(heat, 0.99);
    }
  }

  fragColor = vec4(clamp(heat, 0.0, 1.0), avg, 0.0, 1.0);
}
`,
    view: `${SCENE_PREAMBLE}
void main() {
  float h = texture(uSimTex, vUv).r;
  vec3 col = mix(vec3(0.0), vec3(0.84, 0.09, 0.03), smoothstep(0.03, 0.30, h));
  col = mix(col, vec3(1.0, 0.52, 0.06), smoothstep(0.28, 0.64, h));
  col = mix(col, vec3(1.0, 0.96, 0.78), smoothstep(0.64, 0.94, h));
  fragColor = finishTone(col * 1.28, smoothstep(0.04, 0.42, h));
}
`,
  },
};

export const EMERGENT_VIEW_SHADERS = {
  grayscott: EMERGENT_SIMS.grayscott.view,
  fluid: EMERGENT_SIMS.fluid.view,
  life: EMERGENT_SIMS.life.view,
  ripple: EMERGENT_SIMS.ripple.view,
  slime: EMERGENT_SIMS.slime.view,
  doomsim: EMERGENT_SIMS.doomsim.view,
};
