import { buildRaymarchShader, SCENE_PREAMBLE } from '../sceneBase.glsl';

export const COSMOS_SHADERS = {
  singularity: `${SCENE_PREAMBLE}
void main() {
  vec2 ndc = (vUv * 2.0 - 1.0) * vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  vec3 ro = orbitCameraPos(5.4, uCamera, uZoom);
  vec3 ww = normalize(-ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(ndc.x * uu + ndc.y * vv + 1.55 * ww);

  vec3 p = ro;
  vec3 v = rd;
  vec3 accum = vec3(0.0);
  float mask = 0.0;
  float rs = 0.92;

  for (int i = 0; i < 96; i++) {
    float r = length(p);
    if (r < rs * 0.96) {
      mask = max(mask, 0.92);
      break;
    }
    if (r > 16.0) break;

    float dt = clamp(0.045 * r, 0.03, 0.24);
    vec3 acc = -p * (1.35 * rs / (r * r * r + 0.001));
    v = normalize(v + acc * dt);
    vec3 nextP = p + v * dt;

    if (p.y * nextP.y <= 0.0 || abs(p.y) < 0.08) {
      float tCross = abs(p.y) / max(0.0001, abs(p.y - nextP.y));
      vec3 hit = mix(p, nextP, clamp(tCross, 0.0, 1.0));
      float hr = length(hit.xz);
      if (hr > rs * 1.15 && hr < 4.35) {
        float ang = atan(hit.z, hit.x);
        float omega = 1.65 / pow(hr, 1.15);
        float swirl = fbm2(vec2(hr * 2.8, ang * 2.0 + uTime * omega * 0.7));
        float streaks = 0.55 + 0.45 * sin(hr * 11.0 - ang * 3.0 - uTime * 2.4 + swirl * 5.0);
        float radial = smoothstep(rs * 1.15, rs * 1.55, hr) * smoothstep(4.35, 1.85, hr);
        float doppler = 0.62 + 0.58 * clamp(dot(normalize(vec3(-hit.z, 0.0, hit.x)), rd), -0.7, 0.9);
        float heat = clamp((1.0 - (hr - rs) / 3.2) * doppler * streaks, 0.0, 1.6);

        vec3 diskCol = mix(vec3(0.88, 0.22, 0.06), vec3(1.0, 0.72, 0.28), clamp(heat, 0.0, 1.0));
        diskCol = mix(diskCol, vec3(0.95, 0.98, 1.0), smoothstep(0.95, 1.45, heat));
        float density = radial * (0.35 + 0.65 * swirl) * smoothstep(0.18, 0.0, abs(p.y));
        accum += diskCol * density * 0.42;
        mask = max(mask, clamp(density * 1.6, 0.0, 1.0));
      }
    }

    float photon = exp(-abs(r - rs * 1.14) * 14.0);
    accum += vec3(1.0, 0.82, 0.55) * photon * 0.065;
    mask = max(mask, photon * 0.7);
    p = nextP;
  }

  float stars = pow(hash21(floor(ndc * 140.0)), 26.0) * 0.55;
  accum += vec3(0.75, 0.85, 1.0) * stars * (1.0 - clamp(mask * 2.0, 0.0, 1.0));
  fragColor = finishTone(accum, mask);
}
`,

  dyson: buildRaymarchShader({
    baseDist: 4.85,
    maxSteps: 92,
    maxDist: 20.0,
    fogDensity: 0.0045,
    glowMatId: 1,
    glowColor: 'vec3(1.0, 0.7, 0.24)',
    glowGain: 0.82,
    mapBody: `
vec2 mapWorld(vec3 p) {
  float flare = fbm3(p * 2.2 + vec3(uTime * 0.6, -uTime * 0.4, 0.0)) * 0.14;
  float star = sdSphere(p, 0.92 + flare);

  vec3 sp = p;
  sp.xz *= rot2(uTime * 0.18);
  sp.xy *= rot2(0.35);
  float shell = abs(length(sp) - 1.78) - 0.1;
  float cuts = max(
    abs(sin(atan(sp.z, sp.x) * 6.0)) - 0.68,
    abs(sin(acos(clamp(sp.y / max(length(sp), 0.01), -1.0, 1.0)) * 5.0)) - 0.62
  );
  shell = max(shell, cuts * 0.28);

  vec3 r1 = p;
  r1.xz *= rot2(-uTime * 0.26);
  float ringA = max(abs(length(r1.xz) - 2.48) - 0.26, abs(r1.y) - 0.08);
  ringA = max(ringA, -sin(atan(r1.z, r1.x) * 24.0) * 0.05);

  vec3 r2 = p;
  r2.yz *= rot2(0.85);
  r2.xz *= rot2(uTime * 0.34);
  float ringB = sdTorus(r2, vec2(2.14, 0.075));

  vec2 res = vec2(star, 1.0);
  res = opU(res, vec2(shell, 2.0));
  return opU(res, vec2(min(ringA, ringB), 3.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      float gran = fbm3(p * 3.5 + uTime * 0.5);
      albedo = vec3(1.0, 0.86, 0.46);
      emissive = mix(vec3(1.0, 0.38, 0.08), vec3(1.0, 0.98, 0.8), gran) * 1.55;
    } else if (matId == 2.0) {
      albedo = vec3(0.56, 0.62, 0.72);
      float rimHeat = smoothstep(0.35, 1.0, fresnel);
      emissive = vec3(1.0, 0.62, 0.18) * rimHeat * 0.68;
    } else {
      albedo = vec3(0.86, 0.9, 0.96);
      float lights = smoothstep(0.82, 0.99, sin(atan(p.z, p.x) * 32.0 + uTime * 3.0));
      emissive = vec3(0.32, 0.92, 0.96) * (0.2 + lights * 0.85);
    }`,
  }),

  saturn: buildRaymarchShader({
    baseDist: 5.5,
    maxSteps: 86,
    maxDist: 18.0,
    fogDensity: 0.004,
    mapBody: `
vec2 mapWorld(vec3 p) {
  vec3 tp = p;
  tp.xy *= rot2(0.32);

  float planet = sdSphere(vec3(tp.x, tp.y * 1.12, tp.z), 1.02) * 0.88;

  float rr = length(tp.xz);
  float ringBand = max(abs(tp.y) - 0.018, max(1.36 - rr, rr - 2.68));
  float cassini = abs(rr - 2.08) - 0.1;
  ringBand = max(ringBand, -cassini);

  float ma = uTime * 0.65;
  vec3 moonPos = vec3(cos(ma) * 2.95, 0.14, sin(ma) * 2.95);
  float moon = sdSphere(tp - moonPos, 0.17);

  vec2 res = vec2(planet, 1.0);
  res = opU(res, vec2(ringBand, 2.0));
  return opU(res, vec2(moon, 3.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      float bands = 0.5 + 0.5 * sin(p.y * 16.0 + fbm2(vec2(atan(p.z, p.x) * 3.0, p.y * 4.0)) * 2.2);
      albedo = mix(vec3(0.76, 0.56, 0.36), vec3(0.98, 0.88, 0.66), bands);
    } else if (matId == 2.0) {
      float rr = length(p.xz);
      float grooves = 0.55 + 0.45 * sin(rr * 42.0) * cos(rr * 17.0);
      albedo = vec3(0.92, 0.86, 0.72) * grooves;
      emissive = albedo * 0.25;
    } else {
      albedo = vec3(0.86, 0.9, 0.96);
    }`,
  }),

  reactor: buildRaymarchShader({
    baseDist: 4.95,
    maxSteps: 90,
    maxDist: 18.0,
    fogDensity: 0.009,
    glowMatId: 2,
    glowColor: 'vec3(0.2, 0.98, 0.54)',
    glowGain: 0.72,
    mapBody: `
vec2 mapWorld(vec3 p) {
  vec3 cp = p;
  cp.xz *= rot2(uTime * 0.5);
  float plasma = sdTorus(cp, vec2(1.25, 0.3 + 0.045 * sin(atan(cp.z, cp.x) * 8.0 + uTime * 5.0)));

  float ang = atan(p.z, p.x);
  float sec = TAU / 12.0;
  float a = mod(ang + sec * 0.5, sec) - sec * 0.5;
  float r = length(p.xz);
  vec3 qp = vec3(r * cos(a) - 1.25, p.y, r * sin(a));
  float coil = max(abs(length(qp.xy) - 0.62) - 0.1, abs(qp.z) - 0.1);

  vec3 sp = p;
  sp.xz *= rot2(-uTime * 0.4);
  float spindle = sdHexPrism(sp.xzy, vec2(0.45, 1.55));
  float rings = abs(fract(p.y * 3.0 - uTime * 0.8) - 0.5) * 0.06;
  spindle += rings;

  float floorP = p.y + 1.45;

  vec2 res = vec2(min(coil, spindle), 1.0);
  res = opU(res, vec2(plasma, 2.0));
  return opU(res, vec2(floorP, 3.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      albedo = vec3(0.52, 0.6, 0.64);
      float scan = smoothstep(0.88, 0.99, sin(p.y * 8.0 - uTime * 4.0));
      emissive = vec3(0.22, 0.98, 0.56) * (scan * 0.65 + fresnel * 0.35);
    } else if (matId == 2.0) {
      float arc = 0.5 + 0.5 * sin(atan(p.z, p.x) * 14.0 - uTime * 7.0);
      albedo = vec3(0.8, 1.0, 0.88);
      emissive = mix(vec3(0.14, 0.94, 0.5), vec3(0.9, 1.0, 0.95), arc) * 1.55;
    } else {
      albedo = vec3(0.16, 0.22, 0.22);
      float sonar = exp(-abs(length(p.xz) - mod(uTime * 2.4, 5.5)) * 5.0);
      float hex = max(smoothstep(0.95, 0.99, abs(sin(p.x * 3.0))), smoothstep(0.95, 0.99, abs(sin(p.z * 3.0))));
      emissive = vec3(0.18, 0.95, 0.52) * (sonar * 0.95 + hex * 0.2);
    }`,
  }),

  nebula: `${SCENE_PREAMBLE}
void main() {
  vec2 ndc = (vUv * 2.0 - 1.0) * vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  vec3 ro = vec3(0.0, 0.0, 3.4 / max(0.45, uZoom));
  vec3 rd = normalize(vec3(ndc, -1.35));
  rd.xz *= rot2(uCamera.x * 0.7 + uTime * 0.06);
  rd.yz *= rot2(clamp(uCamera.y * 0.7, -0.9, 0.9));

  vec3 accum = vec3(0.0);
  float trans = 1.0;
  float mask = 0.0;
  float t = 0.4;

  // Sculpted high-contrast galactic dust clouds with dark interstellar voids
  for (int i = 0; i < 42; i++) {
    vec3 p = ro + rd * t + vec3(0.0, 0.0, -uTime * 0.24);
    float band = exp(-abs(p.y + sin(p.x * 0.65) * 0.55) * 0.95);
    vec3 warp = vec3(fbm3(p * 0.62), fbm3(p * 0.62 + 4.2), fbm3(p * 0.62 + 8.7));
    float d = fbm3(p * 0.92 + warp * 1.75) * (0.45 + 0.85 * band);
    float dens = smoothstep(0.54, 0.96, d);

    if (dens > 0.01) {
      vec3 c1 = vec3(0.16, 0.52, 1.0);
      vec3 c2 = vec3(1.0, 0.34, 0.22);
      vec3 c3 = vec3(1.0, 0.95, 0.72);
      vec3 gas = mix(c1, c2, clamp(warp.x * 1.35, 0.0, 1.0));
      gas = mix(gas, c3, smoothstep(0.45, 0.92, dens));

      float a = dens * 0.22;
      accum += gas * a * trans * 2.25;
      trans *= (1.0 - a * 0.88);
      mask = max(mask, clamp((1.0 - trans) * 1.3, 0.0, 1.0));
      if (trans < 0.04) break;
    }
    t += 0.16;
  }

  // Crisp multi-layer deep space stars
  for (int s = 0; s < 2; s++) {
    float sc = s == 0 ? 120.0 : 210.0;
    vec3 sp = rd * sc + float(s) * 17.3;
    float sh = hash31(floor(sp));
    if (sh > 0.978) {
      float star = smoothstep(0.32, 0.0, length(fract(sp) - 0.5));
      accum += vec3(0.95, 0.97, 1.0) * star * (1.8 - float(s) * 0.5);
      mask = max(mask, star * 0.95);
    }
  }

  fragColor = finishTone(accum, mask);
}
`,

  warp: `${SCENE_PREAMBLE}
void main() {
  vec2 ndc = (vUv * 2.0 - 1.0) * vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  vec2 center = (uPointer - 0.5) * 0.35 * uPointerActive + vec2(sin(uCamera.x), sin(uCamera.y)) * 0.25;
  vec2 p = (ndc - center) / max(0.45, uZoom);

  float r = max(0.03, length(p));
  float ang = atan(p.y, p.x);
  float depth = 1.4 / r + uTime * 2.9;

  float streaks = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i) + 1.0;
    float sector = floor((ang + PI) / TAU * (28.0 + fi * 14.0));
    float seed = hash21(vec2(sector, fi * 7.3));
    float z = fract(depth * (0.45 + seed * 0.5) + seed * 10.0);
    float lenMask = smoothstep(0.0, 0.16, z) * smoothstep(0.78, 0.16, z);
    float angDist = abs(fract((ang + PI) / TAU * (28.0 + fi * 14.0)) - 0.5);
    float thin = smoothstep(0.28, 0.03, angDist);
    streaks += lenMask * thin * (0.55 + 0.65 * seed);
  }

  float rings = smoothstep(0.84, 0.99, sin(depth * 4.5 + sin(ang * 4.0) * 0.5));
  float vortex = exp(-abs(r - 0.22) * 14.0) * 0.85;
  float hole = smoothstep(0.05, 0.3, r);

  vec3 col = mix(vec3(0.2, 0.64, 1.0), vec3(0.98, 1.0, 1.0), clamp(streaks, 0.0, 1.0)) * streaks * 1.25;
  col += vec3(0.36, 0.92, 1.0) * (rings * 0.68 + vortex);
  col *= hole;
  float mask = clamp((streaks * 0.85 + rings * 0.6 + vortex) * hole, 0.0, 1.0);
  fragColor = finishTone(col, mask);
}
`,
};
