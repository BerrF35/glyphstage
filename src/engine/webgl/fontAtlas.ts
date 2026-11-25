import { FONT_MAP } from '@/engine/presets/styles';
import type { FontId } from '@/types/studio';

const CELL_W = 32;
const CELL_H = 48;

export const MAIN_ROWS = {
  structural: ' -|/\\_=+*x#@.:~^',
  classic: ' .,:;-=+*#%$&WM@',
  effulgence: ' ·.:;+=xX*%#&8$@',
  playcore: ' .:-=+*#%@08WM#$',
  cascade: ' ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ',
};

// Alex Harri staggered 6-point internal sampling coordinates (top-down cell space)
export const SHAPE6D_POINTS: ReadonlyArray<[number, number]> = [
  [0.3, 0.23],
  [0.7, 0.18],
  [0.3, 0.5],
  [0.7, 0.5],
  [0.3, 0.82],
  [0.7, 0.77],
];

// Full printable ASCII 0x20..0x7E (95 characters) for 6D shape-vector matching
export const SHAPE6D_CHARS: string[] = Array.from({ length: 95 }, (_, i) =>
  String.fromCharCode(32 + i)
);

export interface Shape6DAtlasBundle {
  canvas: HTMLCanvasElement;
  lutData: Uint8Array;
  vectors: number[][];
  chars: string[];
  cols: number;
  rows: number;
}

function applyPixelSnap(ctx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number) {
  // Quantize glyph bitmap onto crisp 8x12 VGA/PETSCII pixel blocks
  const img = ctx.getImageData(ox, oy, w, h);
  const d = img.data;
  const stepX = 4;
  const stepY = 4;
  for (let by = 0; by < h; by += stepY) {
    for (let bx = 0; bx < w; bx += stepX) {
      let sum = 0;
      let count = 0;
      for (let py = by; py < Math.min(h, by + stepY); py++) {
        for (let px = bx; px < Math.min(w, bx + stepX); px++) {
          sum += d[(py * w + px) * 4];
          count++;
        }
      }
      const on = sum / Math.max(1, count) > 96 ? 255 : 0;
      for (let py = by; py < Math.min(h, by + stepY); py++) {
        for (let px = bx; px < Math.min(w, bx + stepX); px++) {
          const idx = (py * w + px) * 4;
          d[idx] = on;
          d[idx + 1] = on;
          d[idx + 2] = on;
          d[idx + 3] = on;
        }
      }
    }
  }
  ctx.putImageData(img, ox, oy);
}

function drawQuadrantTile(ctx: CanvasRenderingContext2D, ox: number, oy: number, mask: number) {
  ctx.fillStyle = '#ffffff';
  const hw = CELL_W / 2;
  const hh = CELL_H / 2;
  if (mask & 1) ctx.fillRect(ox, oy, hw, hh);
  if (mask & 2) ctx.fillRect(ox + hw, oy, hw, hh);
  if (mask & 4) ctx.fillRect(ox, oy + hh, hw, hh);
  if (mask & 8) ctx.fillRect(ox + hw, oy + hh, hw, hh);
}

function drawWoodcutTile(ctx: CanvasRenderingContext2D, ox: number, oy: number, level: number) {
  if (level <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, CELL_W, CELL_H);
  ctx.clip();

  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineCap = 'square';

  if (level === 1) {
    ctx.beginPath();
    ctx.arc(ox + CELL_W * 0.5, oy + CELL_H * 0.5, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (level <= 4) {
    const count = level === 2 ? 1 : level === 3 ? 2 : 3;
    ctx.lineWidth = 2.6;
    for (let i = 0; i < count; i++) {
      const y = oy + ((i + 0.5) / count) * CELL_H;
      ctx.beginPath();
      ctx.moveTo(ox + 2, y);
      ctx.lineTo(ox + CELL_W - 2, y);
      ctx.stroke();
    }
  } else if (level <= 8) {
    const count = level - 3;
    ctx.lineWidth = 2.8;
    const step = (CELL_W + CELL_H) / (count + 1);
    for (let d = -CELL_H; d < CELL_W + CELL_H; d += step) {
      ctx.beginPath();
      ctx.moveTo(ox + d, oy + CELL_H);
      ctx.lineTo(ox + d + CELL_H * 0.72, oy);
      ctx.stroke();
    }
  } else if (level <= 13) {
    const density = level - 7;
    ctx.lineWidth = 2.6 + (level - 9) * 0.35;
    const step = (CELL_W + CELL_H) / (density + 2);
    for (let d = -CELL_H; d < CELL_W + CELL_H; d += step) {
      ctx.beginPath();
      ctx.moveTo(ox + d, oy + CELL_H);
      ctx.lineTo(ox + d + CELL_H * 0.72, oy);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(ox + d, oy);
      ctx.lineTo(ox + d + CELL_H * 0.72, oy + CELL_H);
      ctx.stroke();
    }
  } else {
    const step = level === 14 ? 9.5 : 7.0;
    ctx.lineWidth = level === 14 ? 2.6 : 3.1;
    for (let d = -CELL_H; d < CELL_W + CELL_H; d += step) {
      ctx.beginPath();
      ctx.moveTo(ox + d, oy + CELL_H);
      ctx.lineTo(ox + d + CELL_H * 0.72, oy);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(ox + d, oy);
      ctx.lineTo(ox + d + CELL_H * 0.72, oy + CELL_H);
      ctx.stroke();
    }
    for (let y = oy + 5; y < oy + CELL_H; y += step) {
      ctx.beginPath();
      ctx.moveTo(ox + 1, y);
      ctx.lineTo(ox + CELL_W - 1, y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function normalizeCustomRamp(ramp: string): string {
  const chars = Array.from(ramp || '');
  if (chars.length === 0) return MAIN_ROWS.classic;
  const out: string[] = [];
  for (let i = 0; i < 16; i++) {
    const idx = Math.min(chars.length - 1, Math.floor((i / 15) * (chars.length - 1) + 0.001));
    out.push(chars[idx] ?? ' ');
  }
  return out.join('');
}

export function buildMainAtlasCanvas(
  customRamp = '',
  fontId: FontId = 'plex'
): HTMLCanvasElement {
  const spec = FONT_MAP[fontId] ?? FONT_MAP.plex;
  const canvas = document.createElement('canvas');
  canvas.width = 16 * CELL_W;
  canvas.height = 8 * CELL_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: Boolean(spec.pixelSnap) });
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';

  const drawTextRow = (rowIndex: number, chars: string, fontPx = 34) => {
    ctx.font = `${spec.weight} ${fontPx}px ${spec.cssFamily}`;
    const list = Array.from(chars);
    for (let col = 0; col < 16; col++) {
      let ch = list[col] ?? ' ';
      if (spec.uppercaseOnly) ch = ch.toUpperCase();
      if (ch === ' ') continue;
      ctx.fillText(ch, col * CELL_W + CELL_W * 0.5, rowIndex * CELL_H + CELL_H * 0.54);
      if (spec.pixelSnap) {
        applyPixelSnap(ctx, col * CELL_W, rowIndex * CELL_H, CELL_W, CELL_H);
      }
    }
  };

  drawTextRow(0, MAIN_ROWS.structural, 35);
  drawTextRow(1, MAIN_ROWS.classic, 34);
  drawTextRow(2, MAIN_ROWS.effulgence, 34);
  drawTextRow(3, MAIN_ROWS.playcore, 33);

  for (let mask = 0; mask < 16; mask++) {
    drawQuadrantTile(ctx, mask * CELL_W, 4 * CELL_H, mask);
  }

  drawTextRow(5, MAIN_ROWS.cascade, 32);

  for (let lvl = 0; lvl < 16; lvl++) {
    drawWoodcutTile(ctx, lvl * CELL_W, 6 * CELL_H, lvl);
  }

  drawTextRow(7, normalizeCustomRamp(customRamp), 34);
  return canvas;
}

export function buildPhraseAtlasCanvas(
  phrase: string,
  fontId: FontId = 'plex'
): HTMLCanvasElement {
  const spec = FONT_MAP[fontId] ?? FONT_MAP.plex;
  const canvas = document.createElement('canvas');
  canvas.width = 64 * CELL_W;
  canvas.height = CELL_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: Boolean(spec.pixelSnap) });
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = `${spec.weight} 34px ${spec.cssFamily}`;

  const raw = phrase.length > 0 ? phrase : 'GLYPHSTAGE ';
  const chars = Array.from(raw).slice(0, 64);
  for (let i = 0; i < chars.length; i++) {
    let ch = chars[i];
    if (spec.uppercaseOnly) ch = ch.toUpperCase();
    if (ch === ' ') continue;
    ctx.fillText(ch, i * CELL_W + CELL_W * 0.5, CELL_H * 0.54);
    if (spec.pixelSnap) {
      applyPixelSnap(ctx, i * CELL_W, 0, CELL_W, CELL_H);
    }
  }
  return canvas;
}

// Builds a 16x6 atlas of all 95 printable ASCII characters and measures each glyph's
// Alex Harri 6D staggered shape vector directly from the rasterized font pixels.
export function buildShape6DAtlasAndVectors(fontId: FontId = 'plex'): Shape6DAtlasBundle {
  const spec = FONT_MAP[fontId] ?? FONT_MAP.plex;
  const cols = 16;
  const rows = 6;
  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL_W;
  canvas.height = rows * CELL_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const vectors: number[][] = [];
  const lutData = new Uint8Array(96 * 2 * 4);

  if (!ctx) {
    return { canvas, lutData, vectors, chars: SHAPE6D_CHARS, cols, rows };
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = `${spec.weight} 34px ${spec.cssFamily}`;

  for (let i = 0; i < SHAPE6D_CHARS.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    let ch = SHAPE6D_CHARS[i];
    if (spec.uppercaseOnly) ch = ch.toUpperCase();
    if (ch !== ' ') {
      ctx.fillText(ch, col * CELL_W + CELL_W * 0.5, row * CELL_H + CELL_H * 0.54);
      if (spec.pixelSnap) {
        applyPixelSnap(ctx, col * CELL_W, row * CELL_H, CELL_W, CELL_H);
      }
    }
  }

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const radiusX = CELL_W * 0.28;
  const radiusY = CELL_H * 0.19;
  const maxDim = [0.001, 0.001, 0.001, 0.001, 0.001, 0.001];

  // Measure circle-averaged ink density at each of the 6 staggered sampling circles
  for (let i = 0; i < SHAPE6D_CHARS.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = col * CELL_W;
    const oy = row * CELL_H;
    const vec = [0, 0, 0, 0, 0, 0];

    if (SHAPE6D_CHARS[i] !== ' ') {
      for (let d = 0; d < 6; d++) {
        const [nx, ny] = SHAPE6D_POINTS[d];
        const cx = ox + nx * CELL_W;
        const cy = oy + ny * CELL_H;
        const x0 = Math.max(ox, Math.floor(cx - radiusX));
        const x1 = Math.min(ox + CELL_W - 1, Math.ceil(cx + radiusX));
        const y0 = Math.max(oy, Math.floor(cy - radiusY));
        const y1 = Math.min(oy + CELL_H - 1, Math.ceil(cy + radiusY));

        let sum = 0;
        let count = 0;
        for (let py = y0; py <= y1; py++) {
          const dy = (py - cy) / radiusY;
          for (let px = x0; px <= x1; px++) {
            const dx = (px - cx) / radiusX;
            if (dx * dx + dy * dy <= 1.0) {
              sum += img[(py * canvas.width + px) * 4] / 255;
              count++;
            }
          }
        }
        const density = count > 0 ? sum / count : 0;
        vec[d] = density;
        if (density > maxDim[d]) maxDim[d] = density;
      }
    }
    vectors.push(vec);
  }

  // Normalize per-dimension so full [0, 1]^6 shape space is utilized
  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    for (let d = 0; d < 6; d++) {
      v[d] = Math.min(1, v[d] / maxDim[d]);
    }
    const base0 = i * 4;
    lutData[base0] = Math.round(v[0] * 255);
    lutData[base0 + 1] = Math.round(v[1] * 255);
    lutData[base0 + 2] = Math.round(v[2] * 255);
    lutData[base0 + 3] = 255;

    const base1 = (96 + i) * 4;
    lutData[base1] = Math.round(v[3] * 255);
    lutData[base1 + 1] = Math.round(v[4] * 255);
    lutData[base1 + 2] = Math.round(v[5] * 255);
    lutData[base1 + 3] = 255;
  }

  return { canvas, lutData, vectors, chars: SHAPE6D_CHARS, cols, rows };
}

export function buildBrailleAtlasCanvas(): HTMLCanvasElement {
  const tileW = 20;
  const tileH = 32;
  const canvas = document.createElement('canvas');
  canvas.width = 16 * tileW;
  canvas.height = 16 * tileH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';

  const dotR = 3.2;

  for (let mask = 0; mask < 256; mask++) {
    const col = mask & 15;
    const row = (mask >> 4) & 15;
    const ox = col * tileW;
    const oy = row * tileH;

    for (let px = 0; px < 2; px++) {
      for (let py = 0; py < 4; py++) {
        const bit = px * 4 + py;
        if ((mask & (1 << bit)) === 0) continue;
        const cx = ox + (px === 0 ? tileW * 0.28 : tileW * 0.72);
        const cy = oy + (3 - py + 0.5) * (tileH / 4);
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  return canvas;
}

export function buildExtrudedTextCanvas(text: string): HTMLCanvasElement {
  const w = 512;
  const h = 192;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const label = (text.trim() || 'GLYPHSTAGE').toUpperCase().slice(0, 14);
  const fontSize = label.length > 10 ? 64 : label.length > 6 ? 86 : 112;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${fontSize}px "Space Grotesk", "Inter", system-ui, sans-serif`;

  ctx.filter = 'blur(8px)';
  ctx.fillStyle = 'rgba(255, 0, 0, 0.85)';
  ctx.fillText(label, w / 2, h / 2 + 4);

  ctx.filter = 'blur(3px)';
  ctx.fillStyle = 'rgba(255, 0, 0, 0.9)';
  ctx.fillText(label, w / 2, h / 2 + 4);

  ctx.filter = 'none';
  ctx.fillStyle = '#ffff00';
  ctx.fillText(label, w / 2, h / 2 + 4);
  ctx.restore();

  return canvas;
}
