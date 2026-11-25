import { buildRaymarchShader, SCENE_PREAMBLE } from '../sceneBase.glsl';

export const TOPOLOGY_SHADERS = {
  gyroid: buildRaymarchShader({
    baseDist: 3.6,
    maxSteps: 86,
    maxDist: 16.0,
    fogDensity: 0.012,
    useShadow: false,
    mapBody: `
vec2 mapWorld(vec3 p) {
  vec3 q = p;
  q.z -= uTime * 0.55;
  float scale = 1.65;
  vec3 sp = q * scale;
  float g = dot(sin(sp), cos(sp.yzx)) / scale;
  float shell = abs(g) - 0.085;
  float ribs = sin(dot(sin(sp * 2.0), cos(sp.zxy * 2.0)) * 3.0) * 0.008;
  float bound = max(shell + ribs, length(p) - 2.35);
  float ring = sdTorus(p, vec2(1.4, 0.05));
  return opU(vec2(bound * 0.75, clamp(0.5 + g * 1.5, 0.0, 1.0)), vec2(ring, 2.2));
}`,
    shadeBody: `
    albedo = (matId > 1.5) ? vec3(0.98, 0.72, 0.32) : mix(vec3(0.26, 0.52, 0.82), vec3(0.88, 0.95, 1.0), matId);
    emissive = (matId > 1.5) ? vec3(0.95, 0.58, 0.2) * 0.65 : vec3(0.15, 0.45, 0.75) * fresnel * 0.45;`,
  }),

  knot: buildRaymarchShader({
    baseDist: 3.35,
    maxSteps: 88,
    maxDist: 16.0,
    fogDensity: 0.007,
    mapBody: `
vec2 mapWorld(vec3 p) {
  float t = uTime * 0.35;
  vec3 q = p;
  q.xz *= rot2(t);
  float r = length(q.xz);
  float a = atan(q.z, q.x);
  vec2 cp = vec2(r - 1.05, q.y);
  cp *= rot2(a * 1.5 + t);
  cp.x = abs(cp.x) - 0.34;
  float flute = sin(atan(cp.y, cp.x) * 8.0 + a * 6.0) * 0.018;
  float dKnot = length(cp) - 0.25 + flute;

  vec3 g = p;
  g.xy *= rot2(-t * 1.3);
  return opU(vec2(dKnot * 0.72, 1.0), vec2(sdTorus(g, vec2(1.86, 0.048)), 2.0));
}`,
    shadeBody: `
    albedo = (matId > 1.5) ? vec3(0.98, 0.68, 0.3) : vec3(0.92, 0.94, 0.98);
    emissive = vec3(0.85, 0.78, 0.7) * (spec * 0.55 + fresnel * 0.35);`,
  }),

  metaballs: buildRaymarchShader({
    baseDist: 3.55,
    maxSteps: 84,
    maxDist: 15.0,
    fogDensity: 0.007,
    mapBody: `
vec2 mapWorld(vec3 p) {
  float t = uTime * 0.85;
  float d = 1e6;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec3 c = vec3(
      sin(t * (0.7 + fi * 0.13) + fi * 1.7) * 1.02,
      cos(t * (0.85 + fi * 0.11) + fi * 2.3) * 0.84,
      sin(t * (0.62 + fi * 0.17) + fi * 3.1) * 0.92
    );
    float rad = 0.5 + 0.12 * sin(t + fi * 1.9);
    d = smin(d, sdSphere(p - c, rad), 0.78);
  }
  vec3 mp = vec3((uPointer.x - 0.5) * 2.2, (uPointer.y - 0.5) * 1.9, 0.0) * uPointerActive;
  if (uPointerActive > 0.5) {
    d = smin(d, sdSphere(p - mp, 0.54), 0.75);
  }
  return vec2(d, 1.0);
}`,
    shadeBody: `
    vec3 refl = reflect(rd, n);
    float env = smoothstep(-0.25, 0.75, refl.y) * 0.78 + smoothstep(0.78, 0.98, sin(refl.x * 8.0 + refl.z * 6.0)) * 0.4;
    albedo = mix(vec3(0.28, 0.32, 0.38), vec3(0.98, 0.99, 1.0), env);
    emissive = vec3(0.88, 0.94, 1.0) * fresnel * 0.7;`,
  }),

  helix: buildRaymarchShader({
    baseDist: 3.85,
    maxSteps: 88,
    maxDist: 18.0,
    fogDensity: 0.009,
    glowMatId: 2,
    glowColor: 'vec3(0.28, 0.95, 0.9)',
    glowGain: 0.55,
    mapBody: `
vec2 mapWorld(vec3 p) {
  vec3 q = p;
  q.y += uTime * 0.65;
  float twist = q.y * 1.45;
  vec3 r1 = q;
  r1.xz *= rot2(twist);

  float strandA = length(r1.xz - vec2(0.86, 0.0)) - 0.18;
  float strandB = length(r1.xz + vec2(0.86, 0.0)) - 0.18;
  float strands = min(strandA, strandB);

  float cellY = mod(q.y + 0.27, 0.54) - 0.27;
  vec3 rp = vec3(r1.x, cellY, r1.z);
  float rung = sdCapsule(rp, vec3(-0.82, 0.0, 0.0), vec3(0.82, 0.0, 0.0), 0.078);

  float node = sdSphere(rp, 0.135);

  float bound = abs(p.y) - 3.6;
  vec2 res = vec2(max(strands, bound), 1.0);
  res = opU(res, vec2(max(rung, bound), 2.0));
  return opU(res, vec2(max(node, bound), 3.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      albedo = vec3(0.9, 0.96, 1.0);
      emissive = vec3(0.22, 0.8, 0.84) * (0.25 + fresnel * 0.75);
    } else if (matId == 2.0) {
      albedo = vec3(0.36, 0.95, 0.88);
      emissive = vec3(0.22, 0.9, 0.82) * 0.72;
    } else {
      albedo = vec3(1.0, 0.82, 0.38);
      emissive = vec3(1.0, 0.66, 0.22) * 1.15;
    }`,
  }),

  orrery: buildRaymarchShader({
    baseDist: 4.25,
    maxSteps: 92,
    maxDist: 18.0,
    fogDensity: 0.0045,
    glowMatId: 3,
    glowColor: 'vec3(1.0, 0.78, 0.34)',
    glowGain: 0.68,
    mapBody: `
vec2 mapWorld(vec3 p) {
  float t = uTime;
  float sun = sdSphere(p, 0.56);

  // Substantial machined brass armillary bands readable in ASCII grid
  vec3 r1 = p;
  r1.xy *= rot2(0.28 + t * 0.22);
  float ring1 = max(abs(length(r1.xz) - 1.06) - 0.075, abs(r1.y) - 0.055);

  vec3 r2 = p;
  r2.yz *= rot2(0.58 - t * 0.18);
  r2.xz *= rot2(t * 0.15);
  float ring2 = max(abs(length(r2.xz) - 1.54) - 0.085, abs(r2.y) - 0.065);

  vec3 r3 = p;
  r3.xy *= rot2(-0.62);
  r3.xz *= rot2(-t * 0.12);
  float ring3 = max(abs(length(r3.xz) - 2.04) - 0.095, abs(r3.y) - 0.072) + sin(atan(r3.z, r3.x) * 32.0) * 0.01;

  vec3 rm = p;
  rm.xy *= rot2(PI * 0.5);
  float meridian = sdTorus(rm, vec2(2.32, 0.075));

  // Central meridian axle
  float axle = sdCylinder(p, 2.3, 0.045);

  // Three orbiting planetary globes
  vec3 p1 = vec3(cos(t * 1.1) * 1.06, 0.0, sin(t * 1.1) * 1.06);
  p1.xy *= rot2(-(0.28 + t * 0.22));
  float orb1 = sdSphere(p - p1, 0.17);

  vec3 p2 = vec3(cos(-t * 0.65 + 1.4) * 1.54, 0.0, sin(-t * 0.65 + 1.4) * 1.54);
  p2.xz *= rot2(-t * 0.15);
  p2.yz *= rot2(-(0.58 - t * 0.18));
  float orb2 = sdSphere(p - p2, 0.22);

  vec3 p3 = vec3(cos(t * 0.38 + 2.8) * 2.04, 0.0, sin(t * 0.38 + 2.8) * 2.04);
  p3.xz *= rot2(t * 0.12);
  p3.xy *= rot2(0.62);
  float orb3 = sdSphere(p - p3, 0.26);

  vec2 res = vec2(min(min(ring1, ring2), min(min(ring3, meridian), axle)), 1.0);
  res = opU(res, vec2(min(orb1, min(orb2, orb3)), 2.0));
  return opU(res, vec2(sun, 3.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      albedo = vec3(0.95, 0.78, 0.46);
      emissive = vec3(0.65, 0.44, 0.16) * (0.35 + fresnel * 0.75);
    } else if (matId == 2.0) {
      albedo = vec3(0.88, 0.94, 1.0);
      emissive = vec3(0.62, 0.78, 0.96) * fresnel * 0.55;
    } else {
      albedo = vec3(1.0, 0.92, 0.62);
      emissive = vec3(1.0, 0.76, 0.3) * 1.6;
    }`,
  }),

  poincare: `${SCENE_PREAMBLE}
void main() {
  vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  vec2 z = (vUv - 0.5) * aspect * (2.25 / max(0.45, uZoom));
  float r = length(z);

  if (r >= 0.995) {
    float rim = smoothstep(1.02, 0.995, r) * 0.6;
    fragColor = finishTone(vec3(rim), rim);
    return;
  }

  float t = uTime * 0.32;
  vec2 shift = vec2(cos(t) * 0.28, sin(t * 0.85) * 0.28);
  z *= rot2(uCamera.x * 0.5 + t * 0.15);

  vec2 num = z - shift;
  vec2 den = vec2(1.0 - (shift.x * z.x + shift.y * z.y), -(shift.x * z.y - shift.y * z.x));
  z = vec2(num.x * den.x + num.y * den.y, num.y * den.x - num.x * den.y) / max(dot(den, den), 1e-4);

  float cR = 1.24;
  vec2 cPos = vec2(1.59, 0.0);
  int flips = 0;
  float minEdge = 1e6;

  for (int i = 0; i < 16; i++) {
    float a = atan(z.y, z.x);
    float sec = TAU / 7.0;
    a = abs(mod(a + sec * 0.5, sec) - sec * 0.5);
    z = length(z) * vec2(cos(a), sin(a));
    minEdge = min(minEdge, abs(z.y));

    vec2 dz = z - cPos;
    float d2 = dot(dz, dz);
    minEdge = min(minEdge, abs(sqrt(d2) - cR));
    if (d2 < cR * cR) {
      z = cPos + dz * (cR * cR / max(d2, 1e-4));
      flips++;
    } else {
      break;
    }
  }

  float parity = mod(float(flips), 2.0);
  float line = smoothstep(0.032, 0.005, minEdge);
  float border = smoothstep(0.95, 0.995, r);
  float val = mix(0.22, 0.85, parity) * (1.0 - line * 0.75) + line * 0.95;
  val = mix(val, 1.0, border);

  vec3 col = mix(vec3(0.22, 0.26, 0.34), vec3(0.96, 0.95, 0.92), val);
  col += vec3(0.95, 0.35, 0.18) * line * 0.35;
  fragColor = finishTone(col, clamp(val, 0.0, 1.0));
}
`,
};
