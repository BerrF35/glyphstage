import { useCallback, useEffect, useRef, useState } from 'react';
import { MEDIUM_MAP } from '@/engine/presets/media';
import { createInitialStudioState, DEFAULT_LIGHT_STATE, SCENES } from '@/engine/presets/scenes';
import { STYLE_MAP } from '@/engine/presets/styles';
import { decodeStudioHash } from '@/engine/presets/urlPreset';
import type {
  CameraState,
  EffectState,
  LightState,
  MediumId,
  MediumParams,
  PaletteId,
  SceneId,
  StudioState,
  StyleId,
} from '@/types/studio';

const MAX_HISTORY = 32;
const FAVORITES_KEY = 'glyphstage:favorites:v1';

function loadFavorites(): SceneId[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is SceneId => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function useStudioState() {
  const [state, setState] = useState<StudioState>(() => {
    const base = createInitialStudioState();
    if (typeof window !== 'undefined' && window.location.hash) {
      return decodeStudioHash(window.location.hash, base);
    }
    return base;
  });

  const [favorites, setFavorites] = useState<SceneId[]>(() => loadFavorites());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => {
      if (!window.location.hash) return;
      setState(decodeStudioHash(window.location.hash, createInitialStudioState()));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const pastRef = useRef<StudioState[]>([]);
  const futureRef = useRef<StudioState[]>([]);
  const lastHistoryPushRef = useRef(0);

  const commit = useCallback((updater: (prev: StudioState) => StudioState, coalesce = false) => {
    setState((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      const now = performance.now();
      if (!coalesce || now - lastHistoryPushRef.current > 450) {
        pastRef.current.push(prev);
        if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
        lastHistoryPushRef.current = now;
      }
      futureRef.current = [];
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setState((curr) => {
      const prev = pastRef.current.pop();
      if (!prev) return curr;
      futureRef.current.push(curr);
      return prev;
    });
  }, []);

  const redo = useCallback(() => {
    setState((curr) => {
      const next = futureRef.current.pop();
      if (!next) return curr;
      pastRef.current.push(curr);
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      // ignore storage quota errors
    }
  }, [favorites]);

  const toggleFavorite = useCallback((id: SceneId) => {
    if (id === 'media') return;
    setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const selectScene = useCallback(
    (sceneId: SceneId, matchLook = false) => {
      const spec = SCENES.find((s) => s.id === sceneId);
      commit((prev) => {
        if (!spec) return { ...prev, scene: sceneId };
        const next: StudioState = {
          ...prev,
          scene: sceneId,
          camera: { ...prev.camera, ...spec.defaultCamera },
        };
        if (matchLook) {
          const styleSpec = STYLE_MAP[spec.suggestedStyle];
          next.style = spec.suggestedStyle;
          next.palette = spec.suggestedPalette;
          next.fx = { ...prev.fx, ...styleSpec.defaults };
          next.light = { ...DEFAULT_LIGHT_STATE };
        }
        return next;
      });
    },
    [commit]
  );

  const selectStyle = useCallback(
    (styleId: StyleId) => {
      const spec = STYLE_MAP[styleId];
      commit((prev) => ({
        ...prev,
        medium: 'ascii',
        style: styleId,
        fx: { ...prev.fx, ...spec.defaults },
      }));
    },
    [commit]
  );

  const selectMedium = useCallback(
    (mediumId: MediumId) => {
      const spec = MEDIUM_MAP[mediumId];
      commit((prev) => {
        if (mediumId === 'ascii') {
          const styleSpec = STYLE_MAP[prev.style];
          return {
            ...prev,
            medium: 'ascii',
            fx: { ...prev.fx, ...styleSpec.defaults },
          };
        }
        return {
          ...prev,
          medium: mediumId,
          mediumParams: { ...spec.defaults },
          fx: spec.fxOverrides ? { ...prev.fx, ...spec.fxOverrides } : prev.fx,
        };
      });
    },
    [commit]
  );

  const patchMediumParams = useCallback(
    (patch: Partial<MediumParams>) => {
      commit((prev) => ({ ...prev, mediumParams: { ...prev.mediumParams, ...patch } }), true);
    },
    [commit]
  );

  const selectPalette = useCallback(
    (paletteId: PaletteId) => {
      commit((prev) => ({ ...prev, palette: paletteId }));
    },
    [commit]
  );

  const patchCamera = useCallback(
    (patch: Partial<CameraState>) => {
      commit((prev) => ({ ...prev, camera: { ...prev.camera, ...patch } }), true);
    },
    [commit]
  );

  const patchLight = useCallback(
    (patch: Partial<LightState>) => {
      commit((prev) => ({ ...prev, light: { ...prev.light, ...patch } }), true);
    },
    [commit]
  );

  const patchFx = useCallback(
    (patch: Partial<EffectState>) => {
      commit((prev) => ({ ...prev, fx: { ...prev.fx, ...patch } }), true);
    },
    [commit]
  );

  const patchRoot = useCallback(
    (patch: Partial<StudioState>) => {
      commit((prev) => ({ ...prev, ...patch }), true);
    },
    [commit]
  );

  const resetView = useCallback(() => {
    commit((prev) => {
      const spec = SCENES.find((s) => s.id === prev.scene);
      return {
        ...prev,
        camera: {
          ...prev.camera,
          yaw: spec?.defaultCamera.yaw ?? 0.35,
          pitch: spec?.defaultCamera.pitch ?? 0.2,
          zoom: spec?.defaultCamera.zoom ?? 1.0,
          autoOrbit: spec?.defaultCamera.autoOrbit ?? true,
        },
      };
    });
  }, [commit]);

  const resetEffects = useCallback(() => {
    commit((prev) => {
      const styleSpec = STYLE_MAP[prev.style];
      const mediumSpec = MEDIUM_MAP[prev.medium];
      return {
        ...prev,
        usePhrase: false,
        useCustomRamp: false,
        mediumParams: { ...mediumSpec.defaults },
        light: { ...DEFAULT_LIGHT_STATE },
        fx: {
          ...prev.fx,
          ...(prev.medium === 'ascii' ? styleSpec.defaults : mediumSpec.fxOverrides ?? {}),
          invert: false,
          motionSpeed: 1.0,
          shapeCrunch: 1.0,
        },
      };
    });
  }, [commit]);

  return {
    state,
    favorites,
    toggleFavorite,
    selectScene,
    selectStyle,
    selectMedium,
    patchMediumParams,
    selectPalette,
    patchCamera,
    patchLight,
    patchFx,
    patchRoot,
    resetView,
    resetEffects,
    undo,
    redo,
  };
}
