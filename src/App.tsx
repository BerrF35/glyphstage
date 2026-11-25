import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye } from 'lucide-react';
import { CommandPalette } from '@/components/CommandPalette';
import { DockBar } from '@/components/DockBar';
import { ExportDialog } from '@/components/ExportDialog';
import { Inspector, type InspectorTab } from '@/components/Inspector';
import { ShaderEditor } from '@/components/ShaderEditor';
import { StageCanvas, type StageHandle } from '@/components/StageCanvas';
import { TopBar } from '@/components/TopBar';
import { WorldBrowser } from '@/components/WorldBrowser';
import { SCENES } from '@/engine/presets/scenes';
import { encodeStudioHash } from '@/engine/presets/urlPreset';
import { getBuiltInStudies } from '@/engine/webgl/studies';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useMediaInput } from '@/hooks/useMediaInput';
import { useStudioState } from '@/hooks/useStudioState';
import type { FrameMetrics, SceneId, StudyId } from '@/types/studio';

export default function App() {
  const stageRef = useRef<StageHandle>(null);

  const {
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
  } = useStudioState();

  const [paused, setPaused] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1280 : true
  );
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('style');
  const [editorOpen, setEditorOpen] = useState(false);
  const [customShaderActive, setCustomShaderActive] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [worldsOpen, setWorldsOpen] = useState(false);
  const [matchWorldLook, setMatchWorldLook] = useState(true);
  const [tourActive, setTourActive] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [metrics, setMetrics] = useState<FrameMetrics>({
    fps: 60,
    cols: 120,
    rows: 64,
    particles: 0,
    elapsed: 0,
    audioEnergy: 0,
  });

  const media = useMediaInput({
    onImageLoaded: (img) => {
      stageRef.current?.setImageMedia(img);
      patchRoot({ scene: 'media', mediaKind: 'image' });
      patchCamera({ yaw: 0, pitch: 0, zoom: 1.0, autoOrbit: false });
    },
    onVideoLoaded: (video, kind) => {
      stageRef.current?.setVideoMedia(video);
      patchRoot({ scene: 'media', mediaKind: kind });
      patchCamera({ yaw: 0, pitch: 0, zoom: 1.0, autoOrbit: false });
    },
    onStopMedia: () => {
      stageRef.current?.setVideoMedia(null);
      const study = getBuiltInStudies()[0];
      if (study) stageRef.current?.setImageMedia(study.canvas);
      patchRoot({ mediaKind: 'study', studyId: 'dome' });
    },
  });

  const handleSelectScene = useCallback(
    (id: SceneId, matchLook = false) => {
      if (customShaderActive) {
        stageRef.current?.setCustomShader(null);
        setCustomShaderActive(false);
      }
      selectScene(id, matchLook);
    },
    [customShaderActive, selectScene]
  );

  const handleSelectStudy = useCallback(
    (id: StudyId) => {
      media.stopLiveMedia();
      const found = getBuiltInStudies().find((s) => s.id === id);
      if (found) stageRef.current?.setImageMedia(found.canvas);
      patchRoot({ scene: 'media', mediaKind: 'study', studyId: id });
      patchCamera({ yaw: 0, pitch: 0, zoom: 1.0, autoOrbit: false });
    },
    [media, patchCamera, patchRoot]
  );

  const handleToggleMedia = useCallback(() => {
    if (state.scene === 'media') {
      handleSelectScene('citadel', false);
    } else {
      patchRoot({ scene: 'media' });
      patchCamera({ yaw: 0, pitch: 0, zoom: 1.0, autoOrbit: false });
      setInspectorOpen(true);
      setInspectorTab('source');
    }
  }, [state.scene, handleSelectScene, patchRoot, patchCamera]);

  const handleStepScene = useCallback(
    (delta: number) => {
      const idx = SCENES.findIndex((s) => s.id === state.scene);
      const base = idx >= 0 ? idx : 0;
      const next = SCENES[(base + delta + SCENES.length) % SCENES.length];
      handleSelectScene(next.id, matchWorldLook);
    },
    [state.scene, handleSelectScene, matchWorldLook]
  );

  const handleShuffle = useCallback(() => {
    const others = SCENES.filter((s) => s.id !== state.scene);
    const pick = others[Math.floor(Math.random() * others.length)] ?? SCENES[0];
    stageRef.current?.triggerTransition();
    handleSelectScene(pick.id, true);
  }, [state.scene, handleSelectScene]);

  const handleResetView = useCallback(() => {
    stageRef.current?.resetFlyOffset();
    resetView();
  }, [resetView]);

  const triggerBurst = useCallback(() => {
    stageRef.current?.triggerBurst(0.5, 0.5);
  }, []);

  const handleToggleAudio = useCallback(() => {
    patchRoot({ audioMode: state.audioMode === 'off' ? 'synth' : 'off' });
  }, [state.audioMode, patchRoot]);

  const handleCopyShare = useCallback(async () => {
    const hash = encodeStudioHash(state);
    try {
      window.history.replaceState(null, '', hash);
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}${hash}`);
    } catch {
      // Clipboard may be blocked in non-HTTPS contexts; hash is still updated in address bar
    }
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1800);
  }, [state]);

  const handleRequestThumb = useCallback((sceneId: Exclude<SceneId, 'media'>) => {
    const url = stageRef.current?.renderWorldThumbnail(sceneId);
    if (url) {
      setThumbs((prev) => (prev[sceneId] ? prev : { ...prev, [sceneId]: url }));
    }
  }, []);

  const handleApplyShader = useCallback((source: string) => {
    const err = stageRef.current?.setCustomShader(source) ?? null;
    if (!err) setCustomShaderActive(true);
    return err;
  }, []);

  const handleResetShader = useCallback(() => {
    stageRef.current?.setCustomShader(null);
    setCustomShaderActive(false);
  }, []);

  // Showcase auto-tour: advances smoothly every 10s with ASCII dissolve transition
  useEffect(() => {
    if (!tourActive || paused) return;
    const pool = favorites.length >= 2 ? SCENES.filter((s) => favorites.includes(s.id)) : SCENES;
    const id = window.setInterval(() => {
      const idx = pool.findIndex((s) => s.id === state.scene);
      const next = pool[(idx + 1 + pool.length) % pool.length] ?? SCENES[0];
      stageRef.current?.triggerTransition();
      handleSelectScene(next.id, true);
    }, 10000);
    return () => window.clearInterval(id);
  }, [tourActive, paused, favorites, state.scene, handleSelectScene]);

  useHotkeys({
    activeScene: state.scene,
    onTogglePause: () => setPaused((p) => !p),
    onBurst: triggerBurst,
    onResetView: handleResetView,
    onToggleChrome: () => setChromeHidden((h) => !h),
    onTogglePalette: () => setPaletteOpen((o) => !o),
    onToggleWorlds: () => setWorldsOpen((o) => !o),
    onToggleEditor: () => setEditorOpen((o) => !o),
    onToggleTour: () => setTourActive((t) => !t),
    onStepScene: handleStepScene,
    onShuffle: handleShuffle,
    onUndo: undo,
    onRedo: redo,
    onSelectScene: handleSelectScene,
  });

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-[#08090b] text-[#f2f4f7] overflow-hidden">
      {!chromeHidden && (
        <TopBar
          activeMedium={state.medium}
          activeStyle={state.style}
          activeScene={state.scene}
          audioMode={state.audioMode}
          inspectorOpen={inspectorOpen}
          editorOpen={editorOpen}
          shareCopied={shareCopied}
          onSelectMedium={selectMedium}
          onSelectStyle={selectStyle}
          onToggleAudio={handleToggleAudio}
          onToggleEditor={() => setEditorOpen((o) => !o)}
          onCopyShare={handleCopyShare}
          onToggleMedia={handleToggleMedia}
          onToggleInspector={() => setInspectorOpen((o) => !o)}
          onOpenExport={() => setExportOpen(true)}
        />
      )}

      <main className="flex-1 flex flex-col lg:flex-row min-h-0 min-w-0 relative overflow-hidden">
        <StageCanvas
          ref={stageRef}
          state={state}
          paused={paused}
          onCameraChange={patchCamera}
          onMetrics={setMetrics}
          onAudioError={setAudioError}
          onDropFile={media.loadFile}
        />

        {!chromeHidden && editorOpen && (
          <ShaderEditor
            open={editorOpen}
            activeScene={state.scene}
            customActive={customShaderActive}
            onApply={handleApplyShader}
            onReset={handleResetShader}
            onClose={() => setEditorOpen(false)}
          />
        )}

        {!chromeHidden && inspectorOpen && (
          <Inspector
            state={state}
            tab={inspectorTab}
            media={media}
            matchLook={matchWorldLook}
            favorites={favorites}
            audioEnergy={metrics.audioEnergy ?? 0}
            audioError={audioError}
            onTabChange={setInspectorTab}
            onClose={() => setInspectorOpen(false)}
            onToggleMatchLook={setMatchWorldLook}
            onSelectMedium={selectMedium}
            onPatchMediumParams={patchMediumParams}
            onSelectStyle={selectStyle}
            onSelectPalette={selectPalette}
            onSelectFont={(font) => patchRoot({ font })}
            onSelectScene={handleSelectScene}
            onPatchLight={patchLight}
            onPatchFx={patchFx}
            onPatchCamera={patchCamera}
            onPatchRoot={patchRoot}
            onResetEffects={resetEffects}
            onResetSimulation={() => stageRef.current?.resetSimulation()}
            onSelectStudy={handleSelectStudy}
            onOpenExport={() => setExportOpen(true)}
          />
        )}

        {chromeHidden && (
          <button
            type="button"
            onClick={() => setChromeHidden(false)}
            className="fixed bottom-4 right-4 z-30 inline-flex items-center gap-1.5 h-8 px-3 rounded bg-[#0e1014]/90 border border-[#2d323d] text-xs font-medium text-[#f2f4f7] hover:bg-[#1a1e26] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b]"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Show UI (H)</span>
          </button>
        )}
      </main>

      {!chromeHidden && (
        <DockBar
          activeScene={state.scene}
          paused={paused}
          tourActive={tourActive}
          metrics={metrics}
          onSelectScene={handleSelectScene}
          onStepScene={handleStepScene}
          onShuffle={handleShuffle}
          onToggleTour={() => setTourActive((t) => !t)}
          onUndo={undo}
          onOpenWorlds={() => setWorldsOpen(true)}
          onTogglePause={() => setPaused((p) => !p)}
          onBurst={triggerBurst}
          onResetView={handleResetView}
          onOpenPalette={() => setPaletteOpen(true)}
          onHideChrome={() => setChromeHidden(true)}
        />
      )}

      <WorldBrowser
        open={worldsOpen}
        activeScene={state.scene}
        matchLook={matchWorldLook}
        favorites={favorites}
        thumbs={thumbs}
        onRequestThumb={handleRequestThumb}
        onToggleFavorite={toggleFavorite}
        onToggleMatchLook={setMatchWorldLook}
        onSelectScene={handleSelectScene}
        onShuffle={handleShuffle}
        onClose={() => setWorldsOpen(false)}
      />

      <ExportDialog
        open={exportOpen}
        stageRef={stageRef}
        onClose={() => setExportOpen(false)}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelectScene={handleSelectScene}
        onSelectMedium={selectMedium}
        onSelectStyle={selectStyle}
        onSelectPalette={selectPalette}
        onSelectFont={(font) => patchRoot({ font })}
        onSelectAudio={(audioMode) => patchRoot({ audioMode })}
        onTriggerBurst={triggerBurst}
        onToggleWebcam={() => {
          setInspectorOpen(true);
          setInspectorTab('source');
          media.toggleWebcam();
        }}
        onToggleEditor={() => setEditorOpen((o) => !o)}
        onToggleTour={() => setTourActive((t) => !t)}
        onCopyShare={handleCopyShare}
        onUndo={undo}
        onResetEffects={resetEffects}
        onResetSimulation={() => stageRef.current?.resetSimulation()}
        onOpenExport={() => setExportOpen(true)}
      />
    </div>
  );
}
