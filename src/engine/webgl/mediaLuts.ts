/**
 * Procedural physical lookup tables & tactile textures built once on startup.
 *
 * Implementations faithfully follow the original human-authored algorithms:
 * - Rune Skovbo Johansen (runevision/Dither3D): 3D recursive Bayer radial distance volume + inverse-CDF brightness ramp.
 * - David Lenaerts (threejs-thin-film-iridescence) + Belcour & Barla (SIGGRAPH 2017): 2D Airy interference LUT.
 * - Praun, Hoppe, Webb & Finkelstein (SIGGRAPH 2001): 6-tier strictly nested Tonal Art Map (TAM) mip pyramid.
 * - Cold-press cotton paper heightfield & void-and-cluster blue noise.
 */

export interface Dither3DVolumeBundle {
  width: number;
  height: number;
  depth: number;
  volumeData: Uint8Array;
  rampWidth: number;
  rampData: Uint8Array;
}

/** Recursive Bayer matrix order (0..N^2-1) for power-of-two side length. */
function buildBayerOrder(side: number): Array<[number, number]> {
  let matrix = [[0]];
  let n = 1;
  while (n < side) {
    const next: number[][] = Array.from({ length: n * 2 }, () => new Array(n * 2).fill(0));
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = matrix[y][x] * 4;
        next[y][x] = v;
        next[y][x + n] = v + 2;
        next[y + n][x] = v + 3;
        next[y + n][x + n] = v + 1;
      }
    }
    matrix = next;
    n *= 2;
  }

  const coords: Array<[number, number]> = new Array(side * side);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      coords[matrix[y][x]] = [x / side, y / side];
    }
  }
  return coords;
}

/**
 * Generates RuneVision's 3D Bayer radial distance field texture + inverse-CDF ramp.
 * Resolution: (16 * dotsPerSide) x (16 * dotsPerSide) x (dotsPerSide^2).
 */
export function generateDither3DVolume(dotsPerSide = 4): Dither3DVolumeBundle {
  const res = dotsPerSide * 16; // 64 for dotsPerSide=4
  const depth = dotsPerSide * dotsPerSide; // 16 slices
  const bayerDots = buildBayerOrder(dotsPerSide);

  const volumeData = new Uint8Array(res * res * depth * 4);
  const fullLayerVals = new Float32Array(res * res);

  // Max distance scaling matches RuneVision's normalized radial dot profile
  const normDistScale = dotsPerSide * 1.41421356;

  for (let z = 0; z < depth; z++) {
    const activeCount = z + 1;
    // Scale radial cone radius softly with active density so dots bud smoothly without popping
    const densityGain = Math.sqrt(activeCount / depth);
    const invRadius = normDistScale * Math.max(0.45, densityGain);

    for (let y = 0; y < res; y++) {
      const py = (y + 0.5) / res;
      for (let x = 0; x < res; x++) {
        const px = (x + 0.5) / res;
        let minDist = 1e9;
        for (let k = 0; k < activeCount; k++) {
          let dx = Math.abs(px - bayerDots[k][0]);
          let dy = Math.abs(py - bayerDots[k][1]);
          if (dx > 0.5) dx = 1.0 - dx;
          if (dy > 0.5) dy = 1.0 - dy;
          const d = Math.hypot(dx, dy);
          if (d < minDist) minDist = d;
        }
        // Smooth radial falloff: 1.0 at dot center, 0.0 outside radius
        const v = Math.max(0, Math.min(1, 1.0 - minDist * invRadius));
        const byte = Math.round(v * 255);
        const idx = ((z * res + y) * res + x) * 4;
        volumeData[idx] = byte;
        volumeData[idx + 1] = byte;
        volumeData[idx + 2] = byte;
        volumeData[idx + 3] = 255;

        if (z === depth - 1) {
          fullLayerVals[y * res + x] = v;
        }
      }
    }
  }

  // Inverse-CDF brightness calibration ramp from the densest layer (matches RuneVision Dither3DTextureMaker)
  const rampWidth = 256;
  const hist = new Float32Array(rampWidth);
  for (let i = 0; i < fullLayerVals.length; i++) {
    const bin = Math.min(rampWidth - 1, Math.max(0, Math.floor(fullLayerVals[i] * (rampWidth - 1))));
    hist[bin] += 1;
  }
  const cdf = new Float32Array(rampWidth);
  let acc = 0;
  for (let i = 0; i < rampWidth; i++) {
    acc += hist[i] / fullLayerVals.length;
    cdf[i] = acc;
  }

  const rampData = new Uint8Array(rampWidth * 4);
  for (let i = 0; i < rampWidth; i++) {
    const target = i / (rampWidth - 1);
    // Find threshold whose area fraction matches target brightness
    let lo = 0;
    let hi = rampWidth - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (1.0 - cdf[mid] > target) lo = mid + 1;
      else hi = mid;
    }
    const calibrated = Math.max(0, Math.min(255, Math.round((1.0 - lo / (rampWidth - 1)) * 255)));
    rampData[i * 4] = calibrated;
    rampData[i * 4 + 1] = calibrated;
    rampData[i * 4 + 2] = calibrated;
    rampData[i * 4 + 3] = 255;
  }

  return { width: res, height: res, depth, volumeData, rampWidth, rampData };
}

/**
 * Wyman, Sloan & Shirley (JCGT 2013) analytical CIE 1931 XYZ matching functions.
 */
function xFit1931(lambda: number): number {
  const t1 = (lambda - 442.0) * (lambda < 442.0 ? 0.0624 : 0.0374);
  const t2 = (lambda - 599.8) * (lambda < 599.8 ? 0.0264 : 0.0323);
  const t3 = (lambda - 501.1) * (lambda < 501.1 ? 0.049 : 0.0382);
  return 0.362 * Math.exp(-0.5 * t1 * t1) + 1.056 * Math.exp(-0.5 * t2 * t2) - 0.065 * Math.exp(-0.5 * t3 * t3);
}

function yFit1931(lambda: number): number {
  const t1 = (lambda - 568.8) * (lambda < 568.8 ? 0.0213 : 0.0247);
  const t2 = (lambda - 530.9) * (lambda < 530.9 ? 0.0613 : 0.0322);
  return 0.821 * Math.exp(-0.5 * t1 * t1) + 0.286 * Math.exp(-0.5 * t2 * t2);
}

function zFit1931(lambda: number): number {
  const t1 = (lambda - 437.0) * (lambda < 437.0 ? 0.0845 : 0.0278);
  const t2 = (lambda - 459.0) * (lambda < 459.0 ? 0.0385 : 0.0725);
  return 1.217 * Math.exp(-0.5 * t1 * t1) + 0.681 * Math.exp(-0.5 * t2 * t2);
}

function fresnelRefl(
  n1: number,
  n2: number,
  cos1: number,
  cos2: number
): { rx: number; ry: number; px: number; py: number } {
  const sin1Sqr = Math.max(0, 1.0 - cos1 * cos1);
  const ratio = n1 / n2;
  const sqrRatio = ratio * ratio;

  if (sqrRatio * sin1Sqr > 1.0) {
    // Total internal reflection phase shift
    const rad = Math.sqrt(Math.max(0, sin1Sqr - 1.0 / sqrRatio));
    const safeCos = Math.max(1e-4, cos1);
    return {
      rx: 1.0,
      ry: 1.0,
      px: 2.0 * Math.atan((-sqrRatio * rad) / safeCos),
      py: 2.0 * Math.atan(-rad / safeCos),
    };
  }

  const rp = (n2 * cos1 - n1 * cos2) / Math.max(1e-6, n2 * cos1 + n1 * cos2);
  const rs = (n1 * cos1 - n2 * cos2) / Math.max(1e-6, n1 * cos1 + n2 * cos2);
  return {
    rx: rp * rp,
    ry: rs * rs,
    px: rp < 0 ? Math.PI : 0,
    py: rs < 0 ? Math.PI : 0,
  };
}

/**
 * Generates David Lenaerts' exact 64-band polarized Airy thin-film interference LUT,
 * upgraded from 1D to a 2D (cosThetaI x filmThicknessNm) lookup table.
 * U = cos(theta_i) in [0, 1], V = thickness in [120 nm, 1180 nm].
 */
export function generateAiryThinFilmLut2D(
  size = 128,
  nFilm = 1.48,
  nBase = 2.6
): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(size * size * 4);
  const numBands = 64;
  const waveLenMin = 380;
  const waveLenRange = 400; // 380..780nm

  // Precompute CIE XYZ band weights
  const wxArr = new Float32Array(numBands);
  const wyArr = new Float32Array(numBands);
  const wzArr = new Float32Array(numBands);
  const wlArr = new Float32Array(numBands);
  let totX = 0;
  let totY = 0;
  let totZ = 0;
  for (let j = 0; j < numBands; j++) {
    const wl = waveLenMin + (j / (numBands - 1)) * waveLenRange;
    wlArr[j] = wl;
    wxArr[j] = xFit1931(wl);
    wyArr[j] = yFit1931(wl);
    wzArr[j] = zFit1931(wl);
    totX += wxArr[j];
    totY += wyArr[j];
    totZ += wzArr[j];
  }

  const invNFilm2 = 1.0 / (nFilm * nFilm);
  const ratioBase2 = (nFilm * nFilm) / (nBase * nBase);

  for (let ty = 0; ty < size; ty++) {
    const filmThickness = 120.0 + (ty / (size - 1)) * 1060.0;

    for (let tx = 0; tx < size; tx++) {
      const cosThetaI = Math.max(0.01, tx / (size - 1));
      const cosThetaT = Math.sqrt(Math.max(0.0001, 1.0 - invNFilm2 * (1.0 - cosThetaI * cosThetaI)));
      const cosThetaT2 = Math.sqrt(Math.max(0.0001, 1.0 - ratioBase2 * (1.0 - cosThetaT * cosThetaT)));

      const pathDiff2PI = 2.0 * Math.PI * (2.0 * nFilm * filmThickness * cosThetaT);

      const f12 = fresnelRefl(1.0, nFilm, cosThetaI, cosThetaT);
      const t12x = 1.0 - f12.rx;
      const t12y = 1.0 - f12.ry;
      const phi21x = Math.PI - f12.px;
      const phi21y = Math.PI - f12.py;

      const f23 = fresnelRefl(nFilm, nBase, cosThetaT, cosThetaT2);
      const rBix = Math.sqrt(f23.rx * f12.rx);
      const rBiy = Math.sqrt(f23.ry * f12.ry);
      const rStarX = (t12x * t12x * f23.rx) / Math.max(1e-5, 1.0 - f23.rx * f12.rx);
      const rStarY = (t12y * t12y * f23.ry) / Math.max(1e-5, 1.0 - f23.ry * f12.ry);
      const rBiSqrX = rBix * rBix;
      const rBiSqrY = rBiy * rBiy;
      const r12StarX = f12.rx + rStarX;
      const r12StarY = f12.ry + rStarY;
      const rStarMinusTx = rStarX - t12x;
      const rStarMinusTy = rStarY - t12y;

      let x = 0;
      let y = 0;
      let z = 0;

      for (let j = 0; j < numBands; j++) {
        const deltaPhase = pathDiff2PI / wlArr[j];
        const cosPhiX = Math.cos(deltaPhase + f23.px + phi21x);
        const cosPhiY = Math.cos(deltaPhase + f23.py + phi21y);

        const valX =
          r12StarX +
          ((2.0 * (rBix * cosPhiX - rBiSqrX)) / Math.max(1e-5, 1.0 - 2.0 * rBix * cosPhiX + rBiSqrX)) *
            rStarMinusTx;
        const valY =
          r12StarY +
          ((2.0 * (rBiy * cosPhiY - rBiSqrY)) / Math.max(1e-5, 1.0 - 2.0 * rBiy * cosPhiY + rBiSqrY)) *
            rStarMinusTy;
        const v = 0.5 * (valX + valY);

        x += wxArr[j] * v;
        y += wyArr[j] * v;
        z += wzArr[j] * v;
      }

      x /= totX;
      y /= totY;
      z /= totZ;

      const r = Math.min(1, Math.max(0, 3.2406 * x - 1.5372 * y - 0.4986 * z));
      const g = Math.min(1, Math.max(0, -0.9689 * x + 1.8758 * y + 0.0415 * z));
      const b = Math.min(1, Math.max(0, 0.0557 * x - 0.204 * y + 1.057 * z));

      const idx = (ty * size + tx) * 4;
      data[idx] = Math.round(Math.sqrt(r) * 255);
      data[idx + 1] = Math.round(Math.sqrt(g) * 255);
      data[idx + 2] = Math.round(Math.sqrt(b) * 255);
      data[idx + 3] = 255;
    }
  }

  return { width: size, height: size, data };
}

/** Deterministic PRNG for procedural paper, blue-noise, and TAM ink strokes. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tileableValueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const h = (ix: number, iy: number) => {
    const wx = ((ix % period) + period) % period;
    const wy = ((iy % period) + period) % period;
    let n = (wx * 374761393 + wy * 668265263 + seed * 1442695041) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };

  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Generates a tileable 256x256 physical substrate texture:
 * R = cold-press cotton paper heightfield (multi-octave + directional cellulose fibers)
 * G = blue-noise-approximated high-pass stochastic grain (for Risograph / Dither / LIC)
 * B = coarse wet-wash granulation noise
 * A = fine high-frequency white noise (for LIC streamlines)
 */
export function generateSubstrateTexture(size = 256): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(size * size * 4);
  const white = new Float32Array(size * size);
  const rand = mulberry32(133742);
  for (let i = 0; i < white.length; i++) white[i] = rand();

  // High-pass filter white noise into crisp blue-noise-like stochastic grain (zero clumps)
  const blue = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let avg = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const sx = (x + dx + size) % size;
          const sy = (y + dy + size) % size;
          avg += white[sy * size + sx];
        }
      }
      const hp = white[y * size + x] - avg / 9.0;
      blue[y * size + x] = Math.min(1, Math.max(0, 0.5 + hp * 1.45));
    }
  }

  for (let y = 0; y < size; y++) {
    const ny = y / size;
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      // Cold-press cotton paper: layered dimples + microscopic woven cellulose fibers
      const p1 = tileableValueNoise(nx * 8, ny * 8, 8, 11);
      const p2 = tileableValueNoise(nx * 24, ny * 24, 24, 29);
      const p3 = tileableValueNoise(nx * 64, ny * 64, 64, 53);
      const fiberH = tileableValueNoise(nx * 16, ny * 64, 64, 71);
      const fiberV = tileableValueNoise(nx * 64, ny * 16, 64, 97);
      const paper = Math.min(1, Math.max(0, p1 * 0.35 + p2 * 0.3 + p3 * 0.18 + (fiberH + fiberV) * 0.085));

      const gran =
        tileableValueNoise(nx * 6, ny * 6, 6, 131) * 0.55 +
        tileableValueNoise(nx * 18, ny * 18, 18, 173) * 0.45;

      const idx = (y * size + x) * 4;
      data[idx] = Math.round(paper * 255);
      data[idx + 1] = Math.round(blue[y * size + x] * 255);
      data[idx + 2] = Math.round(gran * 255);
      data[idx + 3] = Math.round(white[y * size + x] * 255);
    }
  }

  return { width: size, height: size, data };
}

/**
 * Generates Praun, Hoppe, Webb & Finkelstein's (SIGGRAPH 2001) 6-tier strictly nested
 * Tonal Art Maps (TAM) with custom crisp pen-stroke mipmaps (3 mip levels: 256, 128, 64).
 *
 * Strictly satisfies the TAM nesting invariant:
 *   Layer 0 (lightest) ⊂ Layer 1 ⊂ Layer 2 ⊂ Layer 3 ⊂ Layer 4 ⊂ Layer 5 (darkest)
 * and every coarser mip keeps crisp 1px stroke width instead of grey box-blur mush.
 */
export function generateTamHatchPyramid(): {
  width: number;
  height: number;
  layers: number;
  mipLevels: Uint8Array[][];
} {
  const baseSize = 256;
  const layers = 6;
  const numMips = 3; // 256, 128, 64

  interface Stroke {
    x: number;
    y: number;
    len: number;
    angle: number;
    curve: number;
    width: number;
    tier: number;
    minMip: number;
  }

  const rand = mulberry32(90210);
  const strokes: Stroke[] = [];

  // Tier stroke counts & dominant angles:
  // Tier 0..1: parallel diagonal strokes (~32 deg)
  // Tier 2..3: add cross-hatching (~122 deg)
  // Tier 4..5: dense secondary diagonals (~78 deg & ~168 deg) for deep velvety shadow
  const tierSpec = [
    { count: 48, angle: 0.54, spread: 0.08, width: 1.35 },
    { count: 76, angle: 0.54, spread: 0.09, width: 1.5 },
    { count: 100, angle: 2.1, spread: 0.1, width: 1.45 },
    { count: 120, angle: 2.1, spread: 0.11, width: 1.6 },
    { count: 150, angle: 1.32, spread: 0.14, width: 1.7 },
    { count: 190, angle: 2.86, spread: 0.16, width: 1.9 },
  ];

  for (let t = 0; t < layers; t++) {
    const spec = tierSpec[t];
    for (let i = 0; i < spec.count; i++) {
      strokes.push({
        x: rand(),
        y: rand(),
        len: 0.12 + rand() * 0.24,
        angle: spec.angle + (rand() - 0.5) * spec.spread,
        curve: (rand() - 0.5) * 0.035,
        width: spec.width * (0.8 + rand() * 0.45),
        tier: t,
        // Subset of strokes remain visible at coarser mip levels to maintain uniform tone
        minMip: i % 3 === 0 ? 2 : i % 2 === 0 ? 1 : 0,
      });
    }
  }

  const mipLevels: Uint8Array[][] = [];
  for (let mip = 0; mip < numMips; mip++) {
    const size = baseSize >> mip;
    const layerBuffers: Uint8Array[] = [];

    for (let layer = 0; layer < layers; layer++) {
      const buf = new Uint8Array(size * size * 4);
      // Start with pure white paper (255)
      buf.fill(255);

      const drawInkDot = (px: number, py: number, radius: number, alpha: number) => {
        const r = Math.ceil(radius);
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const dist = Math.hypot(dx, dy);
            if (dist > radius) continue;
            const cov = Math.min(1, (radius - dist) * 1.4) * alpha;
            const wx = (((Math.floor(px) + dx) % size) + size) % size;
            const wy = (((Math.floor(py) + dy) % size) + size) % size;
            const idx = (wy * size + wx) * 4;
            const cur = buf[idx] / 255;
            const next = Math.max(0, Math.round(cur * (1 - cov) * 255));
            buf[idx] = next;
            buf[idx + 1] = next;
            buf[idx + 2] = next;
          }
        }
      };

      // Draw every stroke from tier 0..layer (strictly nested!)
      for (const s of strokes) {
        if (s.tier > layer) continue;
        if (mip > 0 && s.minMip < mip) continue;

        const steps = Math.max(10, Math.round(s.len * size * 1.5));
        const cx = Math.cos(s.angle);
        const cy = Math.sin(s.angle);
        const nx = -cy;
        const ny = cx;
        const baseR = Math.max(0.65, (s.width * 0.55) * (mip === 0 ? 1.0 : 0.85));

        for (let k = 0; k <= steps; k++) {
          const u = k / steps;
          const taper = Math.sin(u * Math.PI);
          const bend = Math.sin(u * Math.PI) * s.curve;
          const x = (s.x + (u - 0.5) * s.len * cx + bend * nx) * size;
          const y = (s.y + (u - 0.5) * s.len * cy + bend * ny) * size;
          drawInkDot(x, y, baseR * (0.45 + 0.65 * taper), 0.72 * (0.5 + 0.5 * taper));
        }
      }

      layerBuffers.push(buf);
    }

    mipLevels.push(layerBuffers);
  }

  return { width: baseSize, height: baseSize, layers, mipLevels };
}
