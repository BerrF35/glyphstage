import { describe, expect, it } from 'vitest';
import { hexToVec3, PALETTE_MAP, PALETTES } from '@/engine/presets/palettes';
import {
  createInitialStudioState,
  SCENE_MAP,
  SCENES,
  WORLD_CATEGORIES,
} from '@/engine/presets/scenes';
import { FONT_MAP, FONTS, STYLE_INDEX, STYLE_MAP, STYLES } from '@/engine/presets/styles';
import { decodeStudioHash, encodeStudioHash } from '@/engine/presets/urlPreset';
import { STATEFUL_SIMS, WORLD_SHADERS } from '@/engine/shaders/worldRegistry';

describe('studio presets', () => {
  it('registers 60 curated worlds across 10 categories with valid shaders and presets', () => {
    expect(SCENES).toHaveLength(60);
    expect(WORLD_CATEGORIES).toHaveLength(10);

    const ids = new Set<string>();
    for (const scene of SCENES) {
      expect(ids.has(scene.id), `duplicate scene id: ${scene.id}`).toBe(false);
      ids.add(scene.id);
      expect(SCENE_MAP[scene.id]).toBeDefined();
      expect(WORLD_SHADERS[scene.id]).toBeDefined();
      expect(STYLE_MAP[scene.suggestedStyle]).toBeDefined();
      expect(PALETTE_MAP[scene.suggestedPalette]).toBeDefined();
      if (scene.isStateful) {
        expect(STATEFUL_SIMS[scene.id], `missing sim pair for ${scene.id}`).toBeDefined();
      }
    }
    expect(WORLD_SHADERS.media).toBeDefined();
  });

  it('registers all 10 ASCII styles with consecutive GPU indices and 5 fonts', () => {
    expect(STYLES).toHaveLength(10);
    const indices = STYLES.map((s) => STYLE_INDEX[s.id]).sort((a, b) => a - b);
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    expect(FONTS).toHaveLength(5);
    for (const f of FONTS) {
      expect(FONT_MAP[f.id]).toBeDefined();
    }
  });

  it('converts all 10 palette hex tokens cleanly into normalized RGB vectors', () => {
    expect(PALETTES).toHaveLength(10);
    for (const pal of PALETTES) {
      for (const hex of [pal.bg, pal.low, pal.mid, pal.high, pal.accent]) {
        const vec = hexToVec3(hex);
        expect(vec).toHaveLength(3);
        for (const ch of vec) {
          expect(ch).toBeGreaterThanOrEqual(0);
          expect(ch).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('round-trips shareable URL hash presets cleanly', () => {
    const base = createInitialStudioState();
    const custom = {
      ...base,
      scene: 'singularity' as const,
      style: 'shape6d' as const,
      palette: 'amber' as const,
      font: 'cp437' as const,
      useCustomRamp: true,
      customRamp: ' .:+*#@',
      usePhrase: true,
      phrase: 'EVENT HORIZON',
      fx: { ...base.fx, cellSize: 12, invert: true },
    };

    const hash = encodeStudioHash(custom);
    const decoded = decodeStudioHash(hash, base);
    expect(decoded.scene).toBe('singularity');
    expect(decoded.style).toBe('shape6d');
    expect(decoded.palette).toBe('amber');
    expect(decoded.font).toBe('cp437');
    expect(decoded.fx.cellSize).toBe(12);
    expect(decoded.fx.invert).toBe(true);
    expect(decoded.useCustomRamp).toBe(true);
    expect(decoded.customRamp).toBe(' .:+*#@');
    expect(decoded.usePhrase).toBe(true);
    expect(decoded.phrase).toBe('EVENT HORIZON');
  });

  it('produces valid default studio state', () => {
    const state = createInitialStudioState();
    expect(state.scene).toBe('citadel');
    expect(state.style).toBe('effulgence');
    expect(state.font).toBe('plex');
    expect(state.audioMode).toBe('off');
    expect(state.fx.cellSize).toBeGreaterThanOrEqual(6);
  });
});
