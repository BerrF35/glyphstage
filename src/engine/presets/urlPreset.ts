import { MEDIUM_MAP } from '@/engine/presets/media';
import { PALETTE_MAP } from '@/engine/presets/palettes';
import { SCENE_MAP } from '@/engine/presets/scenes';
import { FONT_MAP, STYLE_MAP } from '@/engine/presets/styles';
import type { FontId, MediumId, PaletteId, SceneId, StudioState, StyleId } from '@/types/studio';

export function encodeStudioHash(state: StudioState): string {
  const params = new URLSearchParams();
  if (state.scene !== 'media') params.set('w', state.scene);
  if (state.medium !== 'ascii') {
    params.set('m', state.medium);
    if (state.mediumParams.variant !== 0) params.set('mv', String(state.mediumParams.variant));
  }
  params.set('s', state.style);
  params.set('p', state.palette);
  if (state.font !== 'plex') params.set('f', state.font);
  params.set('c', String(state.fx.cellSize));
  if (state.fx.invert) params.set('inv', '1');
  if (state.useCustomRamp && state.customRamp) params.set('r', state.customRamp);
  if (state.usePhrase && state.phrase) params.set('ph', state.phrase.slice(0, 64));
  if (state.scene === 'type3d' && state.customText) params.set('t', state.customText);
  return `#${params.toString()}`;
}

export function decodeStudioHash(hash: string, base: StudioState): StudioState {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return base;

  try {
    const params = new URLSearchParams(raw);
    const next: StudioState = {
      ...base,
      mediumParams: { ...base.mediumParams },
      camera: { ...base.camera },
      light: { ...base.light },
      fx: { ...base.fx },
    };

    const w = params.get('w') as Exclude<SceneId, 'media'> | null;
    if (w && SCENE_MAP[w]) {
      const spec = SCENE_MAP[w];
      next.scene = w;
      next.style = spec.suggestedStyle;
      next.palette = spec.suggestedPalette;
      next.camera = { ...next.camera, ...spec.defaultCamera };
      next.fx = { ...next.fx, ...STYLE_MAP[spec.suggestedStyle].defaults };
    }

    const s = params.get('s') as StyleId | null;
    if (s && STYLE_MAP[s]) {
      next.style = s;
      next.fx = { ...next.fx, ...STYLE_MAP[s].defaults };
    }

    const m = params.get('m') as MediumId | null;
    if (m && MEDIUM_MAP[m]) {
      const mSpec = MEDIUM_MAP[m];
      next.medium = m;
      next.mediumParams = { ...mSpec.defaults };
      if (mSpec.fxOverrides) next.fx = { ...next.fx, ...mSpec.fxOverrides };
      const mv = Number(params.get('mv'));
      if (Number.isFinite(mv) && mv >= 0 && mv <= 3) {
        next.mediumParams.variant = Math.round(mv);
      }
    }

    const p = params.get('p') as PaletteId | null;
    if (p && PALETTE_MAP[p]) next.palette = p;

    const f = params.get('f') as FontId | null;
    if (f && FONT_MAP[f]) next.font = f;

    const c = Number(params.get('c'));
    if (Number.isFinite(c) && c >= 6 && c <= 22) {
      next.fx.cellSize = Math.round(c);
    }

    if (params.get('inv') === '1') next.fx.invert = true;

    const r = params.get('r');
    if (r) {
      next.customRamp = r.slice(0, 32);
      next.useCustomRamp = true;
    }

    const ph = params.get('ph');
    if (ph) {
      next.phrase = ph.slice(0, 64);
      next.usePhrase = true;
    }

    const t = params.get('t');
    if (t) next.customText = t.slice(0, 14);

    return next;
  } catch {
    return base;
  }
}
