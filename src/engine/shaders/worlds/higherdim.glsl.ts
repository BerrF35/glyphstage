import { buildRaymarchShader, SCENE_PREAMBLE } from '../sceneBase.glsl';

export const HIGHERDIM_SHADERS = {
  tesseract: `${SCENE_PREAMBLE}
float segDist2D(vec2 p, vec2 a, vec2 b, out float t) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * t);
}

vec3 project4D(vec4 v, float t, vec3 uu, vec3 vv, vec3 ww, vec3 ro) {
  v.xw *= rot2(t * 0.72);
  v.yz *= rot2(t * 0.46);
  v.xz *= rot2(t * 0.28);

  float wPersp = 1.95 / (2.75 - v.w);
  vec3 p3 = v.xyz * wPersp;

  vec3 rel = p3 - ro;
  float z = max(0.2, dot(rel, ww));
  vec2 screen = vec2(dot(rel, uu), dot(rel, vv)) * (1.72 / z);
  return vec3(screen, z);
}

void main() {
  vec2 ndc = (vUv * 2.0 - 1.0) * vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  vec3 ro = orbitCameraPos(4.1, uCamera, uZoom);
  vec3 ww = normalize(-ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);

  vec3 pts[16];
  for (int i = 0; i < 16; i++) {
    vec4 v4 = vec4(
      (i & 1) != 0 ? 1.0 : -1.0,
      (i & 2) != 0 ? 1.0 : -1.0,
      (i & 4) != 0 ? 1.0 : -1.0,
      (i & 8) != 0 ? 1.0 : -1.0
    );
    pts[i] = project4D(v4, uTime, uu, vv, ww, ro);
  }

  vec3 accum = vec3(0.0);
  float mask = 0.0;

  for (int i = 0; i < 16; i++) {
    vec3 a = pts[i];
    float vd = length(ndc - a.xy);
    float depthA = clamp(2.8 / a.z, 0.35, 1.45);
    float node = smoothstep(0.048 * depthA, 0.008 * depthA, vd) * depthA;
    accum += vec3(0.95, 0.98, 1.0) * node * 0.9;
    mask = max(mask, node);

    for (int bit = 0; bit < 4; bit++) {
      int maskBit = 1 << bit;
      if ((i & maskBit) == 0) {
        vec3 b = pts[i | maskBit];
        float s;
        float d = segDist2D(ndc, a.xy, b.xy, s);
        float z = mix(a.z, b.z, s);
        float depthScale = clamp(3.1 / z, 0.32, 1.5);
        float thickness = (bit == 3 ? 0.017 : 0.022) * depthScale;
        float core = smoothstep(thickness, thickness * 0.22, d);
        float halo = exp(-d * (28.0 / depthScale)) * 0.42;

        vec3 edgeCol = bit == 3 ? vec3(1.0, 0.72, 0.34) : vec3(0.38, 0.88, 1.0);
        accum += edgeCol * (core * 1.15 + halo) * depthScale;
        mask = max(mask, clamp((core + halo * 0.65) * depthScale, 0.0, 1.0));
      }
    }
  }

  fragColor = finishTone(accum, mask);
}
`,

  aurora: `${SCENE_PREAMBLE}
void main() {
  vec2 ndc = (vUv * 2.0 - 1.0) * vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  float horizon = -0.22 + clamp(uCamera.y, -0.4, 0.5) * 0.22;
  bool isWater = ndc.y < horizon;

  vec2 p = ndc;
  if (isWater) {
    float depth = horizon - ndc.y;
    p.y = horizon + depth * 1.15;
    p.x += sin(depth * 48.0 - uTime * 2.8 + p.x * 5.0) * 0.028 * (0.25 + depth);
  }
  p.x += uCamera.x * 0.35;

  // Sweeping high-contrast luminous polar aurora curtains
  vec3 accum = vec3(0.0);
  float mask = 0.0;
  float skyY = max(0.01, p.y - horizon);

  for (int i = 0; i < 18; i++) {
    float fi = float(i);
    float z = 1.0 + fi * 0.26;
    vec2 ap = vec2(p.x * (0.75 + fi * 0.14), fi * 0.35 - uTime * 0.18);
    float wave = sin(ap.x * 1.6 + fbm2(ap * 0.85) * 4.2 + uTime * 0.55);
    float ribbon = exp(-abs(wave) * 3.2);
    float vert = smoothstep(0.0, 0.24, skyY) * exp(-max(0.0, skyY - 0.12) * (1.25 + fi * 0.04));
    float ray = 0.58 + 0.42 * sin(ap.x * 15.0 + fbm2(ap * 2.2) * 3.0 + uTime * 1.6);
    float val = ribbon * vert * ray * 0.38;

    vec3 colA = vec3(0.16, 1.0, 0.68);
    vec3 colB = vec3(0.32, 0.82, 1.0);
    vec3 colC = vec3(1.0, 0.68, 0.28);
    vec3 aurCol = mix(colA, colB, clamp(skyY * 1.1, 0.0, 1.0));
    aurCol = mix(aurCol, colC, smoothstep(0.55, 1.05, skyY));
    accum += aurCol * val;
    mask = max(mask, clamp(val * 3.2, 0.0, 1.0));
  }

  // Bright arctic night stars
  vec2 starGrid = (p + vec2(0.0, 2.0)) * 58.0;
  float sh = hash21(floor(starGrid));
  if (sh > 0.972) {
    float star = smoothstep(0.36, 0.0, length(fract(starGrid) - 0.5)) * smoothstep(0.06, 0.35, skyY);
    accum += vec3(0.95, 0.98, 1.0) * star * 1.65;
    mask = max(mask, star);
  }

  // Silhouetted jagged fjord mountain peaks flanking the reflective bay
  float mH = (fbm2(vec2(p.x * 1.35 + 3.2, 1.5)) * 0.38 + 0.04) * smoothstep(0.04, 0.72, abs(ndc.x));
  if (!isWater && ndc.y < horizon + mH) {
    float ridgeHi = smoothstep(0.036, 0.0, abs(ndc.y - (horizon + mH)));
    accum = vec3(0.06, 0.14, 0.2) + vec3(0.55, 0.98, 0.88) * ridgeHi * 1.2;
    mask = max(0.22, ridgeHi);
  } else if (isWater) {
    float ripLine = 0.65 + 0.35 * sin((horizon - ndc.y) * 78.0 - uTime * 3.0);
    accum *= 0.82 * ripLine;
    mask = clamp(mask * 0.85, 0.0, 1.0);
  }

  fragColor = finishTone(accum, clamp(mask, 0.0, 1.0));
}
`,

  kleinian: buildRaymarchShader({
    baseDist: 2.95,
    maxSteps: 94,
    maxDist: 16.0,
    fogDensity: 0.012,
    stepScale: 0.72,
    useShadow: false,
    mapBody: `
vec2 mapWorld(vec3 p) {
  vec3 q = p;
  q.xz *= rot2(uTime * 0.16);
  vec3 cSize = vec3(0.86, 0.88, 0.86);
  float scale = 1.0;
  float trap = 1e6;

  // Monumental Knighty/Kali Pseudo-Kleinian fractal cathedral sculpture
  for (int i = 0; i < 8; i++) {
    q = 2.0 * clamp(q, -cSize, cSize) - q;
    float r2 = dot(q, q);
    float k = max(1.06 / max(r2, 0.16), 1.0);
    q *= k;
    scale *= k;
    trap = min(trap, r2);
  }

  float d = (length(q.xz) - 0.58) / scale;
  float dome = length(p) - 2.05;
  float core = -(length(p) - 0.42);
  return vec2(max(max(d, dome), core), clamp(trap * 1.15, 0.0, 1.0));
}`,
    shadeBody: `
    albedo = mix(vec3(0.26, 0.42, 0.56), vec3(0.96, 0.98, 1.0), matId);
    float filigree = smoothstep(0.35, 0.04, matId);
    emissive = vec3(0.28, 0.94, 0.88) * (filigree * 0.95 + fresnel * 0.75);`,
  }),

  starnest: `${SCENE_PREAMBLE}
void main() {
  vec2 ndc = (vUv * 2.0 - 1.0) * vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  vec3 dir = normalize(vec3(ndc, 1.1 * max(0.45, uZoom)));
  dir.xz *= rot2(uCamera.x * 0.75 + uTime * 0.07);
  dir.yz *= rot2(clamp(uCamera.y * 0.75, -1.0, 1.0));

  vec3 from = vec3(1.0, 0.5, 0.5) + vec3(uTime * 0.08, uTime * 0.05, -uTime * 0.14);

  // Authentic Kali Star Nest volumetric space-folding loop with calibrated luminance
  float s = 0.14;
  float fade = 1.0;
  vec3 accum = vec3(0.0);

  for (int r = 0; r < 16; r++) {
    vec3 p = from + s * dir * 0.52;
    p = abs(vec3(0.85) - mod(p, vec3(1.7)));
    float pa = 0.0;
    float a = 0.0;

    for (int i = 0; i < 14; i++) {
      p = abs(p) / max(dot(p, p), 0.004) - 0.53;
      a += abs(length(p) - pa);
      pa = length(p);
    }

    float dm = max(0.0, 0.35 - a * a * 0.001);
    float a3 = a * a * a;
    if (r > 5) fade *= 1.0 - dm;

    accum += vec3(s * 1.1, s * s * 1.3, s * s * s * 2.1) * a3 * 0.0018 * fade;
    fade *= 0.74;
    s += 0.115;
  }

  vec3 col = clamp(accum * 0.018, 0.0, 2.2);
  col = pow(col, vec3(1.65)) * 1.9;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  fragColor = finishTone(col, smoothstep(0.08, 0.52, lum));
}
`,

  turing: `${SCENE_PREAMBLE}
void main() {
  vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  vec2 p = (vUv - 0.5) * aspect * (4.6 / max(0.45, uZoom));
  float t = uTime * 0.38;

  vec2 mp = (uPointer - 0.5) * aspect * (4.6 / max(0.45, uZoom));
  float mDist = length(p - mp);
  vec2 push = normalize(p - mp + 1e-4) * exp(-mDist * 1.4) * uPointerActive * 0.55;

  vec2 q = p + push;
  float n1 = fbm2(q * 0.85 + vec2(t * 0.25, -t * 0.18));
  float n2 = fbm2(q * 0.85 + vec2(4.2 - t * 0.2, 1.7 + t * 0.22));
  vec2 warp = q + vec2(n1 - 0.5, n2 - 0.5) * 2.1;

  float field = sin(warp.x * 5.2 + sin(warp.y * 4.8 + t) * 1.4)
              + cos(warp.y * 5.4 - cos(warp.x * 4.6 - t * 0.8) * 1.4)
              + sin((warp.x + warp.y) * 3.6 + n1 * 4.0) * 0.65;

  float band = smoothstep(-0.35, 0.45, field);
  float ridge = smoothstep(0.14, 0.0, abs(field));
  float lum = clamp(band * 0.78 + ridge * 0.65, 0.0, 1.0);

  vec3 col = mix(vec3(0.0), vec3(0.96, 0.96, 0.94), lum);
  col += vec3(0.95, 0.36, 0.16) * ridge * 0.48;
  fragColor = finishTone(col, lum);
}
`,

  hopf: buildRaymarchShader({
    baseDist: 3.95,
    maxSteps: 90,
    maxDist: 16.0,
    fogDensity: 0.006,
    stepScale: 0.76,
    mapBody: `
vec2 mapWorld(vec3 p) {
  float t = uTime * 0.45;
  vec3 q = p;
  q.xz *= rot2(t * 0.6);
  q.xy *= rot2(0.32);

  float d = 1e6;
  float mId = 1.0;

  for (int layer = 0; layer < 2; layer++) {
    float majorR = layer == 0 ? 1.02 : 1.66;
    float minorR = layer == 0 ? 0.36 : 0.46;
    float fibers = layer == 0 ? 8.0 : 12.0;

    float phi = atan(q.z, q.x);
    vec2 tp = vec2(length(q.xz) - majorR, q.y);
    tp *= rot2(phi + t * (layer == 0 ? 1.2 : -0.8));

    float theta = atan(tp.y, tp.x);
    float sec = TAU / fibers;
    float a = mod(theta + sec * 0.5, sec) - sec * 0.5;
    vec2 fp = vec2(length(tp) * cos(a) - minorR, length(tp) * sin(a));
    float tube = length(fp) - (layer == 0 ? 0.088 : 0.068);
    if (tube < d) {
      d = tube;
      mId = layer == 0 ? 1.0 : 2.0;
    }
  }

  float axis = sdCylinder(q, 2.35, 0.095);
  return opU(vec2(d * 0.75, mId), vec2(axis, 3.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      albedo = vec3(0.95, 0.98, 1.0);
      emissive = vec3(0.42, 0.88, 1.0) * (0.22 + fresnel * 0.78);
    } else if (matId == 2.0) {
      albedo = vec3(0.62, 0.8, 0.98);
      emissive = vec3(0.28, 0.74, 1.0) * fresnel * 0.62;
    } else {
      albedo = vec3(1.0, 0.9, 0.6);
      emissive = vec3(1.0, 0.76, 0.32) * 1.25;
    }`,
  }),
};
