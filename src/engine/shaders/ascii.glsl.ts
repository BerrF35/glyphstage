import { BAYER_GLSL } from './common.glsl';

export const ASCII_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uEdgeTex;
uniform sampler2D uMainAtlas;
uniform sampler2D uBrailleAtlas;
uniform sampler2D uShapeAtlas;
uniform sampler2D uShapeLut;
uniform sampler2D uPhraseAtlas;

uniform vec2 uResolution;
uniform vec2 uGrid;
uniform float uTime;
uniform int uStyle;
uniform float uEdgeMix;
uniform float uEdgeThreshold;
uniform float uDither;
uniform float uShapeCrunch;
uniform int uInvert;
uniform int uUsePhrase;
uniform int uPhraseLen;
uniform int uUseCustomRamp;

uniform vec3 uBgColor;
uniform vec3 uLowColor;
uniform vec3 uMidColor;
uniform vec3 uHighColor;
uniform vec3 uAccentColor;
uniform int uUseSourceColor;
uniform int uLightMode;

uniform vec4 uShockwaves[4];
uniform float uTransition;

${BAYER_GLSL}

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float sampleMainGlyph(int col, int row, vec2 cellUv) {
  vec2 inset = mix(vec2(0.03), vec2(0.97), cellUv);
  vec2 atlasUv = (vec2(float(col), float(row)) + vec2(inset.x, 1.0 - inset.y)) / vec2(16.0, 8.0);
  return texture(uMainAtlas, atlasUv).r;
}

float samplePhraseGlyph(int col, vec2 cellUv) {
  vec2 inset = mix(vec2(0.03), vec2(0.97), cellUv);
  vec2 atlasUv = vec2((float(col) + inset.x) / 64.0, 1.0 - inset.y);
  return texture(uPhraseAtlas, atlasUv).r;
}

float sampleShapeGlyph(int idx, vec2 cellUv) {
  int col = idx & 15;
  int row = idx >> 4;
  vec2 inset = mix(vec2(0.03), vec2(0.97), cellUv);
  vec2 atlasUv = (vec2(float(col), float(row)) + vec2(inset.x, 1.0 - inset.y)) / vec2(16.0, 6.0);
  return texture(uShapeAtlas, atlasUv).r;
}

float sampleBrailleGlyph(int mask, vec2 cellUv) {
  int col = mask & 15;
  int row = (mask >> 4) & 15;
  vec2 inset = mix(vec2(0.02), vec2(0.98), cellUv);
  vec2 atlasUv = (vec2(float(col), float(row)) + vec2(inset.x, 1.0 - inset.y)) / 16.0;
  return texture(uBrailleAtlas, atlasUv).r;
}

vec3 mapPalette(float lum, vec3 srcRgb, float accentBoost) {
  vec3 col;
  if (uUseSourceColor == 1) {
    col = mix(srcRgb * 0.72 + uLowColor * 0.12, srcRgb * 1.28, clamp(lum, 0.0, 1.0));
  } else {
    float t = clamp(lum, 0.0, 1.0);
    if (t < 0.5) {
      col = mix(uLowColor, uMidColor, t * 2.0);
    } else {
      col = mix(uMidColor, uHighColor, (t - 0.5) * 2.0);
    }
  }
  return mix(col, uAccentColor, clamp(accentBoost, 0.0, 1.0));
}

// Sample luminance at normalized top-down offset inside cell (for Alex Harri 6D)
float sampleCellLuma(vec2 cellBaseUv, vec2 cellStep, vec2 normTopDown) {
  vec2 uv = clamp(cellBaseUv + vec2(normTopDown.x, 1.0 - normTopDown.y) * cellStep, vec2(0.001), vec2(0.999));
  float l = luma(texture(uSceneTex, uv).rgb);
  return uInvert == 1 ? (1.0 - l) : l;
}

// 3-tap Vogel circle sample matching Alex Harri GPU sampling
float sampleCircleLuma(vec2 cellBaseUv, vec2 cellStep, vec2 pt) {
  vec2 r = vec2(0.16, 0.12);
  float s0 = sampleCellLuma(cellBaseUv, cellStep, pt);
  float s1 = sampleCellLuma(cellBaseUv, cellStep, pt + vec2(r.x, -r.y * 0.5));
  float s2 = sampleCellLuma(cellBaseUv, cellStep, pt + vec2(-r.x * 0.85, r.y * 0.85));
  return (s0 * 2.0 + s1 + s2) * 0.25;
}

// Nearest-neighbor lookup in precomputed 95-glyph Alex Harri 6D shape space
int matchShape6D(vec2 cellBaseUv, vec2 cellStep, float crunch) {
  // 6 staggered internal sampling circles (Alex Harri defaultConfig)
  float v0 = sampleCircleLuma(cellBaseUv, cellStep, vec2(0.30, 0.23));
  float v1 = sampleCircleLuma(cellBaseUv, cellStep, vec2(0.70, 0.18));
  float v2 = sampleCircleLuma(cellBaseUv, cellStep, vec2(0.30, 0.50));
  float v3 = sampleCircleLuma(cellBaseUv, cellStep, vec2(0.70, 0.50));
  float v4 = sampleCircleLuma(cellBaseUv, cellStep, vec2(0.30, 0.82));
  float v5 = sampleCircleLuma(cellBaseUv, cellStep, vec2(0.70, 0.77));

  float peak = max(max(v0, v1), max(max(v2, v3), max(v4, v5)));
  if (peak < 0.045) return 0;

  // 10 external context sampling circles reaching into neighboring cells
  float e0 = sampleCellLuma(cellBaseUv, cellStep, vec2(0.07, -0.21));
  float e1 = sampleCellLuma(cellBaseUv, cellStep, vec2(0.93, -0.21));
  float e2 = sampleCellLuma(cellBaseUv, cellStep, vec2(-0.25, 0.07));
  float e3 = sampleCellLuma(cellBaseUv, cellStep, vec2(1.25, 0.07));
  float e4 = sampleCellLuma(cellBaseUv, cellStep, vec2(-0.25, 0.50));
  float e5 = sampleCellLuma(cellBaseUv, cellStep, vec2(1.25, 0.50));
  float e6 = sampleCellLuma(cellBaseUv, cellStep, vec2(-0.25, 0.93));
  float e7 = sampleCellLuma(cellBaseUv, cellStep, vec2(1.25, 0.93));
  float e8 = sampleCellLuma(cellBaseUv, cellStep, vec2(0.07, 1.21));
  float e9 = sampleCellLuma(cellBaseUv, cellStep, vec2(0.93, 1.21));

  // Directional contrast crunch against adjacent brighter regions
  float dirExp = mix(1.0, 2.6, clamp(crunch, 0.0, 1.8));
  float c0 = max(max(e0, e1), max(e2, e4));
  float c1 = max(max(e0, e1), max(e3, e5));
  float c2 = max(max(e2, e4), e6);
  float c3 = max(max(e3, e5), e7);
  float c4 = max(max(e4, e6), max(e8, e9));
  float c5 = max(max(e5, e7), max(e8, e9));

  if (c0 > v0 && c0 > 0.01) v0 = pow(v0 / c0, dirExp) * c0;
  if (c1 > v1 && c1 > 0.01) v1 = pow(v1 / c1, dirExp) * c1;
  if (c2 > v2 && c2 > 0.01) v2 = pow(v2 / c2, dirExp) * c2;
  if (c3 > v3 && c3 > 0.01) v3 = pow(v3 / c3, dirExp) * c3;
  if (c4 > v4 && c4 > 0.01) v4 = pow(v4 / c4, dirExp) * c4;
  if (c5 > v5 && c5 > 0.01) v5 = pow(v5 / c5, dirExp) * c5;

  // Global contrast crunch within cell
  float globExp = mix(1.0, 2.1, clamp(crunch, 0.0, 1.8));
  float maxV = max(max(v0, v1), max(max(v2, v3), max(v4, v5)));
  if (maxV > 0.01) {
    v0 = pow(v0 / maxV, globExp) * maxV;
    v1 = pow(v1 / maxV, globExp) * maxV;
    v2 = pow(v2 / maxV, globExp) * maxV;
    v3 = pow(v3 / maxV, globExp) * maxV;
    v4 = pow(v4 / maxV, globExp) * maxV;
    v5 = pow(v5 / maxV, globExp) * maxV;
  }

  vec3 qA = vec3(v0, v1, v2);
  vec3 qB = vec3(v3, v4, v5);

  float bestDist = 1e9;
  int bestIdx = 0;
  for (int i = 0; i < 95; i++) {
    vec3 gA = texelFetch(uShapeLut, ivec2(i, 0), 0).rgb;
    vec3 gB = texelFetch(uShapeLut, ivec2(i, 1), 0).rgb;
    vec3 dA = qA - gA;
    vec3 dB = qB - gB;
    float dist = dot(dA, dA) + dot(dB, dB);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

void main() {
  vec2 gridPos = vUv * uGrid;
  vec2 cell = floor(gridPos);
  vec2 cellUv = fract(gridPos);
  vec2 cellStep = 1.0 / uGrid;
  vec2 cellCenterUv = (cell + 0.5) * cellStep;

  // Cogmind / Effulgence interactive radial shockwave displacement & frontier flash
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 shockOffset = vec2(0.0);
  float shockGlow = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 sw = uShockwaves[i];
    if (sw.z > 0.0 && sw.z < 1.2) {
      vec2 delta = cellCenterUv - sw.xy;
      vec2 scaled = vec2(delta.x * aspect, delta.y);
      float d = length(scaled);
      float radius = sw.z * 0.92;
      float fade = (1.0 - sw.z / 1.2) * sw.w;
      float ring = exp(-abs(d - radius) * 26.0) * fade;
      vec2 dir = delta / max(d, 0.002);
      shockOffset += dir * ring * 0.022;
      shockGlow = max(shockGlow, ring * 1.15);
    }
  }

  vec2 sampleBase = clamp(cell * cellStep - shockOffset, vec2(0.0), vec2(1.0) - cellStep);

  // 2x2 area-averaged scene downsampling (eliminates single-texel temporal crawl)
  vec4 s00 = texture(uSceneTex, sampleBase + cellStep * vec2(0.25, 0.25));
  vec4 s10 = texture(uSceneTex, sampleBase + cellStep * vec2(0.75, 0.25));
  vec4 s01 = texture(uSceneTex, sampleBase + cellStep * vec2(0.25, 0.75));
  vec4 s11 = texture(uSceneTex, sampleBase + cellStep * vec2(0.75, 0.75));
  vec4 sceneAvg = (s00 + s10 + s01 + s11) * 0.25;

  // Acerola-style 3x3 sub-cell edge-direction majority vote
  float bH = 0.0;
  float bV = 0.0;
  float bD1 = 0.0;
  float bD2 = 0.0;
  float maxEdgeMag = 0.0;
  float depthSum = 0.0;
  for (int ey = 0; ey < 3; ey++) {
    for (int ex = 0; ex < 3; ex++) {
      vec2 eUv = sampleBase + cellStep * ((vec2(float(ex), float(ey)) + 0.5) / 3.0);
      vec4 es = texture(uEdgeTex, eUv);
      depthSum += es.a;
      if (es.r > uEdgeThreshold) {
        maxEdgeMag = max(maxEdgeMag, es.r);
        if (es.g < 0.35) bH += es.r;
        else if (es.g < 0.62) bV += es.r;
        else if (es.g < 0.88) bD1 += es.r;
        else bD2 += es.r;
      }
    }
  }
  float winScore = max(max(bH, bV), max(bD1, bD2));
  int winDir = 1;
  if (bV >= bH && bV >= bD1 && bV >= bD2) winDir = 2;
  else if (bD1 >= bH && bD1 >= bV && bD1 >= bD2) winDir = 3;
  else if (bD2 >= bH && bD2 >= bV && bD2 >= bD1) winDir = 4;

  // Require at least ~2 sub-samples agreeing in tile to suppress edge speckle
  float edgeVote = winScore / 3.0;
  float depthMask = max(sceneAvg.a, depthSum / 9.0);
  float rawLum = luma(sceneAvg.rgb);

  // Showcase dissolve glitch wave during auto-tour transitions
  if (uTransition > 0.01) {
    float wave = sin(uTransition * 3.14159);
    float rnd = hash21(cell + floor(uTime * 24.0));
    if (rnd < wave * 0.55) {
      rawLum = mix(rawLum, rnd, wave * 0.7);
      shockGlow = max(shockGlow, wave * 0.45);
    }
  }

  float lum = uInvert == 1 ? (1.0 - rawLum) : rawLum;
  float bayer = bayer4(cell) - 0.5;
  float ditherGate = smoothstep(0.015, 0.06, lum + depthMask);
  float ditheredLum = clamp(lum + bayer * uDither * 0.42 * ditherGate, 0.0, 1.0);

  // Style 9: Dual-Color ANSI Half-Block (independent top/bottom cell RGB)
  if (uStyle == 9) {
    vec3 topSrc = (s01.rgb + s11.rgb) * 0.5;
    vec3 botSrc = (s00.rgb + s10.rgb) * 0.5;
    float topL = luma(topSrc);
    float botL = luma(botSrc);
    if (uInvert == 1) {
      topL = 1.0 - topL;
      botL = 1.0 - botL;
    }
    float topGate = smoothstep(0.015, 0.06, topL + max(s01.a, s11.a));
    float botGate = smoothstep(0.015, 0.06, botL + max(s00.a, s10.a));
    float topD = clamp(topL + bayer * uDither * 0.26 * topGate, 0.0, 1.0);
    float botD = clamp(botL + bayer * uDither * 0.26 * botGate, 0.0, 1.0);

    vec3 topCol = topD < 0.03 ? uBgColor : mapPalette(topD, topSrc, shockGlow);
    vec3 botCol = botD < 0.03 ? uBgColor : mapPalette(botD, botSrc, shockGlow);

    bool upper = cellUv.y >= 0.5;
    vec3 rgb = upper ? topCol : botCol;
    float activeL = upper ? topD : botD;
    // Crisp subtle horizontal scan seam between upper/lower half-block
    float seam = 1.0 - 0.08 * smoothstep(0.05, 0.0, abs(cellUv.y - 0.5));
    rgb *= seam;
    float bloomMask = (uLightMode == 1) ? 0.0 : smoothstep(0.38, 0.95, activeL + shockGlow * 0.5);
    fragColor = vec4(rgb, bloomMask);
    return;
  }

  float glyphAlpha = 0.0;
  float accentBoost = shockGlow;
  float outLum = lum;

  if (uStyle == 8) {
    // Alex Harri 6D Shape-Vector Matching
    int bestIdx = matchShape6D(sampleBase, cellStep, uShapeCrunch);
    if (shockGlow > 0.45 && bestIdx == 0) {
      bestIdx = 10; // * flash along shockwave frontier
    }
    glyphAlpha = sampleShapeGlyph(bestIdx, cellUv);
    outLum = max(lum, bestIdx > 0 ? 0.24 : 0.0);
  } else if (uStyle == 2) {
    // Braille 2x4 subpixel stipple (8 independent sub-samples per cell)
    int mask = 0;
    for (int py = 0; py < 4; py++) {
      for (int px = 0; px < 2; px++) {
        vec2 subUv = sampleBase + vec2((float(px) + 0.5) * 0.5, (float(py) + 0.5) * 0.25) * cellStep;
        float subL = luma(texture(uSceneTex, subUv).rgb);
        if (uInvert == 1) subL = 1.0 - subL;
        float thresh = mix(0.28, bayer4(cell * vec2(2.0, 4.0) + vec2(float(px), float(py))), clamp(uDither, 0.0, 1.0));
        if (subL > thresh * 0.88 + 0.04) {
          int bit = px * 4 + py;
          mask |= (1 << bit);
        }
      }
    }
    glyphAlpha = sampleBrailleGlyph(mask, cellUv);
    if (edgeVote > uEdgeThreshold * 0.5 && uEdgeMix > 0.15) {
      accentBoost = max(accentBoost, (maxEdgeMag - uEdgeThreshold) * uEdgeMix * 1.4);
    }
  } else if (uStyle == 5) {
    // 2x2 Quadrant ANSI blocks with Bayer dithering
    int qmask = 0;
    for (int py = 0; py < 2; py++) {
      for (int px = 0; px < 2; px++) {
        vec2 subUv = sampleBase + vec2((float(px) + 0.5) * 0.5, (float(py) + 0.5) * 0.5) * cellStep;
        float subL = luma(texture(uSceneTex, subUv).rgb);
        if (uInvert == 1) subL = 1.0 - subL;
        float thresh = mix(0.26, bayer4(cell * 2.0 + vec2(float(px), float(py))), clamp(uDither, 0.0, 1.0));
        if (subL > thresh * 0.85 + 0.05) {
          int bit = (1 - py) * 2 + px;
          qmask |= (1 << bit);
        }
      }
    }
    glyphAlpha = sampleMainGlyph(qmask, 4, cellUv);
    outLum = max(lum, 0.22);
  } else if (uStyle == 7) {
    // Depth-modulated Katakana rain cascade
    float colSeed = hash21(vec2(cell.x, 1.37));
    float speed = 3.2 + colSeed * 6.5;
    float head = fract(colSeed * 7.13 - uTime * speed * 0.045 + cell.y / max(12.0, uGrid.y));
    float trail = pow(head, 4.5);
    float headFlash = smoothstep(0.94, 0.995, head);
    float combined = clamp(ditheredLum * 0.85 + trail * (0.28 + depthMask * 0.45), 0.0, 1.0);
    int kIdx = int(mod(floor(hash21(cell) * 16.0 + floor(uTime * (2.0 + colSeed * 5.0))), 15.0)) + 1;
    if (combined < 0.08) kIdx = 0;
    glyphAlpha = sampleMainGlyph(kIdx, 5, cellUv);
    outLum = combined;
    accentBoost = max(accentBoost, headFlash * (0.4 + depthMask * 0.6));
  } else {
    bool isEdge = (edgeVote > uEdgeThreshold * 0.48) && (uEdgeMix > 0.05) && (lum > 0.04 || depthMask > 0.08);
    int gCol = 0;
    int gRow = 1;

    if (uUsePhrase == 1 && uPhraseLen > 0 && ditheredLum > 0.08) {
      int pIdx = int(mod(cell.x + (uGrid.y - cell.y) * 5.0, float(uPhraseLen)));
      glyphAlpha = samplePhraseGlyph(clamp(pIdx, 0, 63), cellUv);
    } else if (uUseCustomRamp == 1) {
      gRow = 7;
      gCol = int(clamp(floor(ditheredLum * 15.99), 0.0, 15.0));
      glyphAlpha = sampleMainGlyph(gCol, gRow, cellUv);
    } else if (uStyle == 6) {
      gRow = 6;
      if (isEdge && edgeVote > uEdgeThreshold * 0.65) {
        gRow = 0;
        gCol = winDir;
      } else {
        gCol = int(clamp(floor(ditheredLum * 15.99), 0.0, 15.0));
      }
      glyphAlpha = sampleMainGlyph(gCol, gRow, cellUv);
    } else if (isEdge && (uStyle == 0 || uStyle == 1 || uStyle == 4)) {
      gRow = 0;
      gCol = winDir;
      accentBoost = max(accentBoost, clamp((maxEdgeMag - uEdgeThreshold) * 2.2 * uEdgeMix, 0.0, 0.9));
      outLum = max(lum, 0.55);
      glyphAlpha = sampleMainGlyph(gCol, gRow, cellUv);
    } else {
      if (uStyle == 1) {
        gRow = 2;
        float shimmer = step(0.96, hash21(cell + floor(uTime * 4.0) * 0.01));
        if (ditheredLum > 0.78 && shimmer > 0.5) {
          gRow = 0;
          gCol = 8;
          accentBoost = max(accentBoost, 0.85);
        } else {
          gCol = int(clamp(floor(ditheredLum * 15.99), 0.0, 15.0));
        }
      } else if (uStyle == 3) {
        gRow = 3;
        gCol = int(clamp(floor(ditheredLum * 15.99), 0.0, 15.0));
      } else {
        gRow = 1;
        gCol = int(clamp(floor(ditheredLum * 15.99), 0.0, 15.0));
      }
      glyphAlpha = sampleMainGlyph(gCol, gRow, cellUv);
    }
  }

  if ((uStyle == 1 || uStyle == 4) && outLum > 0.82) {
    accentBoost = max(accentBoost, (outLum - 0.82) * 3.2);
  }

  vec3 fg = mapPalette(outLum, sceneAvg.rgb, accentBoost);
  vec3 finalRgb = mix(uBgColor, fg, clamp(glyphAlpha, 0.0, 1.0));

  float bloomMask = (uLightMode == 1) ? 0.0 : glyphAlpha * smoothstep(0.32, 0.95, outLum + accentBoost * 0.5);
  fragColor = vec4(finalRgb, bloomMask);
}
`;
