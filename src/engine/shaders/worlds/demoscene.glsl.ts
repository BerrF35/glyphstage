import { buildRaymarchShader, SCENE_PREAMBLE } from '../sceneBase.glsl';

export const DEMOSCENE_SHADERS = {
  donut: buildRaymarchShader({
    baseDist: 3.35,
    maxSteps: 86,
    maxDist: 14.0,
    fogDensity: 0.006,
    mapBody: `
vec2 mapWorld(vec3 p) {
  float t = uTime;
  vec3 q = p;
  q.xz *= rot2(t * 0.72 + 0.45);
  q.xy *= rot2(t * 0.48 + 0.72);

  // Monumental spinning a1k0n torus with fine radial lathe facets
  float phi = atan(q.z, q.x);
  vec2 tube = vec2(length(q.xz) - 1.08, q.y);
  float theta = atan(tube.y, tube.x);
  float groove = sin(theta * 14.0) * 0.012 + sin(phi * 28.0) * 0.006;
  float torus = length(tube) - (0.44 + groove);

  // Subtle calibration ring behind torus
  vec3 r = p;
  r.yz *= rot2(0.35 - t * 0.18);
  float reticle = sdTorus(r, vec2(1.92, 0.028));
  return opU(vec2(torus, 1.0), vec2(reticle, 2.0));
}`,
    shadeBody: `
    if (matId == 1.0) {
      float band = 0.5 + 0.5 * sin(p.y * 8.0 + uTime * 2.0);
      albedo = mix(vec3(0.88, 0.72, 0.48), vec3(1.0, 0.96, 0.88), band * 0.45);
      emissive = vec3(1.0, 0.74, 0.34) * (fresnel * 0.72 + spec * 0.65);
    } else {
      albedo = vec3(0.95, 0.68, 0.3);
      emissive = vec3(1.0, 0.62, 0.2) * 0.55;
    }`,
  }),

  synthwave: `${SCENE_PREAMBLE}
void main() {
  vec2 ndc = (vUv * 2.0 - 1.0) * vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  float zoom = max(0.45, uZoom);
  float zRun = -uTime * 3.8;

  vec3 ro = vec3(sin(uCamera.x) * 1.15, 1.15 + clamp(uCamera.y, -0.35, 0.65) * 1.1, zRun);
  vec3 ta = vec3(0.0, 0.92, zRun - 8.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(ndc.x * uu + ndc.y * vv + (1.38 * zoom) * ww);

  // Sky with giant slatted Outrun sun & subtle starfield
  vec3 col = vec3(0.0);
  float mask = 0.0;
  vec2 sunUv = vec2(dot(rd, uu), dot(rd, vv) - 0.14);
  float sunDist = length(sunUv);
  float sunDisc = smoothstep(0.32, 0.295, sunDist);
  float slat = step(0.0, sin((sunUv.y + 0.32) * 52.0 - uTime * 2.2) - smoothstep(0.08, -0.28, sunUv.y) * 0.72);
  float sunMask = sunDisc * mix(1.0, slat, smoothstep(0.08, -0.02, sunUv.y));
  vec3 sunCol = mix(vec3(1.0, 0.22, 0.34), vec3(1.0, 0.94, 0.48), clamp((sunUv.y + 0.32) / 0.62, 0.0, 1.0));
  col += sunCol * sunMask * 1.75;
  col += vec3(1.0, 0.32, 0.55) * exp(-sunDist * 4.5) * 0.55;
  mask = max(mask, sunMask);

  // Horizon twilight glow band
  float horizGlow = exp(-abs(rd.y) * 12.0);
  col += vec3(0.92, 0.22, 0.52) * horizGlow * 0.38;

  // March perspective grid highway & jagged valley mountains
  if (rd.y < 0.22) {
    float t = 0.6;
    for (int i = 0; i < 64; i++) {
      vec3 p = ro + rd * t;
      float valley = smoothstep(1.35, 3.8, abs(p.x));
      float peaks = (abs(sin(p.x * 0.72) * cos(p.z * 0.42)) * 2.4 + fbm2(p.xz * 0.35) * 2.8) * valley;
      float d = p.y - peaks;
      if (d < 0.02) {
        vec2 gLine = abs(fract(p.xz * 0.65 - 0.5) - 0.5);
        vec2 gWidth = vec2(0.032 + t * 0.0085);
        vec2 g = smoothstep(gWidth, gWidth * 0.15, gLine);
        float grid = max(g.x, g.y);
        float lane = exp(-abs(abs(p.x) - 1.35) * 5.0);
        float ridge = smoothstep(0.4, 2.6, peaks);
        float fog = exp(-t * 0.045);

        vec3 gridCol = mix(vec3(0.24, 0.88, 1.0), vec3(1.0, 0.26, 0.62), ridge);
        vec3 surf = vec3(0.05, 0.04, 0.1) + gridCol * (grid * 1.25 + lane * 0.9);
        // Sun reflection strip down center avenue
        float refl = exp(-abs(p.x) * 1.1) * (1.0 - valley) * (0.45 + 0.55 * sin(p.z * 4.0));
        surf += vec3(1.0, 0.64, 0.28) * refl * 0.55;
        col = mix(col, surf, fog);
        mask = max(mask, clamp((grid + lane + ridge * 0.45 + refl * 0.5) * fog, 0.15, 1.0));
        break;
      }
      t += max(0.08, d * 0.48);
      if (t > 44.0) break;
    }
  }

  fragColor = finishTone(col, mask);
}
`,

  hartverdrahtet: buildRaymarchShader({
    maxSteps: 92,
    maxDist: 24.0,
    fogDensity: 0.011,
    stepScale: 0.74,
    fov: 1.48,
    useShadow: false,
    cameraSetup: `
  float zRun = -uTime * 0.92;
  vec3 ro = vec3(sin(uTime * 0.35) * 0.35 + sin(uCamera.x) * 0.65, sin(uCamera.y) * 0.55, zRun);
  vec3 ta = vec3(sin(uTime * 0.35 + 0.4) * 0.2, 0.0, zRun - 4.0);`,
    mapBody: `
vec2 mapWorld(vec3 p) {
  vec3 q = p;
  q.xz = mod(q.xz + 2.5, 5.0) - 2.5;
  q.y = mod(q.y + 2.5, 5.0) - 2.5;
  float s = 1.0;
  float trace = 1e6;

  // Recursive metallic circuit KIFS inspired by Akronyme Analogiker 4k intro
  for (int i = 0; i < 6; i++) {
    q = abs(q) - vec3(0.68, 0.64, 0.72);
    if (q.x < q.y) q.xy = q.yx;
    if (q.y < q.z) q.yz = q.zy;
    q.xz *= rot2(0.18);
    float r2 = clamp(dot(q, q), 0.2, 1.4);
    float k = 1.38 / r2;
    q *= k;
    s *= k;
    trace = min(trace, abs(q.x - q.y));
  }

  float circuit = sdBox(q, vec3(0.56, 0.56, 0.56)) / s;
  float shaft = -(length(p.xy) - 0.88);
  return vec2(max(circuit, shaft), clamp(trace * 0.8, 0.0, 1.0));
}`,
    shadeBody: `
    float bus = smoothstep(0.16, 0.01, matId);
    albedo = mix(vec3(0.86, 0.72, 0.42), vec3(0.24, 0.32, 0.42), clamp(matId, 0.0, 1.0));
    float pulse = 0.5 + 0.5 * sin(p.z * 5.0 - uTime * 4.0);
    emissive = mix(vec3(0.22, 0.92, 0.88), vec3(1.0, 0.72, 0.25), pulse) * (bus * 1.15 + fresnel * 0.48);`,
  }),

  truchet: buildRaymarchShader({
    maxSteps: 92,
    maxDist: 24.0,
    fogDensity: 0.011,
    stepScale: 0.78,
    fov: 1.45,
    useShadow: false,
    cameraSetup: `
  float zRun = -uTime * 1.1;
  vec3 ro = vec3(sin(uTime * 0.32) * 0.45 + sin(uCamera.x) * 0.65, cos(uTime * 0.28) * 0.35 + sin(uCamera.y) * 0.65, zRun);
  vec3 ta = vec3(sin(uTime * 0.32 + 0.5) * 0.3, cos(uTime * 0.28 + 0.5) * 0.25, zRun - 4.0);`,
    mapBody: `
float torusArc(vec2 p, float z) {
  return length(vec2(length(p) - 0.5, z)) - 0.145;
}

vec2 mapWorld(vec3 p) {
  vec3 id = floor(p);
  vec3 q = fract(p) - 0.5;
  float h = hash31(id);
  if (h > 0.5) q.x = -q.x;
  if (fract(h * 13.7) > 0.5) q.y = -q.y;
  if (fract(h * 29.3) > 0.5) q.z = -q.z;

  // Three non-intersecting orthogonal quarter-torus pipes per cubic tile
  float a1 = torusArc(q.xy - vec2(0.5, 0.5), q.z);
  float a2 = torusArc(q.yz - vec2(-0.5, 0.5), q.x);
  float a3 = torusArc(q.zx - vec2(-0.5, -0.5), q.y);
  float d = min(a1, min(a2, a3));

  // Clear slight safety tube around camera path so pipes never clip lens
  float clear = -(length(p.xy - vec2(sin(uTime * 0.32) * 0.45, cos(uTime * 0.28) * 0.35)) - 0.32);
  d = max(d, clear);

  // Ring collar bands along pipes
  float collar = abs(sin((q.x + q.y + q.z) * 14.0 - uTime * 3.5));
  return vec2(d, collar);
}`,
    shadeBody: `
    float ring = smoothstep(0.9, 0.99, matId);
    albedo = mix(vec3(0.32, 0.52, 0.82), vec3(0.92, 0.97, 1.0), 0.45 + 0.35 * matId);
    emissive = vec3(0.38, 0.88, 1.0) * (ring * 0.95 + fresnel * 0.55);`,
  }),

  voxels: `${SCENE_PREAMBLE}
float terrainHeight(vec2 cell) {
  float ridge = fbm2(cell * 0.11 + vec2(0.0, uTime * 0.08));
  float canyon = smoothstep(1.2, 5.5, abs(cell.x));
  float h = floor(ridge * 7.5 * canyon - 1.5);
  return h;
}

void main() {
  vec2 ndc = (vUv * 2.0 - 1.0) * vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  float zRun = -uTime * 1.9;
  vec3 ro = vec3(sin(uCamera.x) * 2.4, 4.8 + clamp(uCamera.y, -0.5, 0.8) * 2.4, zRun);
  vec3 ta = vec3(sin(uCamera.x) * 0.6, 1.2, zRun - 9.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(ndc.x * uu + ndc.y * vv + (1.42 * max(0.45, uZoom)) * ww);

  // True 3D DDA voxel traversal inspired by Asciicker & XorDev
  vec3 pos = floor(ro);
  vec3 stepDir = sign(rd);
  vec3 tDelta = abs(1.0 / max(abs(rd), vec3(1e-4)));
  vec3 tMax = (stepDir * (pos - ro) + (stepDir * 0.5 + 0.5)) * tDelta;
  vec3 normal = vec3(0.0, 1.0, 0.0);

  vec3 col = vec3(0.0);
  float mask = 0.0;
  float tHit = 0.0;

  for (int i = 0; i < 68; i++) {
    float th = terrainHeight(pos.xz);
    float water = -1.5;
    if (pos.y <= max(th, water)) {
      bool isWater = th < water && pos.y <= water;
      vec3 hitP = ro + rd * tHit;
      vec3 lDir = normalize(uLightDir);
      float diff = max(0.0, dot(normal, lDir));
      vec3 cellUv = fract(hitP);
      vec3 edge3 = min(cellUv, 1.0 - cellUv);
      float edge = 1.0 - smoothstep(0.04, 0.09, min(edge3.x, min(edge3.y, edge3.z)));

      if (isWater) {
        float rip = 0.5 + 0.5 * sin(hitP.x * 2.5 + hitP.z * 2.0 - uTime * 3.0);
        col = vec3(0.14, 0.45, 0.68) * (0.45 + diff * 0.65) + vec3(0.42, 0.92, 0.95) * rip * 0.35;
      } else {
        float elev = clamp((pos.y + 2.0) / 7.5, 0.0, 1.0);
        vec3 base = mix(vec3(0.28, 0.34, 0.4), vec3(0.92, 0.94, 0.98), elev);
        col = base * (0.24 + diff * uLightIntensity * 0.92) + vec3(0.24, 0.9, 0.74) * edge * 0.35;
      }

      float fog = exp(-tHit * tHit * 0.0022);
      col *= fog;
      mask = clamp(fog * 0.95 + 0.08, 0.1, 1.0);
      break;
    }

    if (tMax.x < tMax.y && tMax.x < tMax.z) {
      tHit = tMax.x;
      tMax.x += tDelta.x;
      pos.x += stepDir.x;
      normal = vec3(-stepDir.x, 0.0, 0.0);
    } else if (tMax.y < tMax.z) {
      tHit = tMax.y;
      tMax.y += tDelta.y;
      pos.y += stepDir.y;
      normal = vec3(0.0, -stepDir.y, 0.0);
    } else {
      tHit = tMax.z;
      tMax.z += tDelta.z;
      pos.z += stepDir.z;
      normal = vec3(0.0, 0.0, -stepDir.z);
    }
    if (tHit > 42.0) break;
  }

  fragColor = finishTone(col, mask);
}
`,

  matrix: `${SCENE_PREAMBLE}
void main() {
  vec2 aspect = vec2(uResolution.x / max(1.0, uResolution.y), 1.0);
  vec2 uv = (vUv - 0.5) * aspect / max(0.45, uZoom);
  uv += vec2(sin(uCamera.x) * 0.16, sin(uCamera.y) * 0.12);

  vec3 accum = vec3(0.0);
  float mask = 0.0;

  // 4 parallax depth curtains of digital rain streams
  for (int layer = 0; layer < 4; layer++) {
    float fl = float(layer);
    float depth = 1.0 + fl * 0.55;
    float cols = 22.0 + fl * 14.0;
    vec2 p = uv * depth;
    // Slight perspective warp away from center
    p.x *= 1.0 + abs(p.y) * 0.14;

    float colId = floor(p.x * cols);
    float colFrac = fract(p.x * cols);
    float colWidth = smoothstep(0.5, 0.18, abs(colFrac - 0.5));

    float seed = hash21(vec2(colId, fl * 19.7));
    float speed = 0.45 + seed * 1.15;
    float dropPos = fract(p.y * 0.72 + uTime * speed + seed * 17.3);
    float head = smoothstep(0.08, 0.0, dropPos);
    float tail = pow(clamp(1.0 - dropPos, 0.0, 1.0), 3.1) * smoothstep(0.0, 0.025, dropPos);

    // Per-row digital glyph pulse flicker
    float rowId = floor(p.y * cols * 0.65);
    float flicker = 0.62 + 0.38 * sin(uTime * 8.0 + hash21(vec2(colId, rowId)) * TAU);
    float intensity = (tail * 0.8 + head * 2.65) * colWidth * flicker / (1.0 + fl * 0.42);

    vec3 streamCol = mix(vec3(0.08, 0.86, 0.38), vec3(0.92, 1.0, 0.94), head);
    accum += streamCol * intensity;
    mask = max(mask, clamp(intensity * 1.2, 0.0, 1.0));
  }

  fragColor = finishTone(accum, mask);
}
`,
};
