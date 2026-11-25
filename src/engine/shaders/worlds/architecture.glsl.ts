import { buildRaymarchShader } from '../sceneBase.glsl';

export const ARCHITECTURE_SHADERS = {
  citadel: buildRaymarchShader({
    baseDist: 6.9,
    target: 'vec3(0.0, 0.05, 0.0)',
    maxDist: 20.0,
    fogDensity: 0.0075,
    glowMatId: 2,
    glowColor: 'vec3(1.0, 0.62, 0.2)',
    glowGain: 0.62,
    mapBody: `
vec2 mapWorld(vec3 p) {
  float t = uTime;
  vec3 rp = p - vec3(0.0, 0.18 + sin(t * 1.4) * 0.12, 0.0);
  rp.xz *= rot2(t * 0.55);
  rp.xy *= rot2(t * 0.35);
  float relic = max(sdOctahedron(rp, 0.94), -sdBox(rp, vec3(0.46)) * 0.85);
  float innerCore = length(rp) - (0.36 + 0.03 * sin(t * 3.5));
  vec2 res = opU(vec2(relic, 1.0), vec2(innerCore, 2.0));

  vec3 g1 = p - vec3(0.0, 0.18, 0.0);
  g1.xy *= rot2(t * 0.42 + 0.4);
  g1.yz *= rot2(0.55);
  float ring1 = sdTorus(g1, vec2(1.46, 0.072)) + sin(atan(g1.z, g1.x) * 16.0) * 0.014;
  res = opU(res, vec2(ring1, 3.0));

  vec3 g2 = p - vec3(0.0, 0.18, 0.0);
  g2.yz *= rot2(-t * 0.34);
  g2.xz *= rot2(0.7);
  res = opU(res, vec2(sdTorus(g2, vec2(1.94, 0.056)), 2.0));

  float ang = atan(p.z, p.x);
  float sector = TAU / 8.0;
  float a = mod(ang + sector * 0.5, sector) - sector * 0.5;
  float r = length(p.xz);
  vec3 qp = vec3(r * cos(a) - 4.15, p.y, r * sin(a));
  float flute = sin(qp.y * 6.0) * 0.018;
  float pillar = sdBox(qp - vec3(0.0, 0.25, 0.0), vec3(0.22 + flute, 2.35, 0.22 + flute));
  float cap = sdBox(qp - vec3(0.0, -1.72, 0.0), vec3(0.36, 0.14, 0.36));
  res = opU(res, vec2(min(pillar, cap), 4.0));

  float floorY = p.y + 1.82;
  float plinth = sdBox(p - vec3(0.0, -1.56, 0.0), vec3(1.52, 0.16, 1.52));
  float step2 = sdBox(p - vec3(0.0, -1.74, 0.0), vec3(2.25, 0.1, 2.25));
  return opU(res, vec2(min(floorY, min(plinth, step2)), 5.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      albedo = vec3(0.92, 0.98, 1.0);
      emissive = vec3(0.28, 0.82, 0.76) * (0.42 + fresnel * 1.05);
    } else if (matId == 2.0) {
      albedo = vec3(1.0, 0.82, 0.42);
      emissive = vec3(1.0, 0.64, 0.22) * 1.55;
    } else if (matId == 3.0) {
      albedo = vec3(0.95, 0.99, 1.0);
      emissive = vec3(0.28, 0.88, 0.82) * 0.68;
    } else if (matId == 4.0) {
      albedo = vec3(0.42, 0.48, 0.56);
      float band = smoothstep(0.9, 0.99, sin(p.y * 7.0 - uTime * 2.0));
      emissive = vec3(0.22, 0.78, 0.72) * (band * 0.48 + fresnel * 0.26);
    } else {
      albedo = vec3(0.22, 0.27, 0.34);
      float pulse = smoothstep(0.93, 0.995, sin(length(p.xz) * 4.5 - uTime * 2.8));
      float grid = max(smoothstep(0.96, 0.995, abs(sin(p.x * 2.4))), smoothstep(0.96, 0.995, abs(sin(p.z * 2.4))));
      emissive = vec3(0.2, 0.82, 0.76) * (pulse * 0.62 + grid * 0.18);
    }`,
  }),

  cathedral: buildRaymarchShader({
    maxSteps: 92,
    maxDist: 28.0,
    fogDensity: 0.0052,
    fov: 1.42,
    glowMatId: 3,
    glowColor: 'vec3(1.0, 0.74, 0.32)',
    glowGain: 0.62,
    cameraSetup: `
  float zRun = -uTime * 1.35;
  vec3 ro = vec3(sin(uCamera.x) * 1.05, -0.25 + clamp(uCamera.y, -0.5, 0.8) * 1.1, zRun);
  vec3 ta = vec3(sin(uCamera.x) * 0.3, 0.62 + sin(uTime * 0.3) * 0.12, zRun - 5.2);`,
    mapBody: `
vec2 mapWorld(vec3 p) {
  vec3 q = p;
  q.z = mod(p.z, 3.6) - 1.8;
  vec3 sq = vec3(abs(q.x), q.y, q.z);

  vec3 cp = sq - vec3(2.45, 0.6, 0.0);
  float fluting = sin(atan(cp.z, cp.x) * 10.0) * 0.028;
  float col = sdCylinder(cp, 3.8, 0.34 + fluting);
  float base = sdBox(sq - vec3(2.45, -1.6, 0.0), vec3(0.48, 0.32, 0.48));

  vec3 ap = vec3(abs(q.x) + 0.55, q.y - 1.55, q.z);
  float arch = abs(length(ap.xy) - 2.95) - 0.19;
  arch = max(arch, abs(q.z) - 0.22);
  arch = max(arch, -(q.y - 1.25));

  float vault = -(length(vec2(abs(p.x) + 0.45, p.y - 1.35)) - 3.38);
  vault = max(vault, -(p.y - 1.2));
  float walls = 3.58 - abs(p.x);
  float lancet = length(vec2(q.z * 1.45, max(0.0, abs(q.y - 0.55) - 0.95))) - 0.66;
  walls = max(walls, -lancet);

  float floorP = p.y + 1.85;

  vec3 lp = vec3(q.x, q.y - 0.58 - sin(uTime * 1.4 + floor(p.z / 3.6)) * 0.08, q.z);
  float lantern = sdOctahedron(lp, 0.28);
  float chain = sdCylinder(vec3(q.x, q.y - 2.5, q.z), 1.8, 0.03);

  vec2 res = vec2(min(min(col, base), min(arch, min(vault, walls))), 1.0);
  res = opU(res, vec2(floorP, 2.0));
  res = opU(res, vec2(lantern, 3.0));
  return opU(res, vec2(chain, 1.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      float masonry = 0.84 + 0.16 * sin(p.y * 8.0) * sin(p.z * 6.0);
      albedo = vec3(0.76, 0.72, 0.66) * masonry;
      float shaft = smoothstep(2.4, 3.5, abs(p.x)) * smoothstep(-0.6, 1.8, p.y);
      float ribEdge = smoothstep(1.3, 3.2, p.y) * fresnel;
      emissive = vec3(1.0, 0.76, 0.4) * (shaft * 0.48 + ribEdge * 0.52);
    } else if (matId == 2.0) {
      float tile = step(0.0, sin(p.x * 3.14) * sin(p.z * 3.14));
      albedo = mix(vec3(0.24, 0.24, 0.26), vec3(0.62, 0.58, 0.52), tile);
      emissive = vec3(0.95, 0.64, 0.26) * exp(-abs(p.x) * 0.75) * 0.42;
    } else {
      albedo = vec3(1.0, 0.92, 0.68);
      emissive = vec3(1.0, 0.74, 0.28) * 1.75;
    }`,
  }),

  megacity: buildRaymarchShader({
    maxSteps: 96,
    maxDist: 34.0,
    fogDensity: 0.0032,
    fov: 1.45,
    useShadow: false,
    cameraSetup: `
  float zRun = -uTime * 2.1;
  float sway = sin(uTime * 0.35) * 0.8 + sin(uCamera.x) * 1.5;
  vec3 ro = vec3(sway, 3.4 + clamp(uCamera.y, -0.6, 0.9) * 2.4, zRun);
  vec3 ta = vec3(sway * 0.45, 2.0, zRun - 7.0);`,
    mapBody: `
vec2 mapWorld(vec3 p) {
  float cell = 3.2;
  vec2 id = floor(p.xz / cell);
  vec2 qz = mod(p.xz, cell) - cell * 0.5;

  float avenue = step(0.5, abs(id.x));
  float h = hash21(id) * 6.8 + 2.0;
  float w = 0.94 + hash21(id + 31.7) * 0.38;

  vec3 bp = vec3(qz.x, p.y - h * 0.5 + 2.0, qz.y);
  float tower = sdBox(bp, vec3(w, h * 0.5, w));
  float notch = sdBox(vec3(qz.x, mod(p.y, 0.55) - 0.275, qz.y), vec3(w + 0.05, 0.12, w + 0.05));
  tower = max(tower, -notch * 0.48);
  tower = mix(9.0, tower, avenue);

  vec3 sp = vec3(p.x, p.y - 2.6, mod(p.z, 9.6) - 4.8);
  float bridge = sdBox(sp, vec3(2.8, 0.18, 0.44));

  float spire = sdCylinder(vec3(qz.x, p.y - (h - 1.6), qz.y), 0.85, 0.05);
  spire = mix(9.0, spire, avenue * step(0.62, hash21(id + 9.2)));

  float ground = p.y + 2.0;
  vec2 res = vec2(min(tower, ground), 1.0);
  res = opU(res, vec2(bridge, 2.0));
  return opU(res, vec2(spire, 3.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      albedo = vec3(0.42, 0.48, 0.56);
      vec2 winGrid = fract(vec2(p.x + p.z, p.y) * vec2(2.4, 1.8));
      float winMask = step(0.18, winGrid.x) * step(winGrid.x, 0.82) * step(0.22, winGrid.y) * step(winGrid.y, 0.78);
      float lit = step(0.56, hash21(floor(vec2(p.x + p.z, p.y) * vec2(2.4, 1.8))));
      emissive = vec3(0.38, 0.94, 0.88) * winMask * lit * 1.05 * smoothstep(-1.8, -0.4, p.y);
      emissive += vec3(0.22, 0.72, 0.85) * fresnel * 0.24;
    } else if (matId == 2.0) {
      albedo = vec3(0.76, 0.82, 0.88);
      float pulse = smoothstep(0.78, 0.99, sin(p.x * 4.0 + uTime * 3.0));
      emissive = vec3(1.0, 0.66, 0.24) * (0.25 + pulse * 0.95);
    } else {
      albedo = vec3(0.98, 0.98, 1.0);
      float blink = 0.5 + 0.5 * sin(uTime * 5.0 + p.z);
      emissive = vec3(1.0, 0.34, 0.22) * blink * 1.6;
    }`,
  }),

  torii: buildRaymarchShader({
    baseDist: 5.8,
    target: 'vec3(0.0, 0.65, 0.0)',
    maxDist: 28.0,
    fogDensity: 0.0032,
    mapBody: `
vec2 mapWorld(vec3 p) {
  vec3 sym = vec3(abs(p.x), p.y, p.z);

  vec3 colP = sym - vec3(1.38 - p.y * 0.04, 0.65, 0.0);
  float col = sdCylinder(colP, 1.82, 0.165);
  float base = sdCylinder(sym - vec3(1.45, -0.95, 0.0), 0.24, 0.23);

  float curve = pow(abs(p.x) * 0.35, 2.2) * 0.38;
  float kasagi = sdBox(p - vec3(0.0, 2.42 + curve, 0.0), vec3(2.35, 0.15, 0.21));
  float shimaki = sdBox(p - vec3(0.0, 2.26 + curve * 0.75, 0.0), vec3(2.12, 0.09, 0.16));

  float nuki = sdBox(p - vec3(0.0, 1.78, 0.0), vec3(1.94, 0.11, 0.12));
  float tablet = sdBox(p - vec3(0.0, 2.04, 0.0), vec3(0.26, 0.3, 0.1));
  float gate = min(min(col, base), min(min(kasagi, shimaki), min(nuki, tablet)));

  // Calm rippled mirror lake
  float dist0 = length(p.xz);
  float rip = sin(dist0 * 6.5 - uTime * 2.0) * 0.02 / (1.0 + dist0 * 0.32);
  rip += sin(p.x * 2.4 + p.z * 3.1 - uTime * 1.4) * 0.012;
  float lake = p.y + 1.05 - rip;

  // Distant layered mountain silhouette behind shrine
  float ridgeH = fbm2(p.xz * 0.24 + vec2(2.3, 0.0)) * 3.2 - 1.35;
  float mountains = max(p.y - ridgeH, -(p.z + 6.5)) * 0.65;

  // Crescent halo ring framing upper sky above lintel
  vec3 hp = p - vec3(0.0, 2.55, -7.2);
  hp.xy *= rot2(0.0);
  float halo = sdTorus(hp.xzy, vec2(1.42, 0.09));

  vec2 res = vec2(gate, 1.0);
  res = opU(res, vec2(lake, 2.0));
  res = opU(res, vec2(mountains, 3.0));
  return opU(res, vec2(halo, 4.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      // High-contrast woodblock ink silhouette for Torii timbers
      albedo = vec3(1.0, 0.92, 0.86);
      emissive = vec3(0.72, 0.65, 0.58) * (0.45 + fresnel * 0.65);
    } else if (matId == 2.0) {
      // Mirror reflection of Torii posts & horizontal ripple ink bands
      float postRefl = exp(-abs(abs(p.x) - 1.42) * 3.2) * smoothstep(-0.2, 3.2, p.z);
      float barRefl = exp(-abs(p.z - 2.3) * 2.2) * smoothstep(2.4, 0.0, abs(p.x));
      float waveLines = smoothstep(0.45, 0.95, sin(p.z * 11.0 - uTime * 2.2 + sin(p.x * 3.0) * 0.7));
      float ink = clamp(postRefl * 0.85 + barRefl * 0.65 + waveLines * 0.26, 0.0, 1.0);
      albedo = vec3(0.28, 0.3, 0.34) * (0.4 + ink);
      emissive = vec3(0.88, 0.88, 0.9) * ink * 0.65;
    } else if (matId == 3.0) {
      albedo = vec3(0.42, 0.44, 0.48);
    } else {
      albedo = vec3(1.0, 0.95, 0.88);
      emissive = vec3(1.0, 0.85, 0.72) * 0.9;
    }`,
  }),

  escher: buildRaymarchShader({
    baseDist: 5.7,
    maxDist: 20.0,
    fogDensity: 0.007,
    stepScale: 0.78,
    mapBody: `
vec2 mapWorld(vec3 p) {
  vec3 q = p;
  q.xz *= rot2(p.y * 0.42 + uTime * 0.22);

  float core = sdCylinder(q, 5.0, 0.54);

  float a = atan(q.z, q.x);
  float r = length(q.xz);
  float stepAng = TAU / 14.0;
  float sa = mod(a + stepAng * 0.5, stepAng) - stepAng * 0.5;
  float yWrap = mod(p.y - a / TAU * 2.2, 2.2) - 1.1;
  vec3 sp = vec3(r * cos(sa) - 1.32, yWrap, r * sin(sa));
  float stairs = sdBox(sp, vec3(0.82, 0.14, 0.28));

  vec3 fp = abs(p);
  fp.xy *= rot2(uTime * 0.16);
  float frameA = max(sdBox(fp, vec3(2.25)), -sdBox(fp, vec3(1.86, 1.86, 3.0)));
  frameA = max(frameA, -sdBox(fp, vec3(3.0, 1.86, 1.86)));
  frameA = max(frameA, -sdBox(fp, vec3(1.86, 3.0, 1.86)));

  vec3 op = p - vec3(0.0, sin(uTime * 1.5) * 0.24, 0.0);
  op.xz *= rot2(-uTime * 0.6);
  float orb = sdOctahedron(op - vec3(1.25, 0.52, 0.0), 0.38);

  vec2 res = opU(vec2(min(core, stairs), 1.0), vec2(frameA, 2.0));
  return opU(res, vec2(orb, 3.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      float chk = step(0.0, sin(p.x * 4.5) * sin(p.y * 4.5) * sin(p.z * 4.5));
      albedo = mix(vec3(0.45, 0.48, 0.52), vec3(1.0, 0.98, 0.94), chk);
      emissive = vec3(0.42) * fresnel;
    } else if (matId == 2.0) {
      albedo = vec3(0.82, 0.85, 0.9);
      emissive = vec3(0.35) * fresnel;
    } else {
      albedo = vec3(1.0, 0.62, 0.22);
      emissive = vec3(0.98, 0.45, 0.16) * 1.05;
    }`,
  }),

  pantheon: buildRaymarchShader({
    baseDist: 3.35,
    target: 'vec3(0.0, 1.4, 0.0)',
    maxDist: 18.0,
    fogDensity: 0.0055,
    fov: 1.32,
    glowMatId: 3,
    glowColor: 'vec3(1.0, 0.88, 0.62)',
    glowGain: 0.72,
    mapBody: `
vec2 mapWorld(vec3 p) {
  float r = length(p);
  float dome = -(r - 4.4);

  // Deep coffered dome ribs
  float theta = atan(p.z, p.x);
  float phi = acos(clamp(p.y / max(r, 0.001), -1.0, 1.0));
  float ribA = abs(sin(theta * 12.0));
  float ribB = abs(sin(phi * 9.0));
  float coffer = smoothstep(0.16, 0.32, min(ribA, ribB)) * 0.22 * step(0.3, phi) * step(phi, 1.48);
  dome += coffer;

  // Open sky oculus ring
  float oculusCut = length(p.xz) - 1.1;
  dome = max(dome, -max(-oculusCut, -(p.y - 3.55)));
  float oculusRim = sdTorus(p - vec3(0.0, 4.18, 0.0), vec2(1.12, 0.1));

  float floorP = p.y + 1.85;
  float plinth = sdCylinder(p - vec3(0.0, -1.68, 0.0), 0.18, 1.55);
  float drum = -(length(p.xz) - 4.35);
  float shell = max(min(dome, drum), p.y - 4.42);
  shell = min(shell, min(floorP, oculusRim));

  // Soft volumetric light column traced via glowMatId without hard solid silhouette
  vec3 bp = p - vec3(sin(uTime * 0.28) * 0.55, 1.1, cos(uTime * 0.28) * 0.55);
  bp.xy *= rot2(0.24);
  float beam = length(bp.xz) - (0.68 + (3.2 - bp.y) * 0.15);
  beam = max(beam, abs(p.y - 1.1) - 3.0);

  vec2 res = vec2(shell, 1.0);
  res = opU(res, vec2(plinth, 2.0));
  return opU(res, vec2(max(beam, 0.12), 3.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      float theta = atan(p.z, p.x);
      float phi = acos(clamp(p.y / max(length(p), 0.001), -1.0, 1.0));
      float ribHi = 1.0 - smoothstep(0.14, 0.3, min(abs(sin(theta * 12.0)), abs(sin(phi * 9.0))));
      albedo = vec3(0.74, 0.7, 0.64) + ribHi * 0.22;
      emissive = vec3(0.95, 0.76, 0.45) * (ribHi * 0.26 * smoothstep(0.2, 3.8, p.y) + smoothstep(3.6, 4.25, p.y) * 0.65);
    } else if (matId == 2.0) {
      albedo = vec3(0.94, 0.88, 0.78);
      emissive = vec3(1.0, 0.82, 0.48) * exp(-length(p.xz) * 0.72) * 0.75;
    } else {
      albedo = vec3(1.0, 0.92, 0.72);
      emissive = vec3(1.0, 0.85, 0.52) * 0.9;
    }`,
  }),
};
