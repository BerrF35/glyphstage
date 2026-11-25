import { buildRaymarchShader, SCENE_PREAMBLE } from '../sceneBase.glsl';

export const KINETIC_SHADERS = {
  playcore: `${SCENE_PREAMBLE}
void main() {
  vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  vec2 p = (vUv - 0.5) * aspect * (2.6 / max(0.45, uZoom));
  float t = uTime * 0.55;

  vec2 mp = (uPointer - 0.5) * aspect * (2.6 / max(0.45, uZoom));
  float mDist = length(p - mp);
  float ripple = sin(mDist * 14.0 - uTime * 5.0) * exp(-mDist * 2.4) * uPointerActive * 0.45;

  vec2 q = p;
  q.x += sin(p.y * 2.6 + t) * 0.35 + cos(length(p) * 3.2 - t * 1.4) * 0.18;
  q.y += cos(p.x * 2.4 - t * 0.9) * 0.35 + ripple;

  float w1 = sin(q.x * 4.4 + q.y * 1.9 + t * 1.5);
  float w2 = cos(length(q) * 6.4 - t * 1.9);
  float w3 = sin(atan(q.y, q.x) * 5.0 + length(q) * 3.4 - t * 1.1);

  float field = 0.46 * w1 + 0.36 * w2 + 0.18 * w3 + ripple * 1.5;
  float ridge = smoothstep(-0.18, 0.88, field);
  float iso = smoothstep(0.075, 0.0, abs(fract(field * 1.35) - 0.5)) * smoothstep(-0.35, 0.25, field);
  float v = clamp(ridge * 0.88 + iso * 0.45, 0.0, 1.0);

  vec3 col = mix(vec3(0.0), vec3(0.95, 0.97, 1.0), v);
  col += vec3(0.95, 0.32, 0.14) * iso * 0.42;
  fragColor = finishTone(col, clamp(v * 0.9 + iso * 0.5, 0.0, 1.0));
}
`,

  chladni: `${SCENE_PREAMBLE}
void main() {
  vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  vec2 p = (vUv - 0.5) * aspect * (2.15 / max(0.45, uZoom));

  float t = uTime * 0.32;
  float n1 = 3.0 + 2.0 * sin(t * 0.7) + (uPointer.x - 0.5) * 3.0 * uPointerActive;
  float m1 = 5.0 + 2.0 * cos(t * 0.55) + (uPointer.y - 0.5) * 3.0 * uPointerActive;
  float n2 = 2.0 + 3.0 * cos(t * 0.42);
  float m2 = 6.0 + 2.0 * sin(t * 0.61);

  float modeA = cos(n1 * PI * p.x) * cos(m1 * PI * p.y) - cos(m1 * PI * p.x) * cos(n1 * PI * p.y);
  float modeB = sin(n2 * PI * p.x) * sin(m2 * PI * p.y) + sin(m2 * PI * p.x) * sin(n2 * PI * p.y);
  float morph = 0.5 + 0.5 * sin(t * 0.8);
  float v = mix(modeA, modeB, morph);

  float plate = smoothstep(0.96, 0.92, max(abs(p.x), abs(p.y)));
  float nodal = exp(-abs(v) * 6.5);
  float harmonic = smoothstep(0.18, 0.0, abs(fract(v * 1.4) - 0.5)) * 0.38;
  float lum = clamp((nodal + harmonic) * plate, 0.0, 1.0);

  vec3 col = mix(vec3(0.0), vec3(0.96, 0.95, 0.92), lum);
  col += vec3(0.95, 0.38, 0.16) * pow(nodal, 3.0) * plate * 0.45;
  fragColor = finishTone(col, lum);
}
`,

  moire: `${SCENE_PREAMBLE}
void main() {
  vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  vec2 st = (vUv - 0.5) * aspect * (2.2 / max(0.45, uZoom));
  float t = uTime * 0.25;

  vec2 centerA = vec2(cos(t * 1.9), sin(t * 2.7)) * 0.55;
  vec2 centerB = uPointerActive > 0.5
    ? (uPointer - 0.5) * aspect * (2.2 / max(0.45, uZoom))
    : vec2(cos(t * 2.3 + 1.8), sin(t * 1.6)) * 0.55;

  float freqA = 26.0 + 14.0 * sin(t * 1.2);
  float freqB = 28.0 + 14.0 * cos(t * 1.5);

  float waveA = cos(length(st - centerA) * freqA - uTime * 2.5);
  float waveB = cos(length(st - centerB) * freqB + uTime * 2.0);
  float polar = cos(atan(st.y - centerA.y, st.x - centerA.x) * 18.0 + uTime);

  float interfere = 0.5 + 0.5 * (waveA * waveB * 0.78 + polar * 0.22);
  float sharp = smoothstep(0.28, 0.84, interfere);

  vec3 col = mix(vec3(0.0), vec3(0.98, 1.0, 1.0), sharp) * 1.2;
  col += vec3(0.2, 0.92, 0.78) * smoothstep(0.8, 0.97, interfere) * 0.55;
  fragColor = finishTone(col, sharp);
}
`,

  quasicrystal: `${SCENE_PREAMBLE}
void main() {
  vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  vec2 p = (vUv - 0.5) * aspect * (18.0 / max(0.45, uZoom));
  p *= rot2(uCamera.x * 0.5 + uTime * 0.08);
  float t = uTime * 0.85;

  float sum = 0.0;
  for (int i = 0; i < 5; i++) {
    float a = float(i) * PI / 5.0;
    vec2 dir = vec2(cos(a), sin(a));
    sum += cos(dot(p, dir) + t);
  }
  float norm = sum / 5.0;
  float v = 0.5 + 0.5 * cos(norm * PI * 2.2);
  float crisp = smoothstep(0.16, 0.9, v);
  float contour = smoothstep(0.08, 0.0, abs(norm));

  vec3 col = mix(vec3(0.1, 0.24, 0.48), vec3(0.94, 0.97, 1.0), crisp);
  col += vec3(0.45, 0.9, 1.0) * contour * 0.45;
  fragColor = finishTone(col, clamp(crisp + contour * 0.4, 0.0, 1.0));
}
`,

  flame: `${SCENE_PREAMBLE}
void main() {
  vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  vec2 uv = vUv;
  float t = uTime * 2.1;

  // Sculpted licking roaring tongues + turbulent convection
  float x = (uv.x - 0.5) * aspect.x;
  vec2 q = vec2(x * 3.8, uv.y * 2.8 - t);
  float w1 = fbm2(q);
  float w2 = fbm2(q * 2.2 + vec2((w1 - 0.5) * 2.6, -t * 0.85));

  // Distinct multi-plume tongue peaks
  float tongues = 0.5 + 0.5 * sin(x * 6.5 + (w1 - 0.5) * 4.5 + sin(t * 0.7)) * cos(x * 3.1 - t * 0.4);
  float envelope = exp(-abs(x) * 0.55) * (0.48 + 0.62 * tongues);
  float cDist = length((uv - uPointer) * aspect);
  float cursorFlare = exp(-cDist * 4.5) * uPointerActive * 0.85;

  float shape = (1.0 - uv.y * (1.18 - envelope * 0.42)) + (w2 - 0.46) * 0.82 + cursorFlare;
  float heat = smoothstep(0.08, 1.15, shape);

  // Rising glowing ember sparks above flame tips
  vec2 sp = vec2(x * 16.0 + sin(uv.y * 8.0 + t) * 0.6, uv.y * 16.0 - t * 2.6);
  float sparkId = hash21(floor(sp));
  float sparks = step(0.94, sparkId) * smoothstep(0.28, 0.0, length(fract(sp) - 0.5)) * smoothstep(0.1, 0.85, uv.y);

  vec3 col = mix(vec3(0.0), vec3(0.95, 0.14, 0.03), smoothstep(0.02, 0.36, heat));
  col = mix(col, vec3(1.0, 0.62, 0.1), smoothstep(0.32, 0.68, heat));
  col = mix(col, vec3(1.0, 0.98, 0.86), smoothstep(0.66, 0.96, heat));
  col = col * 1.35 + vec3(1.0, 0.82, 0.35) * sparks * 1.4;
  fragColor = finishTone(col, clamp(heat + sparks, 0.0, 1.0));
}
`,

  type3d: buildRaymarchShader({
    baseDist: 3.35,
    maxSteps: 86,
    maxDist: 16.0,
    fogDensity: 0.006,
    mapBody: `
vec2 mapWorld(vec3 p) {
  vec2 uv = vec2(p.x * 0.24 + 0.5, 0.5 - p.y * 0.42);
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec2 s = texture(uTextTex, clamp(uv, 0.002, 0.998)).rg;
  float field = mix(0.0, s.r, inside);
  float dz = abs(p.z) - 0.34;
  float d2 = (0.48 - field) * 0.56;
  float bevel = length(max(vec2(d2, dz), 0.0)) + min(max(d2, dz), 0.0) - 0.035;
  float bar = sdBox(p - vec3(0.0, -0.96, 0.0), vec3(1.75, 0.04, 0.18));
  return opU(vec2(bevel * 0.72, 1.0), vec2(bar, 2.0));
}`,
    shadeBody: `
    if (matId > 1.5) {
      albedo = vec3(1.0, 0.72, 0.28);
      emissive = vec3(1.0, 0.62, 0.18) * 0.65;
    } else {
      albedo = vec3(0.98, 0.96, 0.92);
      emissive = vec3(1.0, 0.72, 0.28) * (0.28 + fresnel * 0.75);
    }`,
  }),

  media: `${SCENE_PREAMBLE}
void main() {
  float viewAspect = uResolution.x / max(1.0, uResolution.y);
  float srcAspect = uMediaAspect.x / max(1.0, uMediaAspect.y);

  vec2 centered = vUv - 0.5;
  if (viewAspect > srcAspect) {
    centered.x *= viewAspect / srcAspect;
  } else {
    centered.y *= srcAspect / viewAspect;
  }
  centered /= max(0.45, uZoom);

  vec2 tilt = vec2(sin(uCamera.x) * 0.08, -sin(uCamera.y) * 0.08) * uMediaParallax;
  vec2 baseUv = vec2(centered.x + 0.5, 0.5 - centered.y);
  if (uMediaMirror > 0.5) {
    baseUv.x = 1.0 - baseUv.x;
  }
  if (baseUv.x < 0.0 || baseUv.x > 1.0 || baseUv.y < 0.0 || baseUv.y > 1.0) {
    fragColor = vec4(0.0);
    return;
  }

  vec3 raw0 = texture(uMediaTex, baseUv).rgb;
  float depth = dot(raw0, vec3(0.299, 0.587, 0.114));
  vec2 pUv = clamp(baseUv - tilt * (depth - 0.35), 0.002, 0.998);

  vec3 col = texture(uMediaTex, pUv).rgb;
  vec2 texel = 1.0 / max(vec2(64.0), uMediaAspect);
  float lL = dot(texture(uMediaTex, pUv - vec2(texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
  float lR = dot(texture(uMediaTex, pUv + vec2(texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
  float lU = dot(texture(uMediaTex, pUv - vec2(0.0, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
  float lD = dot(texture(uMediaTex, pUv + vec2(0.0, texel.y)).rgb, vec3(0.299, 0.587, 0.114));

  vec3 n = normalize(vec3((lL - lR) * 3.5 * uMediaParallax, (lD - lU) * 3.5 * uMediaParallax, 1.0));
  float ndotl = max(0.0, dot(n, normalize(uLightDir)));
  vec3 lit = col * (0.45 + ndotl * uLightIntensity * 0.72);
  float lum = dot(lit, vec3(0.2126, 0.7152, 0.0722));
  float gate = smoothstep(uMediaThreshold, min(0.99, uMediaThreshold + 0.18), lum);
  lit *= gate;
  float mask = smoothstep(0.04, 0.18, lum) * gate;
  fragColor = finishTone(lit, mask);
}
`,
};
