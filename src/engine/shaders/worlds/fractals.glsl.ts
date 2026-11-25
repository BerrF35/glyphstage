import { buildRaymarchShader } from '../sceneBase.glsl';

export const FRACTAL_SHADERS = {
  mandelbulb: buildRaymarchShader({
    baseDist: 2.55,
    maxSteps: 84,
    maxDist: 10.0,
    fogDensity: 0.01,
    useShadow: false,
    mapBody: `
vec2 mapWorld(vec3 pos) {
  vec3 z = pos;
  float dr = 1.0;
  float r = 0.0;
  float trap = 1e6;
  float power = 8.0 + sin(uTime * 0.25) * 0.65;

  for (int i = 0; i < 8; i++) {
    r = length(z);
    if (r > 2.2) break;
    float theta = acos(clamp(z.z / max(r, 1e-5), -1.0, 1.0));
    float phi = atan(z.y, z.x);
    dr = pow(r, power - 1.0) * power * dr + 1.0;

    float zr = pow(r, power);
    theta *= power;
    phi *= power;

    z = zr * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)) + pos;
    trap = min(trap, length(z.xz));
  }
  return vec2(0.5 * log(max(r, 1e-5)) * r / dr, clamp(trap, 0.0, 1.0));
}`,
    shadeBody: `
    albedo = mix(vec3(1.0, 0.72, 0.3), vec3(0.32, 0.86, 0.92), matId);
    emissive = vec3(1.0, 0.58, 0.2) * pow(1.0 - matId, 2.0) * 0.65 + vec3(0.95, 0.82, 0.55) * fresnel * 0.35;`,
  }),

  apollonian: buildRaymarchShader({
    baseDist: 3.35,
    maxSteps: 92,
    maxDist: 14.0,
    fogDensity: 0.014,
    stepScale: 0.78,
    useShadow: false,
    mapBody: `
vec2 mapWorld(vec3 p) {
  vec3 q = p;
  q.z -= uTime * 0.26;
  float s = 1.0;
  float trap = 1e6;
  float kScale = 1.24 + 0.07 * sin(uTime * 0.4);

  for (int i = 0; i < 7; i++) {
    q = -1.0 + 2.0 * fract(0.5 * q + 0.5);
    float r2 = dot(q, q);
    float k = kScale / max(r2, 0.14);
    q *= k;
    s *= k;
    trap = min(trap, r2);
  }
  // True 3D nested sphere gasket foam (no flat y=0 cut plane)
  float d = (length(q) - 0.82) / s;
  float outer = length(p) - 2.35;
  float cavity = -(length(p) - 0.55);
  return vec2(max(max(d, outer), cavity), clamp(trap * 1.45, 0.0, 1.0));
}`,
    shadeBody: `
    albedo = mix(vec3(0.28, 0.66, 0.88), vec3(0.96, 0.98, 1.0), matId);
    emissive = vec3(0.24, 0.82, 0.92) * fresnel * 0.68;`,
  }),

  menger: buildRaymarchShader({
    baseDist: 3.9,
    maxSteps: 92,
    maxDist: 18.0,
    fogDensity: 0.009,
    fov: 1.55,
    glowMatId: 2,
    glowColor: 'vec3(0.32, 0.88, 1.0)',
    glowGain: 0.52,
    mapBody: `
vec2 mapWorld(vec3 p) {
  vec3 q = p;
  q.xz *= rot2(uTime * 0.22);
  q.xy *= rot2(0.18 * sin(uTime * 0.35));
  float d = sdBox(q, vec3(1.38));
  float s = 1.0 / 1.38;
  float trap = 0.0;

  for (int m = 0; m < 4; m++) {
    vec3 a = mod(q * s + 1.0, 2.0) - 1.0;
    s *= 3.0;
    vec3 r = abs(1.0 - 3.0 * abs(a));
    float da = max(r.x, r.y);
    float db = max(r.y, r.z);
    float dc = max(r.z, r.x);
    float c = (min(da, min(db, dc)) - 1.0) / s;
    if (-c > d) {
      d = -c;
      trap = float(m + 1) / 4.0;
    }
  }

  float core = sdOctahedron(q, 0.38);
  return opU(vec2(d, trap), vec2(core, 2.0));
}`,
    shadeBody: `
    if (matId > 1.5) {
      albedo = vec3(0.95, 0.99, 1.0);
      emissive = vec3(0.38, 0.92, 1.0) * 1.65;
    } else {
      albedo = mix(vec3(0.32, 0.54, 0.82), vec3(0.96, 0.98, 1.0), matId);
      emissive = vec3(0.32, 0.88, 1.0) * (fresnel * 0.65 + smoothstep(0.6, 1.0, matId) * 0.22);
    }`,
  }),

  julia4d: buildRaymarchShader({
    baseDist: 2.15,
    maxSteps: 86,
    maxDist: 9.0,
    fogDensity: 0.012,
    stepScale: 0.72,
    useShadow: false,
    mapBody: `
vec4 qMul(vec4 a, vec4 b) {
  return vec4(
    a.x * b.x - dot(a.yzw, b.yzw),
    a.x * b.yzw + b.x * a.yzw + cross(a.yzw, b.yzw)
  );
}

vec2 mapWorld(vec3 p) {
  float t = uTime * 0.35;
  vec4 c = vec4(-0.42 + 0.14 * cos(t), 0.56 + 0.12 * sin(t * 1.1), 0.16 * sin(t * 0.7), 0.12 * cos(t * 0.9));
  vec4 z = vec4(p, 0.18 * sin(t * 0.6));
  vec4 dz = vec4(1.0, 0.0, 0.0, 0.0);
  float trap = 1e6;

  for (int i = 0; i < 11; i++) {
    float r2 = dot(z, z);
    if (r2 > 16.0) break;
    dz = 2.0 * qMul(z, dz);
    z = qMul(z, z) + c;
    trap = min(trap, r2);
  }
  float rz = length(z);
  float rdz = max(length(dz), 1e-5);
  return vec2(0.5 * rz * log(max(rz, 1.0001)) / rdz, clamp(trap, 0.0, 1.0));
}`,
    shadeBody: `
    albedo = mix(vec3(1.0, 0.44, 0.54), vec3(0.42, 0.94, 0.98), matId);
    emissive = vec3(1.0, 0.72, 0.32) * (fresnel * 0.72 + (1.0 - matId) * 0.25);`,
  }),

  kaliland: buildRaymarchShader({
    maxSteps: 92,
    maxDist: 26.0,
    fogDensity: 0.0085,
    stepScale: 0.72,
    fov: 1.48,
    useShadow: false,
    cameraSetup: `
  float zRun = -uTime * 1.15;
  float cx = sin(zRun * 0.22) * 0.55;
  vec3 ro = vec3(cx + sin(uCamera.x) * 0.75, 0.72 + clamp(uCamera.y, -0.4, 0.7) * 0.85, zRun);
  vec3 ta = vec3(sin((zRun - 4.5) * 0.22) * 0.55, 0.35, zRun - 4.5);`,
    mapBody: `
vec2 mapWorld(vec3 p) {
  vec3 q = p;
  q.xz = mod(q.xz + 2.8, 5.6) - 2.8;
  float s = 1.0;
  float trap = 1e6;

  for (int i = 0; i < 7; i++) {
    q = abs(q) - vec3(0.82, 0.96, 0.82);
    q.xz *= rot2(0.52);
    q.xy *= rot2(0.3);
    float r2 = clamp(dot(q, q), 0.24, 1.65);
    float k = 1.42 / r2;
    q *= k;
    s *= k;
    trap = min(trap, length(q.xy));
  }

  float fractal = sdBox(q, vec3(0.68, 1.15, 0.68)) / s;
  float skyCut = p.y - 1.65;
  float pathX = p.x - sin(p.z * 0.22) * 0.65;
  float gorge = -(abs(pathX) - (1.18 + max(0.0, p.y + 0.5) * 0.35));
  float cliffs = max(max(fractal, skyCut), gorge);
  float river = p.y + 0.92;
  return opU(vec2(cliffs, clamp(trap * 0.65, 0.0, 1.0)), vec2(river, 2.0));
}`,
    shadeBody: `
    if (matId > 1.5) {
      float flow = 0.5 + 0.5 * sin(p.z * 6.0 + uTime * 3.0 + sin(p.x * 4.0));
      albedo = vec3(0.14, 0.36, 0.42);
      emissive = vec3(0.24, 0.96, 0.84) * exp(-abs(p.x - sin(p.z * 0.22) * 0.65) * 1.4) * flow * 0.85;
    } else {
      albedo = mix(vec3(0.2, 0.72, 0.66), vec3(1.0, 0.78, 0.36), matId);
      float vein = smoothstep(0.22, 0.02, matId);
      emissive = vec3(0.24, 0.98, 0.84) * vein * 1.2 + vec3(1.0, 0.64, 0.24) * fresnel * 0.42;
    }`,
  }),

  sierpinski: buildRaymarchShader({
    baseDist: 3.35,
    maxSteps: 86,
    maxDist: 14.0,
    fogDensity: 0.009,
    glowMatId: 2,
    glowColor: 'vec3(0.28, 0.94, 0.86)',
    glowGain: 0.55,
    mapBody: `
vec2 mapWorld(vec3 p) {
  vec3 z = p;
  z.xz *= rot2(uTime * 0.28);
  float scale = 2.0;
  float offset = 1.15;

  for (int n = 0; n < 7; n++) {
    if (z.x + z.y < 0.0) z.xy = -z.yx;
    if (z.x + z.z < 0.0) z.xz = -z.zx;
    if (z.y + z.z < 0.0) z.yz = -z.zy;
    z = z * scale - offset * (scale - 1.0);
  }
  float tet = (length(z) - 1.38) * pow(scale, -7.0);

  vec3 rp = p;
  rp.xy *= rot2(-uTime * 0.35);
  float cage = sdTorus(rp, vec2(1.88, 0.052));
  vec3 rp2 = p;
  rp2.yz *= rot2(uTime * 0.25);
  cage = min(cage, sdTorus(rp2, vec2(1.88, 0.052)));

  float heart = sdOctahedron(p, 0.42);
  vec2 res = opU(vec2(tet, 1.0), vec2(cage, 2.0));
  return opU(res, vec2(heart, 2.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      albedo = vec3(0.92, 0.96, 1.0);
      emissive = vec3(0.22, 0.78, 0.82) * (0.22 + fresnel * 0.78);
    } else {
      albedo = vec3(1.0, 0.8, 0.36);
      emissive = vec3(1.0, 0.66, 0.22) * 1.15;
    }`,
  }),
};
