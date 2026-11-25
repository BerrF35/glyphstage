import { describe, expect, it } from 'vitest';
import {
  frameToAnsiTerminal,
  frameToColoredHtml,
  frameToEmbedSnippet,
  frameToPlainText,
  frameToSvg,
  sampleAsciiGrid,
} from '@/engine/export/textSampler';
import { createInitialStudioState } from '@/engine/presets/scenes';
import type { Shape6DAtlasBundle } from '@/engine/webgl/fontAtlas';

function makeSyntheticBuffers(w = 64, h = 48) {
  const pixels = new Uint8Array(w * h * 4);
  const edges = new Uint8Array(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const dx = x - w / 2;
      const dy = y - h / 2;
      const dist = Math.hypot(dx, dy);

      if (dist < 16) {
        const shade = Math.round(255 * (1 - dist / 18));
        pixels[idx] = shade;
        pixels[idx + 1] = Math.round(shade * 0.9);
        pixels[idx + 2] = Math.round(shade * 0.7);
        pixels[idx + 3] = 255;

        const isBorder = dist > 13.5;
        edges[idx] = isBorder ? 220 : 12;
        edges[idx + 1] = isBorder ? 128 : 0; // vertical edge code
        edges[idx + 2] = shade;
        edges[idx + 3] = 220;
      } else {
        pixels[idx + 3] = 0;
        edges[idx + 3] = 0;
      }
    }
  }

  return { pixels, edges, w, h };
}

describe('textSampler', () => {
  it('maps directional edges and luminance cells into plain text, HTML, ANSI, Embed, and SVG', () => {
    const { pixels, edges, w, h } = makeSyntheticBuffers();
    const state = createInitialStudioState();
    state.style = 'edge';
    state.fx.edgeMix = 1;
    state.fx.edgeThreshold = 0.2;

    const frame = sampleAsciiGrid(pixels, edges, w, h, 32, 20, state);
    expect(frame.cells.length).toBe(32 * 20);

    const txt = frameToPlainText(frame);
    expect(txt.split('\n')).toHaveLength(20);
    expect(txt).toContain('|');

    const ansi = frameToAnsiTerminal(frame);
    expect(ansi).toContain('\x1b[38;2;');
    expect(ansi).toContain('\x1b[0m');

    const html = frameToColoredHtml(frame);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<span style="color:rgb(');

    const embed = frameToEmbedSnippet(frame, 'test-stage');
    expect(embed).toContain('<figure');
    expect(embed).toContain('test-stage ASCII art');

    const svg = frameToSvg(frame);
    expect(svg).toContain('<svg');
    expect(svg).toContain('<tspan');
  });

  it('keeps dark void cells clean of stray dither speckle', () => {
    const { pixels, edges, w, h } = makeSyntheticBuffers();
    const state = createInitialStudioState();
    state.style = 'playcore';
    state.fx.dither = 1.0;

    const frame = sampleAsciiGrid(pixels, edges, w, h, 32, 20, state);
    // Corner (0, 0) is empty void and must remain space even at 100% dither
    expect(frame.cells[0].char).toBe(' ');
  });

  it('renders dual-color ANSI half-blocks with foreground & background RGB', () => {
    const { pixels, edges, w, h } = makeSyntheticBuffers();
    const state = createInitialStudioState();
    state.style = 'ansi';

    const frame = sampleAsciiGrid(pixels, edges, w, h, 24, 16, state);
    const center = frame.cells[8 * 24 + 12];
    expect(center.char).toBe('▀');
    expect(center.br).toBeDefined();
    expect(center.bg).toBeDefined();
    expect(center.bb).toBeDefined();

    const ansi = frameToAnsiTerminal(frame);
    expect(ansi).toContain('▀');
    expect(ansi).toContain('\x1b[48;2;');
  });

  it('matches 6D shape vectors cleanly when shape6d style is active', () => {
    const { pixels, edges, w, h } = makeSyntheticBuffers();
    const state = createInitialStudioState();
    state.style = 'shape6d';

    const mockBundle: Shape6DAtlasBundle = {
      canvas: null as unknown as HTMLCanvasElement,
      lutData: new Uint8Array(96 * 2 * 4),
      cols: 16,
      rows: 6,
      chars: [' ', '.', '+', '#'],
      vectors: [
        [0, 0, 0, 0, 0, 0],
        [0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
        [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        [0.95, 0.95, 0.95, 0.95, 0.95, 0.95],
      ],
    };

    const frame = sampleAsciiGrid(pixels, edges, w, h, 24, 16, state, mockBundle);
    const txt = frameToPlainText(frame);
    expect(txt).toContain('#');
    expect(frame.cells[0].char).toBe(' ');
  });

  it('produces valid Unicode Braille code points in braille style', () => {
    const { pixels, edges, w, h } = makeSyntheticBuffers();
    const state = createInitialStudioState();
    state.style = 'braille';
    state.fx.dither = 0.5;

    const frame = sampleAsciiGrid(pixels, edges, w, h, 24, 16, state);
    const nonBlankBraille = frame.cells.filter((c) => {
      const code = c.char.charCodeAt(0);
      return code > 0x2800 && code <= 0x28ff;
    });
    expect(nonBlankBraille.length).toBeGreaterThan(20);
  });

  it('produces Unicode quadrant block characters in blocks style', () => {
    const { pixels, edges, w, h } = makeSyntheticBuffers();
    const state = createInitialStudioState();
    state.style = 'blocks';

    const frame = sampleAsciiGrid(pixels, edges, w, h, 24, 16, state);
    const txt = frameToPlainText(frame);
    expect(/[▘▝▀▖▌▞▛▗▚▐▜▄▙▟█]/.test(txt)).toBe(true);
  });

  it('weaves custom phrase characters across illuminated cells', () => {
    const { pixels, edges, w, h } = makeSyntheticBuffers();
    const state = createInitialStudioState();
    state.style = 'effulgence';
    state.usePhrase = true;
    state.phrase = 'Z';

    const frame = sampleAsciiGrid(pixels, edges, w, h, 24, 16, state);
    expect(frameToPlainText(frame)).toContain('Z');
  });
});
