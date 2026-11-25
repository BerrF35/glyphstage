import { PALETTE_MAP } from '@/engine/presets/palettes';
import {
  MAIN_ROWS,
  normalizeCustomRamp,
  SHAPE6D_POINTS,
  type Shape6DAtlasBundle,
} from '@/engine/webgl/fontAtlas';
import type { StudioState } from '@/types/studio';

export interface SampledCell {
  char: string;
  r: number;
  g: number;
  b: number;
  br?: number;
  bg?: number;
  bb?: number;
}

export interface SampledAsciiFrame {
  cols: number;
  rows: number;
  bg: string;
  cells: SampledCell[];
}

const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
].map((v) => (v + 0.5) / 16);

const QUADRANT_CHARS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█';
const WOODCUT_CHARS = ' .---///\\\\\\+=###';
const EDGE_CHARS = [' ', '—', '|', '/', '\\'];

function bayerAt(x: number, y: number): number {
  return BAYER4[((y & 3) << 2) | (x & 3)];
}

function lumaRgb(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-5, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hexToRgb255(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const n = parseInt(c, 16);
  if (Number.isNaN(n) || c.length !== 6) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mapColor(
  lum: number,
  srcR: number,
  srcG: number,
  srcB: number,
  state: StudioState,
  accentBoost: number
): [number, number, number] {
  const pal = PALETTE_MAP[state.palette];
  const low = hexToRgb255(pal.low);
  const mid = hexToRgb255(pal.mid);
  const high = hexToRgb255(pal.high);
  const acc = hexToRgb255(pal.accent);

  let r: number;
  let g: number;
  let b: number;

  if (pal.useSourceColor) {
    const gain = 0.78 + lum * 0.45;
    r = Math.min(255, srcR * gain);
    g = Math.min(255, srcG * gain);
    b = Math.min(255, srcB * gain);
  } else if (lum < 0.5) {
    const t = lum * 2;
    r = lerp(low[0], mid[0], t);
    g = lerp(low[1], mid[1], t);
    b = lerp(low[2], mid[2], t);
  } else {
    const t = (lum - 0.5) * 2;
    r = lerp(mid[0], high[0], t);
    g = lerp(mid[1], high[1], t);
    b = lerp(mid[2], high[2], t);
  }

  const ab = Math.max(0, Math.min(1, accentBoost));
  return [
    Math.round(lerp(r, acc[0], ab)),
    Math.round(lerp(g, acc[1], ab)),
    Math.round(lerp(b, acc[2], ab)),
  ];
}

// Convert GPU scene + edge buffers (bottom-up WebGL layout) into exact text cells
export function sampleAsciiGrid(
  scenePixels: Uint8Array,
  edgePixels: Uint8Array,
  bufW: number,
  bufH: number,
  cols: number,
  rows: number,
  state: StudioState,
  shapeBundle?: Shape6DAtlasBundle
): SampledAsciiFrame {
  const pal = PALETTE_MAP[state.palette];
  const bgRgb = hexToRgb255(pal.bg);
  const cells: SampledCell[] = new Array(cols * rows);
  const phraseChars = Array.from(state.phrase.length > 0 ? state.phrase.slice(0, 64) : 'GLYPHSTAGE ');
  const customRampChars = Array.from(normalizeCustomRamp(state.customRamp));

  const sampleRgb = (u: number, vTopDown: number): [number, number, number] => {
    const sx = Math.max(0, Math.min(bufW - 1, Math.floor(u * bufW)));
    const sy = Math.max(0, Math.min(bufH - 1, Math.floor((1 - vTopDown) * bufH)));
    const idx = (sy * bufW + sx) * 4;
    return [scenePixels[idx], scenePixels[idx + 1], scenePixels[idx + 2]];
  };

  const sampleEdge = (u: number, vTopDown: number): [number, number, number, number] => {
    const sx = Math.max(0, Math.min(bufW - 1, Math.floor(u * bufW)));
    const sy = Math.max(0, Math.min(bufH - 1, Math.floor((1 - vTopDown) * bufH)));
    const idx = (sy * bufW + sx) * 4;
    return [
      edgePixels[idx] / 255,
      edgePixels[idx + 1] / 255,
      edgePixels[idx + 2] / 255,
      edgePixels[idx + 3] / 255,
    ];
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const u = (col + 0.5) / cols;
      const v = (row + 0.5) / rows;
      const [sr, sg, sb] = sampleRgb(u, v);
      const [edgeMag, dirCode, rawLum, depthMask] = sampleEdge(u, v);

      const lum = state.fx.invert ? 1 - rawLum : rawLum;
      const bayer = bayerAt(col, row) - 0.5;
      // Match GPU void-gating so empty backgrounds never speckle with stray dots
      const ditherGate = smoothstep(0.015, 0.06, lum + depthMask);
      const dithered = Math.max(0, Math.min(1, lum + bayer * state.fx.dither * 0.42 * ditherGate));

      if (state.style === 'ansi') {
        const [tr, tg, tb] = sampleRgb(u, (row + 0.25) / rows);
        const [br0, bg0, bb0] = sampleRgb(u, (row + 0.75) / rows);
        let topL = lumaRgb(tr, tg, tb);
        let botL = lumaRgb(br0, bg0, bb0);
        if (state.fx.invert) {
          topL = 1 - topL;
          botL = 1 - botL;
        }
        const topCol = topL < 0.03 ? bgRgb : mapColor(topL, tr, tg, tb, state, 0);
        const botCol = botL < 0.03 ? bgRgb : mapColor(botL, br0, bg0, bb0, state, 0);
        cells[row * cols + col] = {
          char: '▀',
          r: topCol[0],
          g: topCol[1],
          b: topCol[2],
          br: botCol[0],
          bg: botCol[1],
          bb: botCol[2],
        };
        continue;
      }

      let ch = ' ';
      let accentBoost = 0;

      if (state.style === 'shape6d' && shapeBundle && shapeBundle.vectors.length > 0) {
        const vec = SHAPE6D_POINTS.map(([px, py]) => {
          const [r0, g0, b0] = sampleRgb((col + px) / cols, (row + py) / rows);
          const l = lumaRgb(r0, g0, b0);
          return state.fx.invert ? 1 - l : l;
        });
        const maxV = Math.max(...vec);
        if (maxV < 0.045) {
          ch = ' ';
        } else {
          const exp = 1.0 + Math.max(0, state.fx.shapeCrunch) * 1.3;
          const crunched = vec.map((val) => Math.pow(val / maxV, exp) * maxV);
          let bestIdx = 0;
          let bestDist = Infinity;
          for (let i = 0; i < shapeBundle.vectors.length; i++) {
            const gv = shapeBundle.vectors[i];
            let d = 0;
            for (let k = 0; k < 6; k++) {
              const diff = crunched[k] - gv[k];
              d += diff * diff;
            }
            if (d < bestDist) {
              bestDist = d;
              bestIdx = i;
            }
          }
          ch = shapeBundle.chars[bestIdx] ?? ' ';
        }
      } else if (state.style === 'braille') {
        const bitMap = [
          [0x01, 0x08],
          [0x02, 0x10],
          [0x04, 0x20],
          [0x40, 0x80],
        ];
        let mask = 0;
        for (let py = 0; py < 4; py++) {
          for (let px = 0; px < 2; px++) {
            const su = (col + (px + 0.5) * 0.5) / cols;
            const sv = (row + (py + 0.5) * 0.25) / rows;
            const [r, g, b] = sampleRgb(su, sv);
            let sl = lumaRgb(r, g, b);
            if (state.fx.invert) sl = 1 - sl;
            const th = 0.28 * (1 - state.fx.dither) + bayerAt(col * 2 + px, row * 4 + py) * state.fx.dither;
            if (sl > th * 0.88 + 0.04) {
              mask |= bitMap[py][px];
            }
          }
        }
        ch = String.fromCharCode(0x2800 + mask);
      } else if (state.style === 'blocks') {
        let qmask = 0;
        for (let py = 0; py < 2; py++) {
          for (let px = 0; px < 2; px++) {
            const su = (col + (px + 0.5) * 0.5) / cols;
            const sv = (row + (py + 0.5) * 0.5) / rows;
            const [r, g, b] = sampleRgb(su, sv);
            let sl = lumaRgb(r, g, b);
            if (state.fx.invert) sl = 1 - sl;
            const th = 0.26 * (1 - state.fx.dither) + bayerAt(col * 2 + px, row * 2 + py) * state.fx.dither;
            if (sl > th * 0.85 + 0.05) {
              qmask |= 1 << (py * 2 + px);
            }
          }
        }
        ch = QUADRANT_CHARS[qmask] ?? ' ';
      } else if (state.usePhrase && dithered > 0.08) {
        ch = phraseChars[(col + row * 5) % phraseChars.length] ?? ' ';
      } else if (state.useCustomRamp) {
        const idx = Math.max(0, Math.min(customRampChars.length - 1, Math.floor(dithered * (customRampChars.length - 0.01))));
        ch = customRampChars[idx] ?? ' ';
      } else {
        const isEdge =
          edgeMag > state.fx.edgeThreshold &&
          state.fx.edgeMix > 0.05 &&
          (lum > 0.04 || depthMask > 0.08);

        if (isEdge && (state.style === 'edge' || state.style === 'effulgence' || state.style === 'phosphor' || state.style === 'hatch')) {
          const eIdx = dirCode < 0.35 ? 1 : dirCode < 0.62 ? 2 : dirCode < 0.88 ? 3 : 4;
          ch = EDGE_CHARS[eIdx];
          accentBoost = Math.min(0.9, (edgeMag - state.fx.edgeThreshold) * 2.2 * state.fx.edgeMix);
        } else {
          const ramp =
            state.style === 'effulgence'
              ? MAIN_ROWS.effulgence
              : state.style === 'playcore'
                ? MAIN_ROWS.playcore
                : state.style === 'cascade'
                  ? MAIN_ROWS.cascade
                  : state.style === 'hatch'
                    ? WOODCUT_CHARS
                    : MAIN_ROWS.classic;
          const chars = Array.from(ramp);
          const idx = Math.max(0, Math.min(chars.length - 1, Math.floor(dithered * (chars.length - 0.01))));
          ch = chars[idx];
        }
      }

      const [r, g, b] = mapColor(lum, sr, sg, sb, state, accentBoost);
      cells[row * cols + col] = { char: ch, r, g, b };
    }
  }

  return { cols, rows, bg: pal.bg, cells };
}

export function frameToPlainText(frame: SampledAsciiFrame): string {
  const lines: string[] = [];
  for (let row = 0; row < frame.rows; row++) {
    let line = '';
    const offset = row * frame.cols;
    for (let col = 0; col < frame.cols; col++) {
      line += frame.cells[offset + col].char;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

// 24-bit TrueColor ANSI escape sequence export ready to cat in any modern terminal
export function frameToAnsiTerminal(frame: SampledAsciiFrame): string {
  const ESC = '\x1b';
  const [bgR, bgG, bgB] = hexToRgb255(frame.bg);
  const lines: string[] = [];

  for (let y = 0; y < frame.rows; y++) {
    let line = '';
    let lastFg = '';
    let lastBg = '';
    const base = y * frame.cols;

    for (let x = 0; x < frame.cols; x++) {
      const cell = frame.cells[base + x];
      const fgKey = `${cell.r};${cell.g};${cell.b}`;
      const br = cell.br ?? bgR;
      const bg = cell.bg ?? bgG;
      const bb = cell.bb ?? bgB;
      const bgKey = `${br};${bg};${bb}`;

      if (fgKey !== lastFg) {
        line += `${ESC}[38;2;${fgKey}m`;
        lastFg = fgKey;
      }
      if (bgKey !== lastBg) {
        line += `${ESC}[48;2;${bgKey}m`;
        lastBg = bgKey;
      }
      line += cell.char;
    }
    line += `${ESC}[0m`;
    lines.push(line);
  }
  return lines.join('\n');
}

function escapeHtml(ch: string): string {
  if (ch === '&') return '&amp;';
  if (ch === '<') return '&lt;';
  if (ch === '>') return '&gt;';
  return ch;
}

export function frameToColoredHtml(frame: SampledAsciiFrame): string {
  const rows: string[] = [];
  for (let y = 0; y < frame.rows; y++) {
    let line = '';
    const base = y * frame.cols;
    for (let x = 0; x < frame.cols; x++) {
      const cell = frame.cells[base + x];
      const hasBg = cell.br !== undefined && cell.bg !== undefined && cell.bb !== undefined;
      if (cell.char === ' ' && !hasBg) {
        line += ' ';
      } else {
        const bgCss = hasBg ? `;background:rgb(${cell.br},${cell.bg},${cell.bb})` : '';
        line += `<span style="color:rgb(${cell.r},${cell.g},${cell.b})${bgCss}">${escapeHtml(cell.char)}</span>`;
      }
    }
    rows.push(line);
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>glyphstage export</title>
<style>
  html, body { margin: 0; min-height: 100%; background: ${frame.bg}; display: grid; place-items: center; }
  pre { margin: 0; padding: 24px; font: 600 12px/1.15 "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace; letter-spacing: 0.02em; }
</style>
</head>
<body><pre>${rows.join('\n')}</pre></body>
</html>`;
}

// Self-contained embeddable responsive ASCII hero snippet for portfolios & sites
export function frameToEmbedSnippet(frame: SampledAsciiFrame, label = 'glyphstage'): string {
  const rows: string[] = [];
  for (let y = 0; y < frame.rows; y++) {
    let line = '';
    const base = y * frame.cols;
    for (let x = 0; x < frame.cols; x++) {
      const c = frame.cells[base + x];
      const hasBg = c.br !== undefined && c.bg !== undefined && c.bb !== undefined;
      if (c.char === ' ' && !hasBg) {
        line += ' ';
      } else {
        const bgCss = hasBg ? `;background:rgb(${c.br},${c.bg},${c.bb})` : '';
        line += `<span style="color:rgb(${c.r},${c.g},${c.b})${bgCss}">${escapeHtml(c.char)}</span>`;
      }
    }
    rows.push(line);
  }

  return `<!-- ${label} ASCII Embed -->
<figure style="margin:0;padding:16px;background:${frame.bg};border-radius:8px;overflow:auto;display:grid;place-items:center">
  <pre aria-label="${label} ASCII art" style="margin:0;font:600 clamp(6px,1.1vw,12px)/1.12 'IBM Plex Mono',ui-monospace,monospace;user-select:all">${rows.join('\n')}</pre>
</figure>`;
}

export function frameToSvg(frame: SampledAsciiFrame): string {
  const cw = 8.4;
  const ch = 13;
  const pad = 20;
  const width = Math.round(frame.cols * cw + pad * 2);
  const height = Math.round(frame.rows * ch + pad * 2);

  const rects: string[] = [];
  const lines: string[] = [];
  for (let y = 0; y < frame.rows; y++) {
    const py = (pad + (y + 1) * ch).toFixed(1);
    const ry = (pad + y * ch + 2).toFixed(1);
    let spans = '';
    const base = y * frame.cols;
    for (let x = 0; x < frame.cols; x++) {
      const cell = frame.cells[base + x];
      const px = (pad + x * cw).toFixed(1);
      if (cell.br !== undefined && cell.bg !== undefined && cell.bb !== undefined) {
        rects.push(
          `  <rect x="${px}" y="${ry}" width="${cw.toFixed(1)}" height="${ch}" fill="rgb(${cell.br},${cell.bg},${cell.bb})" />`
        );
      }
      if (cell.char === ' ') continue;
      spans += `<tspan x="${px}" fill="rgb(${cell.r},${cell.g},${cell.b})">${escapeHtml(cell.char)}</tspan>`;
    }
    if (spans) {
      lines.push(`  <text y="${py}">${spans}</text>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${frame.bg}" />
${rects.join('\n')}
  <g font-family="IBM Plex Mono, JetBrains Mono, monospace" font-size="12" font-weight="600">
${lines.join('\n')}
  </g>
</svg>`;
}
