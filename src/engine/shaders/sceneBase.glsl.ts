export const SCENE_PREAMBLE = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uCamera;
uniform float uZoom;
uniform vec3 uFlyOffset;
uniform vec3 uLightDir;
uniform float uLightIntensity;
uniform float uRimIntensity;
uniform float uExposure;
uniform float uContrast;
uniform vec2 uPointer;
uniform float uPointerActive;
uniform float uPointerDown;
uniform vec4 uAudio;
uniform float uMediaParallax;
uniform float uMediaMirror;
uniform float uMediaThreshold;
uniform vec2 uMediaAspect;
uniform sampler2D uMediaTex;
uniform sampler2D uTextTex;
uniform sampler2D uSimTex;

const float PI = 3.14159265;
const float TAU = 6.2831853;

mat2 rot2(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float hash31(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i);
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
}

float fbm2(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise2(p);
    p = m * p * 2.03;
    a *= 0.5;
  }
  return v;
}

float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise3(p);
    p = p * 2.02 + vec3(13.1, 7.7, 5.3);
    a *= 0.5;
  }
  return v;
}

vec2 voronoi2(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float md = 8.0;
  float md2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(hash21(n + g), hash21(n + g + 17.3));
      o = 0.5 + 0.42 * sin(uTime * 0.6 + TAU * o);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md) {
        md2 = md;
        md = d;
      } else if (d < md2) {
        md2 = d;
      }
    }
  }
  return vec2(sqrt(md), sqrt(md2) - sqrt(md));
}

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdOctahedron(vec3 p, float s) {
  p = abs(p);
  return (p.x + p.y + p.z - s) * 0.57735027;
}

float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

float sdCylinder(vec3 p, float h, float r) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float sdHexPrism(vec3 p, vec2 h) {
  const vec3 k = vec3(-0.8660254, 0.5, 0.57735);
  p = abs(p);
  p.xy -= 2.0 * min(dot(k.xy, p.xy), 0.0) * k.xy;
  vec2 d = vec2(
    length(p.xy - vec2(clamp(p.x, -k.z * h.x, k.z * h.x), h.x)) * sign(p.y - h.x),
    p.z - h.y
  );
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

vec2 opU(vec2 a, vec2 b) {
  return a.x < b.x ? a : b;
}

vec3 orbitCameraPos(float baseDist, vec2 camAngles, float zoom) {
  float aspect = uResolution.x / max(1.0, uResolution.y);
  float portraitScale = mix(1.42, 1.0, smoothstep(0.5, 1.15, aspect));
  float audioKick = 1.0 - clamp(uAudio.x * 0.09, 0.0, 0.22);
  float dist = (baseDist * portraitScale * audioKick) / max(0.45, zoom);
  float yaw = camAngles.x;
  float pitch = clamp(camAngles.y, -1.08, 1.18);
  return vec3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * dist + uFlyOffset;
}

vec4 finishTone(vec3 col, float depthMask) {
  float audioBoost = 1.0 + uAudio.w * 0.32;
  col *= uExposure * audioBoost;
  col = col / (1.0 + col * 0.36);
  col = pow(max(col, 0.0), vec3(1.0 / max(0.5, uContrast)));
  return vec4(col, clamp(depthMask, 0.0, 1.0));
}
`;

export interface RaymarchWorldOptions {
  baseDist?: number;
  target?: string;
  maxSteps?: number;
  maxDist?: number;
  fogDensity?: number;
  stepScale?: number;
  useShadow?: boolean;
  fov?: number;
  glowMatId?: number;
  glowColor?: string;
  glowGain?: number;
  cameraSetup?: string;
  background?: string;
  mapBody: string;
  shadeBody: string;
}

export function buildRaymarchShader(opts: RaymarchWorldOptions): string {
  const baseDist = (opts.baseDist ?? 5.0).toFixed(2);
  const target = opts.target ?? 'vec3(0.0)';
  const maxSteps = opts.maxSteps ?? 88;
  const maxDist = (opts.maxDist ?? 24.0).toFixed(1);
  const fogDensity = (opts.fogDensity ?? 0.008).toFixed(5);
  const stepScale = (opts.stepScale ?? 1.0).toFixed(2);
  const fov = (opts.fov ?? 1.65).toFixed(2);
  const glowMatId = opts.glowMatId ?? -99;
  const glowColor = opts.glowColor ?? 'vec3(1.0, 0.6, 0.2)';
  const glowGain = (opts.glowGain ?? 0.45).toFixed(3);
  const shadowExpr = opts.useShadow === false ? '1.0' : 'calcSoftShadow(p + n * 0.02, lDir)';
  const camBlock =
    opts.cameraSetup ??
    `vec3 ro = orbitCameraPos(${baseDist}, uCamera, uZoom);
  vec3 ta = (${target}) + uFlyOffset;`;
  const bgExpr = opts.background ?? 'vec3(0.0)';

  return `${SCENE_PREAMBLE}

${opts.mapBody}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.0022, -0.0022);
  return normalize(
    e.xyy * mapWorld(p + e.xyy).x +
    e.yyx * mapWorld(p + e.yyx).x +
    e.yxy * mapWorld(p + e.yxy).x +
    e.xxx * mapWorld(p + e.xxx).x
  );
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 4; i++) {
    float h = 0.04 + 0.14 * float(i);
    float d = mapWorld(p + h * n).x;
    occ += (h - d) * sca;
    sca *= 0.72;
  }
  return clamp(1.0 - 1.75 * occ, 0.08, 1.0);
}

float calcSoftShadow(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.06;
  for (int i = 0; i < 18; i++) {
    float h = mapWorld(ro + rd * t).x;
    res = min(res, 7.0 * h / t);
    t += clamp(h, 0.04, 0.35);
    if (res < 0.02 || t > 8.0) break;
  }
  return clamp(res, 0.18, 1.0);
}

void main() {
  vec2 ndc = (vUv * 2.0 - 1.0) * vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  ${camBlock}
  ${opts.cameraSetup ? 'ro += uFlyOffset; ta += uFlyOffset;' : ''}
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(ndc.x * uu + ndc.y * vv + ${fov} * ww);

  float t = 0.0;
  float matId = -1.0;
  float glowAccum = 0.0;

  for (int i = 0; i < ${maxSteps}; i++) {
    vec3 p = ro + rd * t;
    vec2 h = mapWorld(p);
    ${
      glowMatId >= 0
        ? `if (abs(h.y - ${glowMatId.toFixed(1)}) < 0.2) { glowAccum += 0.015 / (0.07 + abs(h.x) * 7.5); }`
        : ''
    }
    if (h.x < 0.0022) {
      matId = h.y;
      break;
    }
    t += h.x * ${stepScale};
    if (t > ${maxDist}) break;
  }

  vec3 col = ${bgExpr};
  float depthMask = 0.0;

  if (matId >= 0.0) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 lDir = normalize(uLightDir);
    vec3 rimDir = normalize(vec3(-lDir.x, 0.35, -lDir.z));
    vec3 hVec = normalize(lDir - rd);

    float diff = max(0.0, dot(n, lDir));
    float spec = pow(max(0.0, dot(n, hVec)), 34.0);
    float fresnel = pow(1.0 - max(0.0, dot(n, -rd)), 2.8);
    float rim = fresnel * (0.45 + 0.55 * max(0.0, dot(n, rimDir))) * (uRimIntensity + uAudio.y * 0.65);
    float ao = calcAO(p, n);
    float sh = ${shadowExpr};

    vec2 pNdc = (uPointer * 2.0 - 1.0) * vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
    vec3 cursorLight = normalize(pNdc.x * uu + pNdc.y * vv + 0.7 * ww);
    float cursorSpec = pow(max(0.0, dot(n, normalize(cursorLight - rd))), 18.0) * uPointerActive * 0.65;

    vec3 albedo = vec3(0.76, 0.8, 0.85);
    vec3 emissive = vec3(0.0);
    ${opts.shadeBody}

    vec3 keyCol = vec3(1.0, 0.96, 0.9);
    vec3 rimCol = vec3(0.45, 0.85, 0.98);

    col = albedo * (0.14 * ao + diff * sh * uLightIntensity * keyCol)
        + rim * rimCol * 0.85
        + (spec * 0.85 + cursorSpec) * keyCol
        + emissive * (1.0 + uAudio.x * 0.45);

    float fog = exp(-t * t * ${fogDensity});
    col *= fog;
    depthMask = clamp((1.0 - t / ${maxDist}) * 0.85 + 0.15, 0.1, 1.0);
  }

  ${glowMatId >= 0 ? `col += ${glowColor} * glowAccum * ${glowGain} * (1.0 + uAudio.x * 0.55);` : ''}
  fragColor = finishTone(col, depthMask);
}
`;
}
