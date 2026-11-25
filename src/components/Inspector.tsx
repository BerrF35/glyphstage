import { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Camera,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Star,
  Upload,
  VideoOff,
  VolumeX,
  X,
} from 'lucide-react';
import {
  getMediaByFamily,
  MEDIUM_FAMILIES,
  MEDIUM_MAP,
} from '@/engine/presets/media';
import { PALETTES } from '@/engine/presets/palettes';
import { SCENE_MAP, SCENES, WORLD_CATEGORIES } from '@/engine/presets/scenes';
import { FONTS, STYLES } from '@/engine/presets/styles';
import { getBuiltInStudies } from '@/engine/webgl/studies';
import type { MediaInputController } from '@/hooks/useMediaInput';
import type {
  AudioMode,
  CameraState,
  EffectState,
  FontId,
  LightState,
  MediumFamily,
  MediumId,
  MediumParams,
  PaletteId,
  SceneId,
  StudioState,
  StudyId,
  StyleId,
  WorldCategory,
} from '@/types/studio';
import { Slider } from './ui/Slider';
import { Toggle } from './ui/Toggle';

export type InspectorTab = 'style' | 'fx' | 'source';

interface InspectorProps {
  state: StudioState;
  tab: InspectorTab;
  media: MediaInputController;
  matchLook: boolean;
  favorites: SceneId[];
  audioEnergy: number;
  audioError: string | null;
  onTabChange: (tab: InspectorTab) => void;
  onClose: () => void;
  onToggleMatchLook: (val: boolean) => void;
  onSelectMedium: (id: MediumId) => void;
  onPatchMediumParams: (patch: Partial<MediumParams>) => void;
  onSelectStyle: (id: StyleId) => void;
  onSelectPalette: (id: PaletteId) => void;
  onSelectFont: (id: FontId) => void;
  onSelectScene: (id: SceneId, matchLook?: boolean) => void;
  onPatchLight: (patch: Partial<LightState>) => void;
  onPatchFx: (patch: Partial<EffectState>) => void;
  onPatchCamera: (patch: Partial<CameraState>) => void;
  onPatchRoot: (patch: Partial<StudioState>) => void;
  onResetEffects: () => void;
  onResetSimulation: () => void;
  onSelectStudy: (id: StudyId) => void;
  onOpenExport: () => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function Inspector({
  state,
  tab,
  media,
  matchLook,
  favorites,
  audioEnergy,
  audioError,
  onTabChange,
  onClose,
  onToggleMatchLook,
  onSelectMedium,
  onPatchMediumParams,
  onSelectStyle,
  onSelectPalette,
  onSelectFont,
  onSelectScene,
  onPatchLight,
  onPatchFx,
  onPatchCamera,
  onPatchRoot,
  onResetEffects,
  onResetSimulation,
  onSelectStudy,
  onOpenExport,
}: InspectorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const studies = getBuiltInStudies();
  const [worldCat, setWorldCat] = useState<'all' | 'favorites' | WorldCategory>('all');
  const activeMediumSpec = MEDIUM_MAP[state.medium];
  const activeFamily: MediumFamily = activeMediumSpec?.family ?? 'ascii';
  const [browseFamily, setBrowseFamily] = useState<MediumFamily>(activeFamily);
  useEffect(() => {
    setBrowseFamily(activeFamily);
  }, [activeFamily]);
  const effectiveFamily = browseFamily;
  const visibleMedia = getMediaByFamily(effectiveFamily);

  const visibleScenes =
    worldCat === 'all'
      ? SCENES
      : worldCat === 'favorites'
        ? SCENES.filter((s) => favorites.includes(s.id))
        : SCENES.filter((s) => s.category === worldCat);

  const activeIsSim = state.scene !== 'media' && Boolean(SCENE_MAP[state.scene]?.isStateful);

  return (
    <aside
      aria-label="Studio controls"
      className="w-full lg:w-[296px] h-[46dvh] lg:h-full shrink-0 bg-[#0e1014] border-t lg:border-t-0 lg:border-l border-[#1e2128] flex flex-col min-h-0"
    >
      <div className="h-10 shrink-0 px-2 border-b border-[#1e2128] flex items-center justify-between gap-1">
        <div role="tablist" className="flex items-center gap-0.5 flex-1">
          {([
            ['style', 'Medium'],
            ['fx', 'Light & FX'],
            ['source', 'Source'],
          ] as Array<[InspectorTab, string]>).map(([id, label]) => {
            const active = tab === id;
            return (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => onTabChange(id)}
                className={`h-7 px-2.5 rounded text-xs font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] ${
                  active
                    ? 'bg-[#1a1e26] text-[#f2f4f7]'
                    : 'text-[#8d95a5] hover:text-[#f2f4f7]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close controls panel"
          className="inline-flex items-center justify-center w-7 h-7 rounded text-[#8d95a5] hover:text-[#f2f4f7] hover:bg-[#1a1e26] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b]"
        >
          <X className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto studio-scroll p-3.5 space-y-5 min-h-0">
        {tab === 'style' && (
          <>
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#f2f4f7]">Artistic Medium</span>
                <span className="font-mono-num text-[10px] text-[#f59e0b]">
                  {activeMediumSpec.shortName}
                </span>
              </div>

              <div className="flex flex-wrap gap-1">
                {MEDIUM_FAMILIES.map((fam) => {
                  const selected = effectiveFamily === fam.id;
                  const isLive = activeFamily === fam.id;
                  return (
                    <button
                      key={fam.id}
                      type="button"
                      onClick={() => {
                        setBrowseFamily(fam.id);
                        if (fam.id === 'ascii') {
                          onSelectMedium('ascii');
                        } else {
                          const list = getMediaByFamily(fam.id);
                          if (list.length > 0 && activeFamily !== fam.id) {
                            onSelectMedium(list[0].id);
                          }
                        }
                      }}
                      className={`h-6 px-2 rounded text-[11px] font-medium cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-[#f59e0b] ${
                        selected
                          ? isLive
                            ? 'bg-[#1e1b14] text-[#f59e0b] border border-[#f59e0b]/50'
                            : 'bg-[#1c2029] text-[#f2f4f7] border border-[#2f3542]'
                          : isLive
                            ? 'bg-[#14171e] text-[#f59e0b]/80 border border-[#2a2f3a]'
                            : 'text-[#8d95a5] hover:text-[#f2f4f7] border border-transparent'
                      }`}
                    >
                      {fam.shortLabel}
                    </button>
                  );
                })}
              </div>

              {effectiveFamily === 'ascii' ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {STYLES.map((style) => {
                    const active = state.medium === 'ascii' && style.id === state.style;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => onSelectStyle(style.id)}
                        className={`text-left p-2 rounded border cursor-pointer transition-colors duration-120 focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.98] ${
                          active
                            ? 'bg-[#1a1e26] border-[#f59e0b]/60 text-[#f2f4f7]'
                            : 'bg-[#12151b] border-[#1f232c] text-[#c8ced8] hover:border-[#323846]'
                        }`}
                      >
                        <div className="text-xs font-medium leading-tight">{style.name}</div>
                        <div className="text-[11px] text-[#7b8494] mt-0.5 truncate">
                          {style.reference}
                        </div>
                        <div className="font-mono-num text-[11px] text-[#f59e0b] mt-1 tracking-wider truncate">
                          {style.sample}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {visibleMedia.map((med) => {
                    const active = med.id === state.medium;
                    return (
                      <button
                        key={med.id}
                        type="button"
                        onClick={() => onSelectMedium(med.id)}
                        className={`text-left p-2 rounded border cursor-pointer transition-colors duration-120 focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.98] ${
                          active
                            ? 'bg-[#1a1e26] border-[#f59e0b]/60 text-[#f2f4f7]'
                            : 'bg-[#12151b] border-[#1f232c] text-[#c8ced8] hover:border-[#323846]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium leading-tight truncate">
                            {med.shortName}
                          </span>
                          <span className="font-mono-num text-[9px] px-1 py-0.5 rounded bg-[#0c0e12] text-[#f59e0b] shrink-0">
                            {med.badge}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#7b8494] mt-1 truncate" title={med.reference}>
                          {med.reference}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {state.medium !== 'ascii' ? (
              <section className="space-y-3 pt-3 border-t border-[#1e2128]">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-[#f2f4f7]">{activeMediumSpec.name}</div>
                  <div className="text-[11px] text-[#7b8494]">{activeMediumSpec.reference}</div>
                </div>

                {activeMediumSpec.controls.variants && (
                  <div className="grid grid-cols-2 gap-1">
                    {activeMediumSpec.controls.variants.map((label, idx) => {
                      const active = state.mediumParams.variant === idx;
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => onPatchMediumParams({ variant: idx })}
                          className={`h-7 px-2 rounded border text-[11px] font-medium truncate cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-[#f59e0b] ${
                            active
                              ? 'bg-[#1a1e26] border-[#f59e0b]/60 text-[#f59e0b]'
                              : 'bg-[#12151b] border-[#1f232c] text-[#98a0ae] hover:text-[#f2f4f7]'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                <Slider
                  id="medium-scale"
                  label={activeMediumSpec.controls.scale}
                  min={0}
                  max={1}
                  step={0.01}
                  value={state.mediumParams.scale}
                  displayValue={`${Math.round(state.mediumParams.scale * 100)}%`}
                  onChange={(scale) => onPatchMediumParams({ scale })}
                />
                <Slider
                  id="medium-detail"
                  label={activeMediumSpec.controls.detail}
                  min={0}
                  max={1}
                  step={0.01}
                  value={state.mediumParams.detail}
                  displayValue={`${Math.round(state.mediumParams.detail * 100)}%`}
                  onChange={(detail) => onPatchMediumParams({ detail })}
                />
                <Slider
                  id="medium-texture"
                  label={activeMediumSpec.controls.texture}
                  min={0}
                  max={1}
                  step={0.01}
                  value={state.mediumParams.texture}
                  displayValue={`${Math.round(state.mediumParams.texture * 100)}%`}
                  onChange={(texture) => onPatchMediumParams({ texture })}
                />
                <Slider
                  id="medium-color-mix"
                  label={activeMediumSpec.controls.colorMix}
                  min={0}
                  max={1}
                  step={0.01}
                  value={state.mediumParams.colorMix}
                  displayValue={`${Math.round(state.mediumParams.colorMix * 100)}%`}
                  onChange={(colorMix) => onPatchMediumParams({ colorMix })}
                />

                {activeMediumSpec.supportsPlotterSvg && (
                  <button
                    type="button"
                    onClick={onOpenExport}
                    className="w-full h-7 rounded bg-[#14171e] hover:bg-[#1c202a] border border-[#f59e0b]/40 text-[11px] font-medium text-[#f59e0b] cursor-pointer"
                  >
                    Export AxiDraw Plotter SVG...
                  </button>
                )}
              </section>
            ) : (
              <>
                <section className="space-y-2 pt-3 border-t border-[#1e2128]">
                  <div className="text-xs font-semibold text-[#f2f4f7]">Glyph Typeface</div>
                  <div className="flex flex-wrap gap-1">
                    {FONTS.map((font) => {
                      const active = font.id === state.font;
                      return (
                        <button
                          key={font.id}
                          type="button"
                          onClick={() => onSelectFont(font.id)}
                          title={font.name}
                          className={`h-7 px-2 rounded border text-[11px] font-medium cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-[#f59e0b] ${
                            active
                              ? 'bg-[#1a1e26] border-[#f59e0b]/60 text-[#f2f4f7]'
                              : 'bg-[#12151b] border-[#1f232c] text-[#98a0ae] hover:text-[#f2f4f7] hover:border-[#323846]'
                          }`}
                        >
                          {font.shortName}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-2 pt-3 border-t border-[#1e2128]">
                  <div className="text-xs font-semibold text-[#f2f4f7]">Palette</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PALETTES.map((pal) => {
                      const active = pal.id === state.palette;
                      return (
                        <button
                          key={pal.id}
                          type="button"
                          onClick={() => onSelectPalette(pal.id)}
                          className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded border text-left cursor-pointer transition-colors duration-120 focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.98] ${
                            active
                              ? 'bg-[#1a1e26] border-[#f59e0b]/60 text-[#f2f4f7]'
                              : 'bg-[#12151b] border-[#1f232c] text-[#c8ced8] hover:border-[#323846]'
                          }`}
                        >
                          <span className="text-xs font-medium truncate">{pal.name}</span>
                          <span className="flex items-center gap-0.5 shrink-0" aria-hidden="true">
                            <span className="w-2 h-3 rounded-[1px]" style={{ backgroundColor: pal.bg }} />
                            <span className="w-2 h-3 rounded-[1px]" style={{ backgroundColor: pal.mid }} />
                            <span className="w-2 h-3 rounded-[1px]" style={{ backgroundColor: pal.accent }} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-3 pt-3 border-t border-[#1e2128]">
                  <Slider
                    id="cell-size"
                    label="Cell Size"
                    min={6}
                    max={22}
                    step={1}
                    value={state.fx.cellSize}
                    displayValue={`${state.fx.cellSize}px`}
                    onChange={(cellSize) => onPatchFx({ cellSize })}
                  />

                  {state.style === 'shape6d' && (
                    <Slider
                      id="shape-crunch"
                      label="6D Contrast Crunch"
                      min={0.2}
                      max={2.2}
                      step={0.05}
                      value={state.fx.shapeCrunch}
                      displayValue={state.fx.shapeCrunch.toFixed(2)}
                      onChange={(shapeCrunch) => onPatchFx({ shapeCrunch })}
                    />
                  )}

                  <Toggle
                    id="invert-toggle"
                    label="Invert Luminance"
                    checked={state.fx.invert}
                    onChange={(invert) => onPatchFx({ invert })}
                  />

                  <Toggle
                    id="custom-ramp-toggle"
                    label="Custom Character Ramp"
                    checked={state.useCustomRamp}
                    onChange={(useCustomRamp) => onPatchRoot({ useCustomRamp })}
                  />

                  {state.useCustomRamp && (
                    <div>
                      <label htmlFor="custom-ramp-input" className="block text-[11px] text-[#8d95a5] mb-1">
                        Dark to Bright Glyphs (up to 16)
                      </label>
                      <input
                        id="custom-ramp-input"
                        type="text"
                        maxLength={32}
                        value={state.customRamp}
                        onChange={(e) => onPatchRoot({ customRamp: e.target.value })}
                        placeholder=" .:-=+*#%@"
                        className="w-full h-8 px-2.5 rounded bg-[#08090b] border border-[#252932] text-xs font-mono-num text-[#f2f4f7] focus-visible:outline-2 focus-visible:outline-[#f59e0b]"
                      />
                    </div>
                  )}

                  <Toggle
                    id="phrase-toggle"
                    label="Weave Custom Phrase"
                    checked={state.usePhrase}
                    onChange={(usePhrase) => onPatchRoot({ usePhrase })}
                  />

                  {state.usePhrase && (
                    <div>
                      <label htmlFor="phrase-input" className="block text-[11px] text-[#8d95a5] mb-1">
                        Surface Text (up to 64 chars)
                      </label>
                      <input
                        id="phrase-input"
                        type="text"
                        maxLength={64}
                        value={state.phrase}
                        onChange={(e) => onPatchRoot({ phrase: e.target.value })}
                        className="w-full h-8 px-2.5 rounded bg-[#08090b] border border-[#252932] text-xs font-mono-num text-[#f2f4f7] focus-visible:outline-2 focus-visible:outline-[#f59e0b]"
                      />
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}

        {tab === 'fx' && (
          <>
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#f2f4f7]">Key Light Direction</span>
                <span className="font-mono-num text-[11px] text-[#8d95a5]">
                  {state.light.azimuth}° / {state.light.elevation}°
                </span>
              </div>
              <LightPad
                azimuth={state.light.azimuth}
                elevation={state.light.elevation}
                onChange={(azimuth, elevation) => onPatchLight({ azimuth, elevation })}
              />
            </section>

            <section className="space-y-3 pt-3 border-t border-[#1e2128]">
              <Slider
                id="key-intensity"
                label="Key Intensity"
                min={0.2}
                max={2.4}
                step={0.05}
                value={state.light.intensity}
                displayValue={state.light.intensity.toFixed(2)}
                onChange={(intensity) => onPatchLight({ intensity })}
              />
              <Slider
                id="rim-intensity"
                label="Rim Light"
                min={0}
                max={2.4}
                step={0.05}
                value={state.light.rimIntensity}
                displayValue={state.light.rimIntensity.toFixed(2)}
                onChange={(rimIntensity) => onPatchLight({ rimIntensity })}
              />
              <Slider
                id="exposure"
                label="Exposure"
                min={0.5}
                max={2.0}
                step={0.05}
                value={state.light.exposure}
                displayValue={state.light.exposure.toFixed(2)}
                onChange={(exposure) => onPatchLight({ exposure })}
              />
              <Slider
                id="contrast"
                label="Contrast"
                min={0.6}
                max={1.8}
                step={0.05}
                value={state.light.contrast}
                displayValue={state.light.contrast.toFixed(2)}
                onChange={(contrast) => onPatchLight({ contrast })}
              />
            </section>

            <section className="space-y-2.5 pt-3 border-t border-[#1e2128]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#f2f4f7]">Audio Reactive</span>
                <span className="font-mono-num text-[10px] text-[#8d95a5]">
                  {state.audioMode === 'off' ? 'OFF' : `${Math.round(audioEnergy * 100)}%`}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1">
                {([
                  ['off', 'Off', VolumeX],
                  ['synth', 'Synth', AudioLines],
                  ['mic', 'Mic', Mic],
                ] as Array<[AudioMode, string, typeof VolumeX]>).map(([mode, label, Icon]) => {
                  const active = state.audioMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onPatchRoot({ audioMode: mode })}
                      className={`inline-flex items-center justify-center gap-1 h-7 rounded border text-[11px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] ${
                        active
                          ? 'bg-[#1a1e26] border-[#f59e0b]/60 text-[#f59e0b]'
                          : 'bg-[#12151b] border-[#1f232c] text-[#98a0ae] hover:text-[#f2f4f7]'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>

              {state.audioMode !== 'off' && (
                <>
                  <div className="h-1.5 w-full rounded bg-[#151820] overflow-hidden">
                    <div
                      className="h-full bg-[#f59e0b] transition-[width] duration-75"
                      style={{ width: `${Math.min(100, Math.round(audioEnergy * 100))}%` }}
                    />
                  </div>
                  <Slider
                    id="audio-gain"
                    label="Audio Sensitivity"
                    min={0.3}
                    max={2.4}
                    step={0.05}
                    value={state.audioGain}
                    displayValue={`${state.audioGain.toFixed(2)}x`}
                    onChange={(audioGain) => onPatchRoot({ audioGain })}
                  />
                </>
              )}

              {audioError && (
                <p role="alert" className="text-[11px] text-[#fda4af] bg-[#2a1518] border border-[#7f1d1d] rounded px-2 py-1.5 m-0">
                  {audioError}
                </p>
              )}
            </section>

            <section className="space-y-3 pt-3 border-t border-[#1e2128]">
              <div className="text-xs font-semibold text-[#f2f4f7]">Edge &amp; Post</div>
              <Slider
                id="edge-mix"
                label="DoG / Sobel Edges"
                min={0}
                max={1}
                step={0.02}
                value={state.fx.edgeMix}
                displayValue={`${Math.round(state.fx.edgeMix * 100)}%`}
                onChange={(edgeMix) => onPatchFx({ edgeMix })}
              />
              <Slider
                id="edge-thresh"
                label="Edge Threshold"
                min={0.06}
                max={0.55}
                step={0.01}
                value={state.fx.edgeThreshold}
                displayValue={state.fx.edgeThreshold.toFixed(2)}
                onChange={(edgeThreshold) => onPatchFx({ edgeThreshold })}
              />
              <Slider
                id="bayer-dither"
                label="Bayer Dither"
                min={0}
                max={1}
                step={0.02}
                value={state.fx.dither}
                displayValue={`${Math.round(state.fx.dither * 100)}%`}
                onChange={(dither) => onPatchFx({ dither })}
              />
              <Slider
                id="bloom"
                label="Pyramid Bloom"
                min={0}
                max={1.1}
                step={0.02}
                value={state.fx.bloom}
                displayValue={state.fx.bloom.toFixed(2)}
                onChange={(bloom) => onPatchFx({ bloom })}
              />
              <Slider
                id="trails"
                label="Phosphor Trails"
                min={0}
                max={0.84}
                step={0.02}
                value={state.fx.trails}
                displayValue={`${Math.round(state.fx.trails * 100)}%`}
                onChange={(trails) => onPatchFx({ trails })}
              />
              <Slider
                id="crt-fx"
                label="CRT Scanlines"
                min={0}
                max={1}
                step={0.02}
                value={state.fx.crt}
                displayValue={`${Math.round(state.fx.crt * 100)}%`}
                onChange={(crt) => onPatchFx({ crt })}
              />
            </section>

            <section className="space-y-3 pt-3 border-t border-[#1e2128]">
              <Toggle
                id="auto-orbit"
                label="Auto-Orbit Camera"
                checked={state.camera.autoOrbit}
                onChange={(autoOrbit) => onPatchCamera({ autoOrbit })}
              />
              <Slider
                id="motion-speed"
                label="Motion Speed"
                min={0}
                max={2.4}
                step={0.05}
                value={state.fx.motionSpeed}
                displayValue={`${state.fx.motionSpeed.toFixed(2)}x`}
                onChange={(motionSpeed) => onPatchFx({ motionSpeed })}
              />
              <button
                type="button"
                onClick={onResetEffects}
                className="w-full inline-flex items-center justify-center gap-1.5 h-8 rounded bg-[#14171e] hover:bg-[#1c202a] border border-[#262b36] text-xs font-medium text-[#c8ced8] hover:text-[#f2f4f7] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset FX &amp; Lighting</span>
              </button>
            </section>
          </>
        )}

        {tab === 'source' && (
          <>
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#f2f4f7]">
                  Worlds ({visibleScenes.length})
                </span>
                <label className="inline-flex items-center gap-1 text-[11px] text-[#8d95a5] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={matchLook}
                    onChange={(e) => onToggleMatchLook(e.target.checked)}
                    className="w-3 h-3 rounded accent-[#f59e0b]"
                  />
                  <span>Match look</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setWorldCat('all')}
                  className={`h-6 px-2 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                    worldCat === 'all'
                      ? 'bg-[#1c2029] text-[#f2f4f7] border border-[#2f3542]'
                      : 'text-[#8d95a5] hover:text-[#f2f4f7] border border-transparent'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setWorldCat('favorites')}
                  className={`inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                    worldCat === 'favorites'
                      ? 'bg-[#1c2029] text-[#f59e0b] border border-[#f59e0b]/40'
                      : 'text-[#8d95a5] hover:text-[#f2f4f7] border border-transparent'
                  }`}
                >
                  <Star className="w-2.5 h-2.5" />
                  <span>Saved</span>
                </button>
                {WORLD_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setWorldCat(cat.id)}
                    className={`h-6 px-2 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                      worldCat === cat.id
                        ? 'bg-[#1c2029] text-[#f2f4f7] border border-[#2f3542]'
                        : 'text-[#8d95a5] hover:text-[#f2f4f7] border border-transparent'
                    }`}
                  >
                    {cat.shortLabel}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-1.5 max-h-[248px] overflow-y-auto studio-scroll pr-0.5">
                {visibleScenes.length === 0 ? (
                  <div className="col-span-2 py-6 text-center text-[11px] text-[#7b8494]">
                    Star worlds in the gallery to save them here.
                  </div>
                ) : (
                  visibleScenes.map((scene) => {
                    const active = scene.id === state.scene;
                    return (
                      <button
                        key={scene.id}
                        type="button"
                        onClick={() => onSelectScene(scene.id, matchLook)}
                        className={`px-2 py-1.5 rounded border text-left cursor-pointer transition-colors duration-120 focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.98] ${
                          active
                            ? 'bg-[#1a1e26] border-[#f59e0b]/60 text-[#f2f4f7]'
                            : 'bg-[#12151b] border-[#1f232c] text-[#c8ced8] hover:border-[#323846]'
                        }`}
                      >
                        <div className="text-xs font-medium truncate">{scene.name}</div>
                        <div className="text-[10px] text-[#7b8494] truncate">{scene.reference}</div>
                      </button>
                    );
                  })
                )}
              </div>

              {activeIsSim && (
                <div className="flex items-center justify-between gap-2 rounded bg-[#13161d] border border-[#262b36] px-2.5 py-2">
                  <span className="text-[11px] text-[#9aa3b2] leading-snug">
                    Drag on canvas to paint &amp; disturb simulation
                  </span>
                  <button
                    type="button"
                    onClick={onResetSimulation}
                    className="shrink-0 h-6 px-2 rounded bg-[#1d222d] hover:bg-[#272d3b] text-[11px] font-medium text-[#f59e0b] cursor-pointer"
                  >
                    Reseed
                  </button>
                </div>
              )}
            </section>

            <section className="space-y-2 pt-3 border-t border-[#1e2128]">
              <label htmlFor="type3d-input" className="block text-xs font-semibold text-[#f2f4f7]">
                3D Extruded Type
              </label>
              <div className="flex gap-1.5">
                <input
                  id="type3d-input"
                  type="text"
                  maxLength={14}
                  value={state.customText}
                  onChange={(e) => {
                    onPatchRoot({ customText: e.target.value, scene: 'type3d' });
                  }}
                  placeholder="GLYPHSTAGE"
                  className="flex-1 h-8 px-2.5 rounded bg-[#08090b] border border-[#252932] text-xs font-mono-num text-[#f2f4f7] focus-visible:outline-2 focus-visible:outline-[#f59e0b]"
                />
              </div>
            </section>

            <section className="space-y-3 pt-3 border-t border-[#1e2128]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#f2f4f7]">Image, Video &amp; Webcam</span>
                {state.scene === 'media' && (
                  <span className="font-mono-num text-[11px] text-[#f59e0b] truncate max-w-[115px]">
                    {media.mediaLabel}
                  </span>
                )}
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) media.loadFile(file);
                  e.target.value = '';
                }}
              />

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded text-xs font-medium bg-[#171b22] hover:bg-[#1f242e] text-[#f2f4f7] border border-[#282d38] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.97]"
                >
                  <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span>Load File</span>
                </button>

                <button
                  type="button"
                  onClick={() => media.toggleWebcam()}
                  className={`inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded text-xs font-medium border cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.97] ${
                    media.webcamActive
                      ? 'bg-[#2a1518] text-[#fda4af] border-[#7f1d1d]'
                      : 'bg-[#171b22] hover:bg-[#1f242e] text-[#f2f4f7] border-[#282d38]'
                  }`}
                >
                  {media.webcamActive ? (
                    <>
                      <VideoOff className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>Stop Cam</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>Webcam</span>
                    </>
                  )}
                </button>
              </div>

              {media.hasVideo && !media.webcamActive && (
                <div className="rounded bg-[#12151c] border border-[#232834] p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={media.toggleVideoPlay}
                      aria-label={media.videoPlaying ? 'Pause video' : 'Play video'}
                      className="inline-flex items-center justify-center w-6 h-6 rounded bg-[#1d222d] text-[#f2f4f7] hover:text-[#f59e0b] cursor-pointer"
                    >
                      {media.videoPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.005}
                      value={media.videoProgress}
                      aria-label="Video playback position"
                      onChange={(e) => media.seekVideo(Number(e.target.value))}
                      className="studio-range flex-1"
                    />
                    <span className="font-mono-num text-[10px] text-[#8d95a5] shrink-0">
                      {formatTime(media.videoProgress * media.videoDuration)} / {formatTime(media.videoDuration)}
                    </span>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-[#7b8494] leading-snug m-0">
                Drop any image or video onto the viewport, or press Ctrl+V to paste from clipboard.
              </p>

              {media.error && (
                <p role="alert" className="text-xs text-[#fda4af] bg-[#2a1518] border border-[#7f1d1d] rounded px-2.5 py-1.5 m-0">
                  {media.error}
                </p>
              )}

              <div className="space-y-1.5">
                <div className="text-[11px] text-[#8d95a5]">Relief Studies</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {studies.map((st) => {
                    const active = state.scene === 'media' && state.mediaKind === 'study' && state.studyId === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => onSelectStudy(st.id)}
                        className={`px-2 py-1.5 rounded border text-[11px] font-medium truncate cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] ${
                          active
                            ? 'bg-[#1a1e26] border-[#f59e0b]/60 text-[#f2f4f7]'
                            : 'bg-[#12151b] border-[#1f232c] text-[#98a0ae] hover:text-[#f2f4f7]'
                        }`}
                      >
                        {st.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Slider
                id="media-parallax"
                label="3D Relief Parallax"
                min={0}
                max={1.4}
                step={0.05}
                value={state.mediaParallax}
                displayValue={state.mediaParallax.toFixed(2)}
                onChange={(mediaParallax) => onPatchRoot({ mediaParallax })}
              />

              <Slider
                id="media-threshold"
                label="Dark Background Gate"
                min={0}
                max={0.6}
                step={0.02}
                value={state.mediaThreshold}
                displayValue={`${Math.round(state.mediaThreshold * 100)}%`}
                onChange={(mediaThreshold) => onPatchRoot({ mediaThreshold })}
              />

              <Toggle
                id="media-mirror"
                label="Mirror Horizontal (Selfie)"
                checked={state.mediaMirror}
                onChange={(mediaMirror) => onPatchRoot({ mediaMirror })}
              />
            </section>
          </>
        )}
      </div>
    </aside>
  );
}

function LightPad({
  azimuth,
  elevation,
  onChange,
}: {
  azimuth: number;
  elevation: number;
  onChange: (azimuth: number, elevation: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);

  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 64;

  const azRad = (azimuth * Math.PI) / 180;
  const normR = Math.max(0.06, Math.min(1, (90 - elevation) / 160));
  const hx = cx + Math.sin(azRad) * normR * radius;
  const hy = cy - Math.cos(azRad) * normR * radius;

  const updatePointer = (clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = ((clientX - rect.left) / rect.width) * size - cx;
    const dy = ((clientY - rect.top) / rect.height) * size - cy;
    const dist = Math.min(radius, Math.hypot(dx, dy));
    const elDeg = Math.round(90 - (dist / radius) * 160);
    const azDeg = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
    onChange(azDeg, elDeg);
  };

  const handleKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const step = e.shiftKey ? 15 : 5;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(((azimuth - step + 540) % 360) - 180, elevation);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onChange(((azimuth + step + 540) % 360) - 180, elevation);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(azimuth, Math.min(85, elevation + step));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(azimuth, Math.max(-70, elevation - step));
    }
  };

  return (
    <div className="rounded bg-[#08090b] border border-[#1e2128] py-2 flex justify-center">
      <svg
        ref={svgRef}
        tabIndex={0}
        role="application"
        aria-label={`Key light direction pad, azimuth ${azimuth} degrees, elevation ${elevation} degrees. Use arrow keys or drag to adjust.`}
        viewBox={`0 0 ${size} ${size}`}
        className="w-36 h-36 touch-none select-none cursor-crosshair rounded-full focus-visible:outline-2 focus-visible:outline-[#f59e0b]"
        onKeyDown={handleKeyDown}
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          updatePointer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) updatePointer(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            // already released
          }
        }}
      >
        <circle cx={cx} cy={cy} r={radius} fill="#0e1014" stroke="#252932" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={radius * 0.5} fill="none" stroke="#1b1f27" strokeWidth="1" />
        <line x1={cx - radius} y1={cy} x2={cx + radius} y2={cy} stroke="#1b1f27" strokeWidth="1" />
        <line x1={cx} y1={cy - radius} x2={cx} y2={cy + radius} stroke="#1b1f27" strokeWidth="1" />
        <line x1={cx} y1={cy} x2={hx} y2={hy} stroke="#f59e0b" strokeWidth="1.5" strokeOpacity="0.8" />
        <circle cx={cx} cy={cy} r={3} fill="#4b5362" />
        <circle cx={hx} cy={hy} r={7} fill="#f59e0b" stroke="#08090b" strokeWidth="2" />
      </svg>
    </div>
  );
}
