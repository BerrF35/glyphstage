import { buildRaymarchShader } from '../sceneBase.glsl';

export const NATURE_SHADERS = {
  topography: buildRaymarchShader({
    baseDist: 4.6,
    target: 'vec3(0.0, -0.3, 0.0)',
    maxSteps: 88,
    maxDist: 24.0,
    fogDensity: 0.0075,
    mapBody: `
vec2 mapWorld(vec3 p) {
  vec2 q = p.xz * 0.36 + vec2(0.0, uTime * 0.28);
  float ridge = 1.0 - abs(fbm2(q) * 2.0 - 1.0);
  float h = pow(ridge, 1.45) * 1.95 + fbm2(q * 2.2) * 0.42 - 1.35;
  float valley = smoothstep(0.0, 2.6, abs(p.x));
  h = mix(h * 0.35 - 0.85, h, valley);
  float terrain = (p.y - h) * 0.62;

  vec3 bp = p - vec3(0.0, 0.95 + sin(uTime * 1.5) * 0.14, 0.0);
  bp.xz *= rot2(uTime * 0.7);
  float beacon = min(sdOctahedron(bp, 0.34), sdTorus(bp, vec2(0.62, 0.028)));
  return opU(vec2(terrain, clamp((h + 1.3) * 0.42, 0.0, 1.0)), vec2(beacon, 2.5));
}`,
    shadeBody: `
    if (matId > 2.0) {
      albedo = vec3(1.0, 0.82, 0.42);
      emissive = vec3(1.0, 0.68, 0.24) * 0.9;
    } else {
      albedo = mix(vec3(0.18, 0.26, 0.34), vec3(0.82, 0.88, 0.94), matId);
      float contour = smoothstep(0.06, 0.0, abs(fract(p.y * 3.4) - 0.5));
      float scan = exp(-abs(length(p.xz) - mod(uTime * 2.2, 7.5)) * 3.5);
      emissive = vec3(0.2, 0.9, 0.72) * (contour * 0.72 + scan * 0.6);
    }`,
  }),

  swell: buildRaymarchShader({
    baseDist: 4.3,
    maxSteps: 86,
    maxDist: 24.0,
    fogDensity: 0.006,
    mapBody: `
vec2 mapWorld(vec3 p) {
  float t = uTime * 1.1;
  vec2 w = p.xz;
  float h = 0.0;
  h += sin(w.x * 1.35 + w.y * 0.45 - t * 1.6) * 0.22;
  h += sin(w.y * 1.85 - w.x * 0.7 - t * 1.25) * 0.14;
  h += cos((w.x + w.y) * 2.9 + t * 2.1) * 0.06;
  h += (fbm2(w * 1.6 + vec2(0.0, -t * 0.55)) - 0.5) * 0.14;
  float sea = (p.y + 0.65 - h) * 0.65;
  float moon = sdSphere(p - vec3(0.0, 1.45, -5.2), 0.88);
  return opU(vec2(sea, clamp((h + 0.35) * 1.5, 0.0, 1.0)), vec2(moon, 3.0));
}`,
    shadeBody: `
    if (matId > 2.0) {
      albedo = vec3(1.0);
      emissive = vec3(0.95, 0.98, 1.0) * 1.15;
    } else {
      albedo = mix(vec3(0.08, 0.26, 0.46), vec3(0.76, 0.92, 0.98), smoothstep(0.55, 0.95, matId));
      emissive = vec3(0.32, 0.75, 0.95) * spec * 0.65;
    }`,
  }),

  medusa: buildRaymarchShader({
    baseDist: 3.75,
    target: 'vec3(0.0, -0.1, 0.0)',
    maxSteps: 90,
    maxDist: 16.0,
    fogDensity: 0.012,
    stepScale: 0.78,
    glowMatId: 1,
    glowColor: 'vec3(0.24, 0.94, 0.88)',
    glowGain: 0.58,
    mapBody: `
vec2 mapWorld(vec3 p) {
  float t = uTime;
  float pulse = sin(t * 2.3);
  float bob = sin(t * 2.3 - 0.7) * 0.16;

  vec3 bp = p - vec3(0.0, 0.55 + bob, 0.0);
  float stretch = 1.0 + 0.14 * pulse;
  vec3 sp = vec3(bp.x / stretch, bp.y * stretch, bp.z / stretch);

  float ang = atan(sp.z, sp.x);
  float scallops = sin(ang * 12.0) * 0.048 * smoothstep(0.4, -0.2, sp.y);
  float outer = sdSphere(sp, 1.04 + scallops);
  float inner = sdSphere(sp - vec3(0.0, -0.24, 0.0), 0.96);
  float bell = max(outer, -inner);
  bell = max(bell, -(sp.y + 0.22 + scallops));

  float crown = sdSphere(bp - vec3(0.0, 0.12, 0.0), 0.38 + 0.04 * sin(ang * 4.0 + t * 2.0));

  float sec = TAU / 8.0;
  float ta = mod(ang + sec * 0.5, sec) - sec * 0.5;
  float rr = length(p.xz);
  vec3 tp = vec3(rr * cos(ta) - 0.5, p.y - bob, rr * sin(ta));
  float sway = sin(tp.y * 3.2 + t * 2.8) * 0.15 * smoothstep(0.4, -1.6, tp.y);
  float swayZ = cos(tp.y * 2.6 + t * 2.2) * 0.11 * smoothstep(0.4, -1.6, tp.y);
  float tent = sdCapsule(tp - vec3(sway, 0.0, swayZ), vec3(0.0, 0.35, 0.0), vec3(0.0, -1.9, 0.0), 0.048 * smoothstep(-2.0, 0.3, tp.y));

  vec3 op = p - vec3(sin(p.y * 3.0 + t * 2.5) * 0.09, bob, cos(p.y * 2.4 + t * 2.1) * 0.09);
  float oral = sdCapsule(op, vec3(0.0, 0.25, 0.0), vec3(0.0, -1.6, 0.0), 0.088 + 0.025 * sin(p.y * 12.0));

  // Drifting abyssal plankton motes
  vec3 mp = mod(p - vec3(0.0, uTime * 0.22, 0.0) + 0.85, 1.7) - 0.85;
  float mote = max(sdSphere(mp, 0.026), -(length(p) - 1.5));

  vec2 res = vec2(bell, 1.0);
  res = opU(res, vec2(crown, 2.0));
  res = opU(res, vec2(min(tent, oral), 3.0));
  return opU(res, vec2(mote, 2.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      float ribs = 0.5 + 0.5 * sin(atan(p.z, p.x) * 12.0);
      albedo = vec3(0.38, 0.96, 0.95);
      emissive = vec3(0.22, 0.9, 0.98) * (fresnel * 1.25 + ribs * 0.35);
    } else if (matId == 2.0) {
      albedo = vec3(1.0, 0.78, 0.4);
      emissive = vec3(1.0, 0.62, 0.28) * 1.35;
    } else {
      albedo = vec3(0.48, 0.92, 0.98);
      float glowWave = 0.45 + 0.55 * sin(p.y * 5.0 + uTime * 4.0);
      emissive = vec3(0.28, 0.9, 0.96) * glowWave * 0.82;
    }`,
  }),

  caldera: buildRaymarchShader({
    baseDist: 4.8,
    target: 'vec3(0.0, -0.35, 0.0)',
    maxSteps: 88,
    maxDist: 22.0,
    fogDensity: 0.008,
    mapBody: `
vec2 mapWorld(vec3 p) {
  vec2 uv = p.xz * 0.52 + vec2(uTime * 0.14, -uTime * 0.18);
  vec2 v = voronoi2(uv);
  float crack = smoothstep(0.04, 0.24, v.y);
  float crustH = crack * 0.42 + fbm2(uv * 2.5) * 0.18 - 0.85;
  float dome = smoothstep(2.2, 5.5, length(p.xz)) * 1.15;
  float ground = (p.y - (crustH + dome)) * 0.62;

  float ang = atan(p.z, p.x);
  float sec = TAU / 7.0;
  float a = mod(ang + sec * 0.5, sec) - sec * 0.5;
  float r = length(p.xz);
  vec3 sp = vec3(r * cos(a) - 3.3, p.y - 0.1, r * sin(a));
  float spire = sdCylinder(sp, 1.6, max(0.05, 0.42 - (sp.y + 1.2) * 0.18));

  return opU(vec2(ground, crack), vec2(spire, 2.0));
}`,
    shadeBody: `
    if (matId > 1.5) {
      albedo = vec3(0.24, 0.22, 0.24);
      float underHeat = smoothstep(0.9, -0.9, p.y);
      emissive = vec3(1.0, 0.34, 0.08) * underHeat * 0.45;
    } else {
      float magma = 1.0 - smoothstep(0.0, 0.55, matId);
      float pulse = 0.78 + 0.22 * sin(uTime * 3.2 + p.x * 2.0 + p.z * 2.0);
      albedo = mix(vec3(1.0, 0.86, 0.42), vec3(0.18, 0.16, 0.18), matId);
      emissive = mix(vec3(1.0, 0.22, 0.04), vec3(1.0, 0.92, 0.55), magma) * magma * pulse * 1.6;
    }`,
  }),

  glacier: buildRaymarchShader({
    maxSteps: 92,
    maxDist: 26.0,
    fogDensity: 0.008,
    stepScale: 0.72,
    fov: 1.45,
    useShadow: false,
    background: 'vec3(0.28, 0.72, 0.96) * 0.55',
    cameraSetup: `
  float zRun = -uTime * 1.15;
  vec3 ro = vec3(sin(uTime * 0.4) * 0.45 + sin(uCamera.x) * 0.9, clamp(uCamera.y, -0.5, 0.5) * 0.8, zRun);
  vec3 ta = vec3(sin(uTime * 0.4 + 0.5) * 0.35, 0.0, zRun - 4.5);`,
    mapBody: `
vec2 mapWorld(vec3 p) {
  vec2 path = vec2(sin(p.z * 0.28) * 0.65, cos(p.z * 0.22) * 0.35);
  vec2 rel = p.xy - path;
  float ang = atan(rel.y, rel.x);
  vec2 v = voronoi2(vec2(ang * 2.2, p.z * 0.65));
  float facet = (v.x * 0.55 - v.y * 0.35);
  float tunnel = -(length(rel) - (1.85 + facet * 0.75));

  vec3 icP = vec3(mod(p.x + 0.9, 1.8) - 0.9, abs(p.y) - 1.25, mod(p.z + 1.1, 2.2) - 1.1);
  float icicle = sdCylinder(icP, 0.75, max(0.02, 0.18 * (1.0 - abs(icP.y) * 1.1)));

  return vec2(min(tunnel, icicle), clamp(v.y * 2.2, 0.0, 1.0));
}`,
    shadeBody: `
    albedo = mix(vec3(0.22, 0.62, 0.92), vec3(0.95, 0.99, 1.0), matId);
    float ridge = smoothstep(0.18, 0.0, matId);
    emissive = vec3(0.45, 0.9, 1.0) * (fresnel * 0.95 + ridge * 0.62);`,
  }),

  fungi: buildRaymarchShader({
    baseDist: 4.35,
    target: 'vec3(0.0, 0.08, 0.0)',
    maxSteps: 90,
    maxDist: 20.0,
    fogDensity: 0.0085,
    glowMatId: 2,
    glowColor: 'vec3(0.32, 1.0, 0.66)',
    glowGain: 0.58,
    mapBody: `
float sdMushroom(vec3 p, vec3 pos, float sc, float lean) {
  vec3 q = (p - pos) / sc;
  q.x -= sin(q.y * 1.4 + uTime * 0.6) * lean;
  float stem = sdCapsule(q, vec3(0.0, -1.25, 0.0), vec3(0.0, 0.45, 0.0), 0.15 + (0.45 - q.y) * 0.045);
  vec3 cp = q - vec3(0.0, 0.48, 0.0);
  float capOut = sdSphere(vec3(cp.x, cp.y * 1.42, cp.z), 0.98);
  float capIn = sdSphere(vec3(cp.x, (cp.y + 0.35) * 1.35, cp.z), 0.94);
  float cap = max(capOut, -capIn);
  cap = max(cap, -(cp.y + 0.14));
  return min(stem, cap) * sc;
}

vec2 mapWorld(vec3 p) {
  float m1 = sdMushroom(p, vec3(0.0, 0.18, 0.0), 1.32, 0.12);
  float m2 = sdMushroom(p, vec3(-1.42, -0.32, 0.62), 0.86, -0.18);
  float m3 = sdMushroom(p, vec3(1.36, -0.4, -0.52), 0.82, 0.16);
  float m4 = sdMushroom(p, vec3(0.62, -0.62, 1.32), 0.6, -0.14);
  float m5 = sdMushroom(p, vec3(-0.82, -0.58, -1.22), 0.66, 0.14);
  float shrooms = min(min(m1, m2), min(min(m3, m4), m5));

  float floorP = (p.y + 1.32 - fbm2(p.xz * 0.8) * 0.28) * 0.7;

  vec3 sp = mod(p - vec3(0.0, uTime * 0.35, 0.0) + 0.55, 1.1) - 0.55;
  float spore = sdSphere(sp, 0.036);
  spore = max(spore, length(p.xz) - 2.6);

  vec2 res = vec2(shrooms, 1.0);
  res = opU(res, vec2(spore, 2.0));
  return opU(res, vec2(floorP, 3.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      float gills = 0.5 + 0.5 * sin(atan(p.z, p.x) * 24.0);
      float spots = smoothstep(0.66, 0.84, noise3(p * 4.5));
      albedo = mix(vec3(0.32, 0.88, 0.64), vec3(0.95, 1.0, 0.92), spots);
      float underGlow = smoothstep(0.25, -0.45, n.y);
      emissive = vec3(0.28, 1.0, 0.66) * (underGlow * gills * 1.15 + spots * 0.65 + fresnel * 0.58);
    } else if (matId == 2.0) {
      albedo = vec3(0.92, 1.0, 0.88);
      emissive = vec3(0.4, 1.0, 0.7) * 1.65;
    } else {
      albedo = vec3(0.2, 0.3, 0.24);
      emissive = vec3(0.14, 0.52, 0.36) * exp(-length(p.xz) * 0.55) * 0.35;
    }`,
  }),
};
