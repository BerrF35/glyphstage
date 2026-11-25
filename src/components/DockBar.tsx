import {
  ChevronLeft,
  ChevronRight,
  Command,
  EyeOff,
  LayoutGrid,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  Sparkles,
  Star,
  Tv,
  Undo2,
} from 'lucide-react';
import { SCENE_MAP, SCENES, WORLD_CATEGORIES } from '@/engine/presets/scenes';
import { formatCompactCount } from '@/engine/stats/worldStats';
import type { FrameMetrics, SceneId } from '@/types/studio';

interface DockBarProps {
  activeScene: SceneId;
  activeStarred: boolean;
  activeStarCount: number;
  paused: boolean;
  tourActive: boolean;
  metrics: FrameMetrics;
  onSelectScene: (id: SceneId, matchLook?: boolean) => void;
  onToggleStarActive: () => void;
  onStepScene: (delta: number) => void;
  onShuffle: () => void;
  onToggleTour: () => void;
  onUndo: () => void;
  onOpenWorlds: () => void;
  onTogglePause: () => void;
  onBurst: () => void;
  onResetView: () => void;
  onOpenPalette: () => void;
  onHideChrome: () => void;
}

export function DockBar({
  activeScene,
  activeStarred,
  activeStarCount,
  paused,
  tourActive,
  metrics,
  onSelectScene,
  onToggleStarActive,
  onStepScene,
  onShuffle,
  onToggleTour,
  onUndo,
  onOpenWorlds,
  onTogglePause,
  onBurst,
  onResetView,
  onOpenPalette,
  onHideChrome,
}: DockBarProps) {
  const activeSpec = activeScene === 'media' ? null : SCENE_MAP[activeScene];
  const activeCategory = activeSpec?.category ?? 'architecture';
  const siblingWorlds = SCENES.filter((s) => s.category === activeCategory);

  return (
    <footer className="h-11 shrink-0 bg-[#08090b] border-t border-[#1e2128] px-3 flex items-center justify-between gap-2 min-w-0">
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onOpenWorlds}
          title={`Browse all ${SCENES.length} worlds (G)`}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded bg-[#14171e] hover:bg-[#1c202a] border border-[#2a303d] text-xs font-medium text-[#f2f4f7] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.97]"
        >
          <LayoutGrid className="w-3.5 h-3.5 text-[#f59e0b]" strokeWidth={1.75} />
          <span>Worlds</span>
          <span className="font-mono-num text-[10px] text-[#8d95a5]">{SCENES.length}</span>
        </button>

        <div className="hidden md:flex items-center">
          <button
            type="button"
            onClick={() => onStepScene(-1)}
            aria-label="Previous world"
            title="Previous world ([)"
            className="inline-flex items-center justify-center w-6 h-7 rounded text-[#8d95a5] hover:text-[#f2f4f7] hover:bg-[#171a21] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b]"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onStepScene(1)}
            aria-label="Next world"
            title="Next world (])"
            className="inline-flex items-center justify-center w-6 h-7 rounded text-[#8d95a5] hover:text-[#f2f4f7] hover:bg-[#171a21] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b]"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Mobile world selector grouped by category */}
      <div className="flex-1 flex items-center min-w-0 sm:hidden">
        <label htmlFor="mobile-scene-select" className="sr-only">
          Active 3D world
        </label>
        <select
          id="mobile-scene-select"
          value={activeScene === 'media' ? '' : activeScene}
          onChange={(e) => {
            if (e.target.value) onSelectScene(e.target.value as SceneId, true);
          }}
          className="h-7 w-full max-w-[162px] rounded bg-[#15181e] border border-[#2a2f3a] px-2 text-xs font-medium text-[#f2f4f7] focus-visible:outline-2 focus-visible:outline-[#f59e0b]"
        >
          {activeScene === 'media' && <option value="">Media Input</option>}
          {WORLD_CATEGORIES.map((cat) => (
            <optgroup key={cat.id} label={cat.label}>
              {SCENES.filter((s) => s.category === cat.id).map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Desktop & tablet: 6 worlds in current collection */}
      <nav
        aria-label="Worlds in active collection"
        className="hidden sm:flex flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar min-w-0 py-1"
      >
        {siblingWorlds.map((scene, idx) => {
          const active = scene.id === activeScene;
          return (
            <button
              key={scene.id}
              type="button"
              onClick={(e) => onSelectScene(scene.id, !e.altKey)}
              aria-pressed={active}
              title={`${scene.name} — ${scene.reference} (Hold Alt to keep current style)`}
              className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.97] ${
                active
                  ? 'bg-[#1c2029] text-[#f2f4f7] border border-[#2f3542]'
                  : 'text-[#8d95a5] hover:text-[#f2f4f7] hover:bg-[#13161c] border border-transparent'
              }`}
            >
              <span className="font-mono-num text-[10px] text-[#646c7a] hidden lg:inline">
                {idx + 1}
              </span>
              <span>{scene.shortName}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex items-center gap-0.5 shrink-0">
        {activeScene !== 'media' && (
          <button
            type="button"
            onClick={onToggleStarActive}
            aria-pressed={activeStarred}
            aria-label={activeStarred ? `Unstar current world (${activeStarCount})` : `Star current world (${activeStarCount})`}
            title={activeStarred ? 'Remove star from active world' : 'Star active world'}
            className={`inline-flex items-center gap-1 h-7 px-2 mr-1 rounded border font-mono-num text-[11px] font-medium cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.96] ${
              activeStarred
                ? 'bg-[#1e1b14] text-[#f59e0b] border-[#f59e0b]/45'
                : 'bg-[#111318] text-[#c8ced8] border-[#252932] hover:border-[#373d4a] hover:text-[#f59e0b]'
            }`}
          >
            <Star className={`w-3 h-3 ${activeStarred ? 'fill-current' : ''}`} strokeWidth={1.75} />
            <span>{formatCompactCount(activeStarCount)}</span>
          </button>
        )}

        <span className="hidden xl:inline-block font-mono-num text-[11px] text-[#7b8494] pr-2 mr-1 border-r border-[#1e2128]">
          {metrics.fps} fps · {metrics.cols}×{metrics.rows}
        </span>

        <button
          type="button"
          onClick={onUndo}
          aria-label="Undo last change"
          title="Undo (Ctrl+Z)"
          className="hidden md:inline-flex items-center justify-center w-7 h-7 rounded text-[#8d95a5] hover:text-[#f2f4f7] hover:bg-[#171a21] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.96]"
        >
          <Undo2 className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={onToggleTour}
          aria-pressed={tourActive}
          aria-label={tourActive ? 'Stop showcase auto-tour' : 'Start showcase auto-tour'}
          title={tourActive ? 'Stop Showcase Tour (T)' : 'Showcase Auto-Tour (T)'}
          className={`hidden sm:inline-flex items-center justify-center w-7 h-7 rounded cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.96] ${
            tourActive
              ? 'bg-[#1e222b] text-[#f59e0b]'
              : 'text-[#c8ced8] hover:text-[#f59e0b] hover:bg-[#171a21]'
          }`}
        >
          <Tv className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={onShuffle}
          aria-label="Shuffle random world"
          title="Random World (N)"
          className="inline-flex items-center justify-center w-7 h-7 rounded text-[#c8ced8] hover:text-[#f59e0b] hover:bg-[#171a21] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.96]"
        >
          <Shuffle className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={onTogglePause}
          aria-label={paused ? 'Resume playback' : 'Pause playback'}
          title={paused ? 'Resume (Space)' : 'Pause (Space)'}
          className="inline-flex items-center justify-center w-7 h-7 rounded text-[#c8ced8] hover:text-[#f2f4f7] hover:bg-[#171a21] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.96]"
        >
          {paused ? (
            <Play className="w-3.5 h-3.5 text-[#f59e0b]" strokeWidth={2} />
          ) : (
            <Pause className="w-3.5 h-3.5" strokeWidth={1.75} />
          )}
        </button>

        <button
          type="button"
          onClick={onBurst}
          aria-label="Trigger ASCII glyph shatter burst"
          title="Shatter Burst (X or click canvas)"
          className="inline-flex items-center justify-center w-7 h-7 rounded text-[#c8ced8] hover:text-[#f59e0b] hover:bg-[#171a21] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.96]"
        >
          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={onResetView}
          aria-label="Reset 3D camera"
          title="Reset Camera (R or double-click)"
          className="inline-flex items-center justify-center w-7 h-7 rounded text-[#c8ced8] hover:text-[#f2f4f7] hover:bg-[#171a21] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.96]"
        >
          <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="Open command palette"
          title="Command Palette (K)"
          className="hidden sm:inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] font-mono-num text-[#8d95a5] hover:text-[#f2f4f7] hover:bg-[#171a21] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.96]"
        >
          <Command className="w-3 h-3" strokeWidth={1.75} />
          <span>K</span>
        </button>

        <button
          type="button"
          onClick={onHideChrome}
          aria-label="Hide interface"
          title="Fullscreen Stage (H)"
          className="inline-flex items-center justify-center w-7 h-7 rounded text-[#8d95a5] hover:text-[#f2f4f7] hover:bg-[#171a21] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.96]"
        >
          <EyeOff className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
      </div>
    </footer>
  );
}
