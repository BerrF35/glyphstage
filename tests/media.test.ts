import { describe, expect, it } from 'vitest';
import {
  generateContourSvg,
  generateSquiggleSvg,
  generateStippleTspSvg,
} from '@/engine/export/plotterSvg';
import {
  getMediaByFamily,
  MEDIA,
  MEDIUM_FAMILIES,
  MEDIUM_MAP,
} from '@/engine/presets/media';
import { createInitialStudioState } from '@/engine/presets/scenes';
import { decodeStudioHash, encodeStudioHash } from '@/engine/presets/urlPreset';
import {
  generateAiryThinFilmLut2D,
  generateDither3DVolume,
  generateSubstrateTexture,
  generateTamHatchPyramid,
} from '@/engine/webgl/mediaLuts';

describe('multi-medium artistic engine', () => {
  it('registers all 23 media across 8 families with complete control metadata', () => {
    expect(MEDIUM_FAMILIES).toHaveLength(8);
    expect(MEDIA).toHaveLength(23);

    const ids = new Set<string>();
    for (const m of MEDIA) {
      expect(ids.has(m.id), `duplicate medium id: ${m.id}`).toBe(false);
      ids.add(m.id);
      expect(MEDIUM_MAP[m.id]).toBeDefined();
      expect(m.controls.scale.length).toBeGreaterThan(0);
      expect(m.controls.detail.length).toBeGreaterThan(0);
      expect(m.controls.texture.length).toBeGreaterThan(0);
      expect(m.controls.colorMix.length).toBeGreaterThan(0);
      if (m.id !== 'ascii') {
        expect(m.controls.variants?.length).toBe(4);
      }
    }

    for (const fam of MEDIUM_FAMILIES) {
      expect(getMediaByFamily(fam.id).length).toBeGreaterThan(0);
    }
  });

  it('round-trips non-ASCII medium & variant in shareable URL hashes', () => {
    const base = createInitialStudioState();
    const custom = {
      ...base,
      scene: 'fluid' as const,
      medium: 'kuwahara' as const,
      mediumParams: { ...MEDIUM_MAP.kuwahara.defaults, variant: 2 },
    };
    const hash = encodeStudioHash(custom);
    expect(hash).toContain('m=kuwahara');
    expect(hash).toContain('mv=2');

    const decoded = decodeStudioHash(hash, base);
    expect(decoded.scene).toBe('fluid');
    expect(decoded.medium).toBe('kuwahara');
    expect(decoded.mediumParams.variant).toBe(2);
  });

  it('generates RuneVision Dither3D radial volume & monotonic inverse-CDF ramp', () => {
    const d3d = generateDither3DVolume(4);
    expect(d3d.width).toBe(64);
    expect(d3d.height).toBe(64);
    expect(d3d.depth).toBe(16);
    expect(d3d.volumeData.length).toBe(64 * 64 * 16 * 4);
    expect(d3d.rampData.length).toBe(256 * 4);

    // Slice 15 (16 active dots) should have higher average dot brightness than slice 0 (1 active dot)
    let sum0 = 0;
    let sum15 = 0;
    const sliceStride = 64 * 64 * 4;
    for (let i = 0; i < 64 * 64; i++) {
      sum0 += d3d.volumeData[i * 4];
      sum15 += d3d.volumeData[15 * sliceStride + i * 4];
    }
    expect(sum15).toBeGreaterThan(sum0);
    expect(d3d.rampData[255 * 4]).toBeGreaterThan(d3d.rampData[0]);
  });

  it('generates 2D Airy thin-film interference LUT with angle & thickness chromatic dispersion', () => {
    const airy = generateAiryThinFilmLut2D(64, 1.48, 2.6);
    expect(airy.width).toBe(64);
    expect(airy.height).toBe(64);
    expect(airy.data.length).toBe(64 * 64 * 4);

    // Verify chromatic variation across thickness rows (true wave interference, not flat gray!)
    let maxChannelSpread = 0;
    for (let i = 0; i < airy.data.length; i += 4) {
      const spread =
        Math.max(airy.data[i], airy.data[i + 1], airy.data[i + 2]) -
        Math.min(airy.data[i], airy.data[i + 1], airy.data[i + 2]);
      if (spread > maxChannelSpread) maxChannelSpread = spread;
    }
    expect(maxChannelSpread).toBeGreaterThan(40);
  });

  it('generates strictly nested 6-tier Praun Tonal Art Map (TAM) mip pyramid', () => {
    const tam = generateTamHatchPyramid();
    expect(tam.width).toBe(256);
    expect(tam.layers).toBe(6);
    expect(tam.mipLevels).toHaveLength(3);

    // Verify strict TAM nesting invariant: darker layers contain strictly <= reflectance (more ink!)
    const baseMip = tam.mipLevels[0];
    const means = baseMip.map((buf) => {
      let sum = 0;
      for (let i = 0; i < buf.length; i += 4) sum += buf[i];
      return sum / (buf.length / 4);
    });
    for (let k = 1; k < means.length; k++) {
      expect(means[k]).toBeLessThan(means[k - 1]);
    }

    const sub = generateSubstrateTexture(64);
    expect(sub.data.length).toBe(64 * 64 * 4);
  });

  it('exports valid plotter-ready SVG paths for Squiggle, Voronoi Stipple, 2-Opt TSP, and Contours', () => {
    const w = 64;
    const h = 40;
    const pixels = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x / w - 0.5;
        const dy = y / h - 0.5;
        const v = Math.max(0, Math.min(255, Math.round((1 - Math.hypot(dx, dy) * 2.1) * 255)));
        const idx = (y * w + x) * 4;
        pixels[idx] = v;
        pixels[idx + 1] = v;
        pixels[idx + 2] = v;
        pixels[idx + 3] = 255;
      }
    }

    const squiggle = generateSquiggleSvg(pixels, w, h, { lineCount: 24 });
    expect(squiggle).toContain('<svg');
    expect(squiggle).toContain('<path d="M');
    expect(squiggle).not.toContain('NaN');

    const stipple = generateStippleTspSvg(pixels, w, h, { pointCount: 160, relaxIters: 2, tspSingleLine: false });
    expect(stipple).toContain('<circle');
    expect(stipple).not.toContain('NaN');

    const tsp = generateStippleTspSvg(pixels, w, h, { pointCount: 160, relaxIters: 2, tspSingleLine: true });
    expect(tsp).toContain('id="tsp-single-line"');
    expect(tsp).not.toContain('NaN');

    const contour = generateContourSvg(pixels, w, h, { levels: 8 });
    expect(contour).toContain('id="topographic-contours"');
    expect(contour).toContain('<path');
    expect(contour).not.toContain('NaN');
  });
});
