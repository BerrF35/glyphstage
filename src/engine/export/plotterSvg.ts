/**
 * True Pen-Plotter Vector SVG Exporters (AxiDraw / Bantam / Plotter-ready)
 *
 * 1. SquiggleCam / SquiggleDraw Continuous FM/AM Wave SVG (fixing upstream RGB indexing bug)
 * 2. Adrian Secord (NPAR 2002) / Windell Oskay (StippleGen) Weighted Voronoi Stipple
 *    + Greedy Nearest-Neighbor & 2-Opt Untangled Single-Line TSP SVG!
 * 3. Topographic Marching-Squares Contour Map SVG
 */

function sampleLumaBottomUp(
  pixels: Uint8Array,
  width: number,
  height: number,
  nx: number,
  ny: number
): number {
  const sx = Math.max(0, Math.min(width - 1, Math.floor(nx * width)));
  // WebGL readPixels is bottom-up, while SVG y=0 is top
  const sy = Math.max(0, Math.min(height - 1, Math.floor((1 - ny) * (height - 1))));
  const idx = (sy * width + sx) * 4;
  // Fixed RGB channel indices (fixing SquiggleCam's upstream 4*(idx+1) bug!)
  const r = pixels[idx];
  const g = pixels[idx + 1];
  const b = pixels[idx + 2];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export interface SquiggleSvgOptions {
  lineCount?: number;
  frequency?: number;
  amplitude?: number;
  invert?: boolean;
  strokeColor?: string;
  bgColor?: string;
}

export function generateSquiggleSvg(
  pixels: Uint8Array,
  width: number,
  height: number,
  opts: SquiggleSvgOptions = {}
): string {
  const svgW = 1000;
  const svgH = Math.round(svgW * (height / Math.max(1, width)));
  const lineCount = Math.max(18, Math.min(110, Math.round(opts.lineCount ?? 54)));
  const freqGain = opts.frequency ?? 0.52;
  const ampGain = opts.amplitude ?? 0.65;
  const invert = opts.invert ?? false;
  const strokeColor = opts.strokeColor ?? '#121318';
  const bgColor = opts.bgColor ?? '#f6f2e8';

  const rowH = svgH / lineCount;
  const samples = 240;
  const paths: string[] = [];

  for (let row = 0; row < lineCount; row++) {
    const ny = (row + 0.5) / lineCount;
    const baseY = ny * svgH;
    let phase = 0;
    const coords: string[] = [];

    for (let i = 0; i <= samples; i++) {
      const nx = i / samples;
      let lum = sampleLumaBottomUp(pixels, width, height, nx, ny);
      if (invert) lum = 1 - lum;
      const z = Math.max(0, 1 - lum);

      phase += z * freqGain * 2.2;
      const r = z * rowH * 0.52 * ampGain;
      const x = (nx * svgW).toFixed(1);
      const y = (baseY + Math.sin(phase) * r).toFixed(1);
      coords.push(i === 0 ? `M${x} ${y}` : `L${x} ${y}`);
    }

    paths.push(
      `<path d="${coords.join(' ')}" fill="none" stroke="${strokeColor}" stroke-width="0.95" stroke-linecap="round" stroke-linejoin="round"/>`
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  <g id="squiggle-plotter-paths">
    ${paths.join('\n    ')}
  </g>
</svg>`;
}

export interface StippleTspSvgOptions {
  pointCount?: number;
  relaxIters?: number;
  tspSingleLine?: boolean;
  invert?: boolean;
  strokeColor?: string;
  bgColor?: string;
}

/**
 * Generates Windell Oskay (StippleGen) / Adrian Secord weighted stipples or a single unbroken
 * 2-opt untangled Traveling Salesman (TSP) pen-plotter path!
 */
export function generateStippleTspSvg(
  pixels: Uint8Array,
  width: number,
  height: number,
  opts: StippleTspSvgOptions = {}
): string {
  const svgW = 1000;
  const svgH = Math.round(svgW * (height / Math.max(1, width)));
  const targetN = Math.max(120, Math.min(1800, Math.round(opts.pointCount ?? 900)));
  const relaxIters = Math.max(1, Math.min(10, Math.round(opts.relaxIters ?? 4)));
  const invert = opts.invert ?? false;
  const strokeColor = opts.strokeColor ?? '#121318';
  const bgColor = opts.bgColor ?? '#f6f2e8';

  // Deterministic PRNG for repeatable exports
  let seed = 421337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // 1. Rejection sampling weighted by darkness (Secord / StippleGen)
  const ptsX = new Float32Array(targetN);
  const ptsY = new Float32Array(targetN);
  const ptsW = new Float32Array(targetN);
  let placed = 0;
  let attempts = 0;
  while (placed < targetN && attempts < targetN * 35) {
    attempts++;
    const rx = rand();
    const ry = rand();
    let lum = sampleLumaBottomUp(pixels, width, height, rx, ry);
    if (invert) lum = 1 - lum;
    const dark = 1 - lum;
    if (rand() < dark * 0.96 + 0.04) {
      ptsX[placed] = rx * svgW;
      ptsY[placed] = ry * svgH;
      ptsW[placed] = dark;
      placed++;
    }
  }
  const n = placed;

  // 2. Density-weighted spatial repulsion / Lloyd relaxation approximation (fast grid-bucketed)
  const gridW = 96;
  const gridH = Math.max(48, Math.round(gridW * (svgH / svgW)));
  const sumX = new Float32Array(n);
  const sumY = new Float32Array(n);
  const sumW = new Float32Array(n);

  for (let iter = 0; iter < relaxIters; iter++) {
    sumX.fill(0);
    sumY.fill(0);
    sumW.fill(0);

    for (let gy = 0; gy < gridH; gy++) {
      const ny = (gy + 0.5) / gridH;
      const py = ny * svgH;
      for (let gx = 0; gx < gridW; gx++) {
        const nx = (gx + 0.5) / gridW;
        const px = nx * svgW;
        let lum = sampleLumaBottomUp(pixels, width, height, nx, ny);
        if (invert) lum = 1 - lum;
        // StippleGen non-zero density floor: 1.001 - lum
        const density = 1.001 - lum;

        let best = 0;
        let bestD = 1e12;
        for (let i = 0; i < n; i++) {
          const dx = px - ptsX[i];
          const dy = py - ptsY[i];
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        sumX[best] += px * density;
        sumY[best] += py * density;
        sumW[best] += density;
      }
    }

    for (let i = 0; i < n; i++) {
      if (sumW[i] > 1e-4) {
        ptsX[i] = ptsX[i] * 0.25 + (sumX[i] / sumW[i]) * 0.75;
        ptsY[i] = ptsY[i] * 0.25 + (sumY[i] / sumW[i]) * 0.75;
      }
    }
  }

  if (!opts.tspSingleLine) {
    const circles: string[] = [];
    for (let i = 0; i < n; i++) {
      const r = (1.1 + ptsW[i] * 2.4).toFixed(2);
      circles.push(
        `<circle cx="${ptsX[i].toFixed(1)}" cy="${ptsY[i].toFixed(1)}" r="${r}" fill="${strokeColor}"/>`
      );
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  <g id="voronoi-stipples">
    ${circles.join('\n    ')}
  </g>
</svg>`;
  }

  // 3. Greedy Nearest-Neighbor TSP Tour + 2-Opt Crossing Untangling (Windell Oskay StippleGen)
  const visited = new Uint8Array(n);
  const tour = new Int32Array(n);
  let cur = 0;
  visited[0] = 1;
  tour[0] = 0;

  for (let step = 1; step < n; step++) {
    let best = -1;
    let bestD = 1e12;
    const cx = ptsX[cur];
    const cy = ptsY[cur];
    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      const dx = ptsX[j] - cx;
      const dy = ptsY[j] - cy;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best < 0) break;
    visited[best] = 1;
    tour[step] = best;
    cur = best;
  }

  // 2-Opt crossing untangling passes
  const distSq = (a: number, b: number) => {
    const dx = ptsX[a] - ptsX[b];
    const dy = ptsY[a] - ptsY[b];
    return dx * dx + dy * dy;
  };
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (let i = 0; i < n - 3; i++) {
      const a = tour[i];
      const b = tour[i + 1];
      const dAB = distSq(a, b);
      for (let j = i + 2; j < n - 1; j++) {
        const c = tour[j];
        const d = tour[j + 1];
        if (distSq(a, c) + distSq(b, d) < dAB + distSq(c, d) - 0.5) {
          // Reverse tour segment [i+1 .. j]
          let l = i + 1;
          let r = j;
          while (l < r) {
            const tmp = tour[l];
            tour[l] = tour[r];
            tour[r] = tmp;
            l++;
            r--;
          }
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  const cmds: string[] = [];
  for (let i = 0; i < n; i++) {
    const idx = tour[i];
    cmds.push(`${i === 0 ? 'M' : 'L'}${ptsX[idx].toFixed(1)} ${ptsY[idx].toFixed(1)}`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  <path id="tsp-single-line" d="${cmds.join(' ')}" fill="none" stroke="${strokeColor}" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

export interface ContourSvgOptions {
  levels?: number;
  strokeColor?: string;
  bgColor?: string;
}

/**
 * Generates a crisp Marching-Squares Topographic Contour Vector SVG for pen plotters.
 */
export function generateContourSvg(
  pixels: Uint8Array,
  width: number,
  height: number,
  opts: ContourSvgOptions = {}
): string {
  const svgW = 1000;
  const svgH = Math.round(svgW * (height / Math.max(1, width)));
  const levels = Math.max(4, Math.min(24, Math.round(opts.levels ?? 12)));
  const strokeColor = opts.strokeColor ?? '#1a1714';
  const bgColor = opts.bgColor ?? '#f5f0e6';

  const gw = 110;
  const gh = Math.max(60, Math.round(gw * (svgH / svgW)));
  const grid = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      grid[y * gw + x] = sampleLumaBottomUp(pixels, width, height, x / (gw - 1), y / (gh - 1));
    }
  }

  const segs: string[] = [];
  for (let lv = 1; lv < levels; lv++) {
    const th = lv / levels;
    const isMajor = lv % 4 === 0;
    const dParts: string[] = [];

    for (let y = 0; y < gh - 1; y++) {
      for (let x = 0; x < gw - 1; x++) {
        const a = grid[y * gw + x];
        const b = grid[y * gw + x + 1];
        const c = grid[(y + 1) * gw + x + 1];
        const d = grid[(y + 1) * gw + x];
        const code = (a > th ? 1 : 0) | (b > th ? 2 : 0) | (c > th ? 4 : 0) | (d > th ? 8 : 0);
        if (code === 0 || code === 15) continue;

        const lerp = (v0: number, v1: number) =>
          Math.max(0, Math.min(1, (th - v0) / (Math.abs(v1 - v0) > 1e-4 ? v1 - v0 : 1e-4)));

        const pts: Array<[number, number]> = [];
        const sx = svgW / (gw - 1);
        const sy = svgH / (gh - 1);
        if ((a > th) !== (b > th)) pts.push([(x + lerp(a, b)) * sx, y * sy]);
        if ((b > th) !== (c > th)) pts.push([(x + 1) * sx, (y + lerp(b, c)) * sy]);
        if ((c > th) !== (d > th)) pts.push([(x + lerp(d, c)) * sx, (y + 1) * sy]);
        if ((d > th) !== (a > th)) pts.push([x * sx, (y + lerp(a, d)) * sy]);

        if (pts.length >= 2) {
          dParts.push(
            `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}L${pts[1][0].toFixed(1)} ${pts[1][1].toFixed(1)}`
          );
        }
        if (pts.length === 4) {
          dParts.push(
            `M${pts[2][0].toFixed(1)} ${pts[2][1].toFixed(1)}L${pts[3][0].toFixed(1)} ${pts[3][1].toFixed(1)}`
          );
        }
      }
    }

    if (dParts.length > 0) {
      segs.push(
        `<path d="${dParts.join('')}" fill="none" stroke="${strokeColor}" stroke-width="${isMajor ? '1.35' : '0.7'}" stroke-opacity="${isMajor ? '0.92' : '0.58'}"/>`
      );
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  <g id="topographic-contours">
    ${segs.join('\n    ')}
  </g>
</svg>`;
}
