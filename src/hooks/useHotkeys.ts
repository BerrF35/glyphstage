import { useEffect } from 'react';
import { SCENE_MAP, SCENES } from '@/engine/presets/scenes';
import type { SceneId } from '@/types/studio';

interface HotkeyHandlers {
  activeScene: SceneId;
  onTogglePause: () => void;
  onBurst: () => void;
  onResetView: () => void;
  onToggleChrome: () => void;
  onTogglePalette: () => void;
  onToggleWorlds: () => void;
  onToggleEditor: () => void;
  onToggleTour: () => void;
  onStepScene: (delta: number) => void;
  onShuffle: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSelectScene: (id: SceneId, matchLook?: boolean) => void;
}

export function useHotkeys(handlers: HotkeyHandlers): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handlers.onTogglePalette();
        return;
      }

      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handlers.onRedo();
        else handlers.onUndo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handlers.onRedo();
        return;
      }
      if (mod) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handlers.onTogglePause();
      } else if (e.key === 'x' || e.key === 'X') {
        handlers.onBurst();
      } else if (e.key === 'r' || e.key === 'R') {
        handlers.onResetView();
      } else if (e.key === 'h' || e.key === 'H') {
        handlers.onToggleChrome();
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        handlers.onToggleWorlds();
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        handlers.onToggleEditor();
      } else if (e.key === 't' || e.key === 'T') {
        handlers.onToggleTour();
      } else if (e.key === 'n' || e.key === 'N') {
        handlers.onShuffle();
      } else if (e.key === '[') {
        handlers.onStepScene(-1);
      } else if (e.key === ']') {
        handlers.onStepScene(1);
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        handlers.onTogglePalette();
      } else if (e.key >= '1' && e.key <= '6') {
        const curCat =
          handlers.activeScene === 'media'
            ? 'architecture'
            : SCENE_MAP[handlers.activeScene].category;
        const group = SCENES.filter((s) => s.category === curCat);
        const target = group[Number(e.key) - 1];
        if (target) handlers.onSelectScene(target.id, true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers]);
}
