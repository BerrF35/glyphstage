import { buildRaymarchShader } from '../sceneBase.glsl';

export const DUNGEON_SHADERS = {
  brogue: buildRaymarchShader({
    maxSteps: 92,
    maxDist: 26.0,
    fogDensity: 0.007,
    fov: 1.42,
    glowMatId: 3,
    glowColor: 'vec3(1.0, 0.62, 0.18)',
    glowGain: 0.72,
    cameraSetup: `
  float zRun = -uTime * 0.92;
  vec3 ro = vec3(sin(uCamera.x) * 0.85, -0.15 + clamp(uCamera.y, -0.4, 0.6) * 0.8, zRun);
  vec3 ta = vec3(sin(uCamera.x) * 0.25, 0.12, zRun - 4.8);`,
    mapBody: `
vec2 mapWorld(vec3 p) {
  vec3 q = p;
  q.z = mod(p.z, 4.0) - 2.0;
  vec3 sq = vec3(abs(q.x), q.y, q.z);

  // Hewn stone dungeon corridor walls & vaulted ceiling
  float walls = 2.65 - abs(p.x);
  float ceilVault = -(length(vec2(p.x, p.y - 0.55)) - 2.75);
  float shell = max(walls, ceilVault);
  float brick = sin(p.y * 7.0) * sin(p.z * 3.5) * 0.03;
  shell += brick;

  // Heavy archway pilasters every 4 units
  float pilaster = sdBox(sq - vec3(2.25, 0.35, 0.0), vec3(0.45, 2.2, 0.32));
  float archRib = max(abs(length(vec2(q.x, q.y - 0.55)) - 2.38) - 0.22, abs(q.z) - 0.26);
  archRib = max(archRib, -(q.y - 0.45));

  // Flooded flagstone dungeon floor with subtle ripples
  float floorP = p.y + 1.48 - sin(p.x * 4.0 + p.z * 3.0 - uTime * 2.0) * 0.015;

  // Wall-mounted torch sconces flickering warmly
  vec3 tp = sq - vec3(1.88, 0.42, 0.0);
  float flame = sdSphere(tp - vec3(0.0, 0.18 + sin(uTime * 9.0 + floor(p.z / 4.0)) * 0.04, 0.0), 0.18);
  float bracket = sdBox(tp - vec3(0.14, -0.1, 0.0), vec3(0.18, 0.16, 0.08));

  vec2 res = vec2(min(min(shell, pilaster), min(archRib, bracket)), 1.0);
  res = opU(res, vec2(floorP, 2.0));
  return opU(res, vec2(flame, 3.0));
}`,
    shadeBody: `
    vec3 qz = vec3(abs(p.x), p.y, mod(p.z, 4.0) - 2.0);
    float dTorch = length(qz - vec3(1.88, 0.6, 0.0));
    float flicker = 0.86 + 0.14 * sin(uTime * 11.0 + floor(p.z / 4.0) * 3.1);
    float torchLight = (1.6 / (0.35 + dTorch * dTorch)) * flicker;

    if (matId == 1.0) {
      float stone = 0.72 + 0.28 * noise3(p * 3.2);
      albedo = vec3(0.54, 0.48, 0.42) * stone;
      emissive = vec3(1.0, 0.58, 0.2) * torchLight * 0.42;
    } else if (matId == 2.0) {
      // Brogue-style toxic emerald swamp miasma drifting over wet flagstones
      float gas = fbm2(p.xz * 0.65 + vec2(uTime * 0.35, -uTime * 0.22));
      float pool = smoothstep(0.45, 0.85, gas);
      albedo = mix(vec3(0.24, 0.26, 0.3), vec3(0.18, 0.82, 0.52), pool);
      emissive = vec3(1.0, 0.6, 0.2) * torchLight * 0.28 + vec3(0.16, 0.92, 0.52) * pool * 0.55;
    } else {
      albedo = vec3(1.0, 0.92, 0.62);
      emissive = vec3(1.0, 0.68, 0.22) * 1.9 * flicker;
    }`,
  }),

  ziggurat: buildRaymarchShader({
    baseDist: 6.4,
    target: 'vec3(0.0, 0.55, 0.0)',
    maxSteps: 92,
    maxDist: 28.0,
    fogDensity: 0.004,
    glowMatId: 3,
    glowColor: 'vec3(1.0, 0.72, 0.28)',
    glowGain: 0.58,
    mapBody: `
vec2 mapWorld(vec3 p) {
  // Colossal 6-tier stepped obsidian ziggurat
  float y = p.y + 1.5;
  float tier = clamp(floor(y * 2.2), 0.0, 5.0);
  float halfW = 2.55 - tier * 0.36;
  float zig = sdBox(p - vec3(0.0, (tier + 0.5) / 2.2 - 1.5, 0.0), vec3(halfW, 0.23, halfW));
  // Grand central temple stair ramp ascending the front face
  vec3 sp = p - vec3(0.0, -0.25, 1.35);
  sp.yz *= rot2(-0.56);
  float ramp = sdBox(sp, vec3(0.42, 0.16, 1.65));
  float sanctuary = sdBox(p - vec3(0.0, 1.48, 0.0), vec3(0.46, 0.35, 0.46));
  float temple = min(min(zig, ramp), sanctuary);

  // Wind-rippled desert dunes
  float dunes = p.y + 1.48 - sin(p.x * 1.4 + sin(p.z * 0.9) * 1.2) * 0.14 - fbm2(p.xz * 0.45) * 0.24;

  // Eclipsing radiant solar halo hovering directly above sanctuary
  vec3 ep = p - vec3(0.0, 2.72, -1.6);
  float eclipseRing = sdTorus(ep.xzy, vec2(1.02, 0.085));
  float eclipseCore = sdSphere(ep, 0.86);

  vec2 res = vec2(temple, 1.0);
  res = opU(res, vec2(dunes, 2.0));
  res = opU(res, vec2(eclipseRing, 3.0));
  return opU(res, vec2(eclipseCore, 4.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      float course = 0.82 + 0.18 * sin(p.y * 18.0);
      albedo = vec3(0.76, 0.66, 0.54) * course;
      emissive = vec3(1.0, 0.68, 0.28) * fresnel * 0.45;
    } else if (matId == 2.0) {
      float ripples = 0.5 + 0.5 * sin(p.x * 9.0 + p.z * 5.0);
      albedo = vec3(0.55, 0.46, 0.36) * (0.75 + 0.25 * ripples);
    } else if (matId == 3.0) {
      albedo = vec3(1.0, 0.92, 0.66);
      emissive = vec3(1.0, 0.72, 0.26) * 1.7;
    } else {
      // Pitch-black eclipsing moon disk for dramatic halo silhouette
      albedo = vec3(0.02);
      emissive = vec3(0.0);
    }`,
  }),

  monolith: buildRaymarchShader({
    baseDist: 5.1,
    target: 'vec3(0.0, 0.35, 0.0)',
    maxSteps: 90,
    maxDist: 28.0,
    fogDensity: 0.0045,
    mapBody: `
vec2 mapWorld(vec3 p) {
  // Stark 1:4:9 obsidian monolith floating slightly above cratered lunar plain
  vec3 mp = p - vec3(0.0, 0.65 + sin(uTime * 0.9) * 0.08, 0.0);
  mp.xz *= rot2(0.18);
  float slab = sdBox(mp, vec3(0.24, 1.38, 0.68)) - 0.015;

  // Cratered lunar horizon terrain
  vec2 uv = p.xz * 0.42;
  vec2 v = voronoi2(uv * 0.65);
  float crater = smoothstep(0.18, 0.52, v.x) * 0.42;
  float h = fbm2(uv) * 0.85 - 1.55 + crater;
  float ground = (p.y - h) * 0.65;

  // Giant crescent planet looming behind the monolith
  float planet = sdSphere(p - vec3(-1.85, 2.35, -8.5), 2.35);

  vec2 res = vec2(slab, 1.0);
  res = opU(res, vec2(ground, 2.0));
  return opU(res, vec2(planet, 3.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      albedo = vec3(0.12, 0.14, 0.18);
      // Razor-bright rim edge outline along the 1:4:9 monolith bevels
      float edge = smoothstep(0.45, 0.98, fresnel);
      emissive = vec3(0.92, 0.98, 1.0) * (edge * 1.35 + spec * 1.2);
    } else if (matId == 2.0) {
      albedo = vec3(0.56, 0.6, 0.66);
      float ring = exp(-abs(length(p.xz) - 1.65) * 4.5);
      emissive = vec3(0.28, 0.82, 0.78) * ring * 0.35;
    } else {
      float bands = 0.6 + 0.4 * sin(p.y * 4.5);
      albedo = vec3(0.84, 0.88, 0.94) * bands;
      emissive = vec3(0.75, 0.86, 0.96) * fresnel * 0.75;
    }`,
  }),

  crypt: buildRaymarchShader({
    baseDist: 5.5,
    target: 'vec3(0.0, 0.25, 0.0)',
    maxSteps: 92,
    maxDist: 22.0,
    fogDensity: 0.0085,
    glowMatId: 3,
    glowColor: 'vec3(1.0, 0.28, 0.24)',
    glowGain: 0.68,
    mapBody: `
vec2 mapWorld(vec3 p) {
  float t = uTime;
  // Levitating faceted reliquary shard above runic altar
  vec3 rp = p - vec3(0.0, 0.62 + sin(t * 1.6) * 0.14, 0.0);
  rp.xz *= rot2(t * 0.62);
  float shard = sdOctahedron(vec3(rp.x * 1.35, rp.y * 0.75, rp.z * 1.35), 0.72) * 0.75;

  // Stepped gothic altar pedestal
  float altar = min(
    sdBox(p - vec3(0.0, -1.05, 0.0), vec3(0.88, 0.42, 0.88)),
    sdBox(p - vec3(0.0, -1.52, 0.0), vec3(1.42, 0.18, 1.42))
  );

  // Encircling vaulted wrought-iron crypt arches (6 bays)
  float ang = atan(p.z, p.x);
  float sec = TAU / 6.0;
  float a = mod(ang + sec * 0.5, sec) - sec * 0.5;
  float r = length(p.xz);
  vec3 qp = vec3(r * cos(a) - 3.35, p.y, r * sin(a));
  float col = sdCylinder(qp - vec3(0.0, 0.45, 0.0), 2.35, 0.22);
  float ironBars = sdCylinder(vec3(qp.x, qp.y - 0.45, mod(qp.z + 0.22, 0.44) - 0.22), 2.1, 0.045);
  ironBars = max(ironBars, abs(qp.z) - 0.75);
  float cryptWall = min(col, ironBars);

  // 3 orbiting spectral wisps
  float wisps = 1e6;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float wa = t * 0.9 + fi * TAU / 3.0;
    vec3 wp = vec3(cos(wa) * 1.65, 0.4 + sin(t * 2.0 + fi * 2.1) * 0.45, sin(wa) * 1.65);
    wisps = min(wisps, sdSphere(p - wp, 0.16));
  }

  float floorP = p.y + 1.68;
  vec2 res = vec2(min(altar, min(cryptWall, floorP)), 1.0);
  res = opU(res, vec2(shard, 2.0));
  return opU(res, vec2(wisps, 3.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      albedo = vec3(0.46, 0.44, 0.48);
      float rune = smoothstep(0.92, 0.99, sin(length(p.xz) * 6.0 - uTime * 2.2)) * step(p.y, -1.55);
      emissive = vec3(0.98, 0.26, 0.22) * (rune * 0.85 + fresnel * 0.28);
    } else if (matId == 2.0) {
      albedo = vec3(1.0, 0.88, 0.84);
      emissive = vec3(1.0, 0.4, 0.28) * (0.95 + fresnel * 1.15);
    } else {
      albedo = vec3(1.0, 0.94, 0.88);
      emissive = vec3(1.0, 0.42, 0.26) * 2.2;
    }`,
  }),

  reef: buildRaymarchShader({
    baseDist: 5.2,
    target: 'vec3(0.0, -0.1, 0.0)',
    maxSteps: 92,
    maxDist: 22.0,
    fogDensity: 0.0085,
    mapBody: `
vec2 mapWorld(vec3 p) {
  float t = uTime;
  // Natural sculpted reef arch bridging the center frame
  vec3 ap = p - vec3(0.0, -0.35, 0.0);
  float arch = abs(length(vec2(ap.x * 0.85, ap.y)) - 1.65) - 0.38;
  arch = max(arch, abs(ap.z) - 0.65);
  arch += fbm3(p * 1.9) * 0.22;

  // Seabed with terraced coral domes
  float domes = smoothstep(0.25, 0.85, sin(p.x * 1.3) * cos(p.z * 1.3)) * 0.55;
  float seabed = (p.y + 1.35 - fbm2(p.xz * 0.65) * 0.55 - domes) * 0.68;

  // Swaying underwater kelp fronds rising from flanks
  float kx = abs(p.x) - 2.35;
  float sway = sin(p.y * 2.2 - t * 1.8 + p.z) * 0.22;
  vec3 kp = vec3(kx - sway, p.y, mod(p.z + 0.8, 1.6) - 0.8);
  float kelp = sdCapsule(kp, vec3(0.0, -1.5, 0.0), vec3(0.0, 1.45, 0.0), 0.08 + 0.03 * sin(p.y * 9.0));

  vec2 res = vec2(smin(arch, seabed, 0.45), 1.0);
  return opU(res, vec2(kelp, 2.0));
}`,
    shadeBody: `
    // Animated volumetric underwater caustic lattice projected from surface
    vec2 cUv = p.xz * 0.95 + vec2(uTime * 0.22, -uTime * 0.16);
    float c1 = voronoi2(cUv).y;
    float c2 = voronoi2(cUv * 1.35 - uTime * 0.14).y;
    float caustic = pow(clamp(1.0 - min(c1, c2) * 2.4, 0.0, 1.0), 2.5) * smoothstep(-0.2, 0.9, n.y);

    if (matId == 1.0) {
      albedo = mix(vec3(0.14, 0.48, 0.56), vec3(0.88, 0.72, 0.54), smoothstep(-0.8, 0.9, p.y));
      emissive = vec3(0.24, 0.96, 0.92) * (caustic * 1.25 + fresnel * 0.35);
    } else {
      albedo = vec3(0.18, 0.76, 0.54);
      emissive = vec3(0.28, 0.96, 0.72) * (caustic * 0.8 + fresnel * 0.45);
    }`,
  }),

  fortress: buildRaymarchShader({
    baseDist: 4.15,
    target: 'vec3(0.0, 0.0, 0.0)',
    maxSteps: 92,
    maxDist: 18.0,
    fogDensity: 0.007,
    glowMatId: 3,
    glowColor: 'vec3(1.0, 0.54, 0.16)',
    glowGain: 0.55,
    mapBody: `
float sdGear(vec3 p, float radius, float thick, float teeth, float rotAng) {
  p.xy *= rot2(rotAng);
  float r = length(p.xy);
  float a = atan(p.y, p.x);
  float tooth = clamp(sin(a * teeth) * 3.0, -1.0, 1.0) * 0.12;
  float outer = max(r - (radius + tooth), abs(p.z) - thick);
  float hubHole = -(r - radius * 0.26);
  float spokeAng = abs(sin(a * 3.0));
  float cutouts = max(max(r - radius * 0.74, -(r - radius * 0.42)), spokeAng - 0.35);
  float body = max(outer, hubHole);
  return max(body, -cutouts);
}

vec2 mapWorld(vec3 p) {
  float t = uTime;
  // Three meshing cycloid brass gears rotating in exact opposite gear ratios
  float g1 = sdGear(p - vec3(-0.78, 0.15, 0.0), 1.15, 0.18, 12.0, t * 0.6);
  float g2 = sdGear(p - vec3(1.16, 0.15, 0.0), 0.78, 0.18, 8.0, -t * 0.9 + 0.38);
  float g3 = sdGear(p - vec3(-0.1, -1.45, -0.32), 0.92, 0.18, 10.0, -t * 0.72);

  // Heavy industrial machine axle shafts
  float ax1 = sdCylinder((p - vec3(-0.78, 0.15, 0.0)).xzy, 1.35, 0.22);
  float ax2 = sdCylinder((p - vec3(1.16, 0.15, 0.0)).xzy, 1.35, 0.18);

  // Glowing furnace core rod in background
  float core = sdCylinder(p - vec3(0.0, 0.0, -1.55), 3.0, 0.28 + 0.04 * sin(p.y * 5.0 - t * 4.0));

  vec2 res = vec2(min(g1, min(g2, g3)), 1.0);
  res = opU(res, vec2(min(ax1, ax2), 2.0));
  return opU(res, vec2(core, 3.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      albedo = vec3(0.94, 0.74, 0.42);
      emissive = vec3(0.95, 0.56, 0.18) * (fresnel * 0.55 + spec * 0.45);
    } else if (matId == 2.0) {
      albedo = vec3(0.62, 0.66, 0.72);
    } else {
      albedo = vec3(1.0, 0.85, 0.5);
      emissive = vec3(1.0, 0.52, 0.14) * 1.45;
    }`,
  }),
};
