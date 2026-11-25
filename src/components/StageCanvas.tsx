import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StudioAudioEngine } from '@/engine/audio/audioEngine';
import {
  generateContourSvg,
  generateSquiggleSvg,
  generateStippleTspSvg,
} from '@/engine/export/plotterSvg';
import { sampleAsciiGrid, type SampledAsciiFrame } from '@/engine/export/textSampler';
import { SCENE_MAP } from '@/engine/presets/scenes';
import { WebGLAsciiPipeline } from '@/engine/webgl/pipeline';
import type { FrameMetrics, SceneId, StudioState } from '@/types/studio';

export type PlotterSvgMode = 'squiggle' | 'stipple' | 'tsp' | 'contour';

export interface StageHandle {
  capturePng: (scale?: 1 | 2) => string | null;
  sampleTextFrame: (maxCols?: number) => SampledAsciiFrame | null;
  exportPlotterSvg: (mode: PlotterSvgMode) => string | null;
  getCanvas: () => HTMLCanvasElement | null;
  triggerBurst: (normX?: number, normY?: number) => void;
  setImageMedia: (source: HTMLImageElement | HTMLCanvasElement) => void;
  setVideoMedia: (video: HTMLVideoElement | null) => void;
  clearTrails: () => void;
  resetSimulation: () => void;
  resetFlyOffset: () => void;
  triggerTransition: () => void;
  setCustomShader: (source: string | null) => string | null;
  renderWorldThumbnail: (sceneId: Exclude<SceneId, 'media'>) => string | null;
}

interface StageCanvasProps {
  state: StudioState;
  paused: boolean;
  onCameraChange: (patch: { yaw?: number; pitch?: number; zoom?: number; autoOrbit?: boolean }) => void;
  onMetrics: (metrics: FrameMetrics) => void;
  onAudioError?: (error: string | null) => void;
  onDropFile: (file: File) => void;
}

export const StageCanvas = forwardRef<StageHandle, StageCanvasProps>(function StageCanvas(
  { state, paused, onCameraChange, onMetrics, onAudioError, onDropFile },
  ref
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pipelineRef = useRef<WebGLAsciiPipeline | null>(null);
  const audioRef = useRef<StudioAudioEngine | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const yawRef = useRef(state.camera.yaw);
  const pitchRef = useRef(state.camera.pitch);
  const targetYawRef = useRef(state.camera.yaw);
  const targetPitchRef = useRef(state.camera.pitch);
  const flyRef = useRef<[number, number, number]>([0, 0, 0]);
  const keysHeldRef = useRef<Set<string>>(new Set());
  const dirtyRef = useRef(true);

  const [webglError, setWebglError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    targetYawRef.current = state.camera.yaw;
    targetPitchRef.current = state.camera.pitch;
    dirtyRef.current = true;
  }, [state.camera.yaw, state.camera.pitch]);

  // Mark dirty whenever any studio parameter changes while paused
  useEffect(() => {
    dirtyRef.current = true;
  }, [state, paused]);

  useEffect(() => {
    pipelineRef.current?.clearTrails();
    flyRef.current = [0, 0, 0];
    pipelineRef.current?.setFlyOffset(0, 0, 0);
  }, [state.scene, state.palette, state.style, state.medium]);

  // Sync live audio mode (off / synth / mic)
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new StudioAudioEngine();
    }
    let cancelled = false;
    audioRef.current.setMode(state.audioMode).then((err) => {
      if (!cancelled) onAudioError?.(err);
    });
    return () => {
      cancelled = true;
    };
  }, [state.audioMode, onAudioError]);

  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  // Track WASD + Arrow keys for smooth 3D free-fly offset
  useEffect(() => {
    const flyKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    const onDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (flyKeys.has(e.code)) {
        if (e.code.startsWith('Arrow')) e.preventDefault();
        keysHeldRef.current.add(e.code);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      keysHeldRef.current.delete(e.code);
    };
    const onBlur = () => keysHeldRef.current.clear();

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    capturePng: (scale = 1) => {
      const canvas = canvasRef.current;
      const pipe = pipelineRef.current;
      if (!canvas || !pipe) return null;
      if (scale === 1) return canvas.toDataURL('image/png');

      // Render a crisp 2x high-DPI snapshot cleanly and restore immediately
      const origW = canvas.width;
      const origH = canvas.height;
      const hiW = Math.min(2560, origW * 2);
      const hiH = Math.min(1600, origH * 2);
      canvas.width = hiW;
      canvas.height = hiH;
      pipe.resize(hiW, hiH);
      pipe.render(stateRef.current, yawRef.current, pitchRef.current, 0, true);
      const url = canvas.toDataURL('image/png');
      canvas.width = origW;
      canvas.height = origH;
      pipe.resize(origW, origH);
      dirtyRef.current = true;
      return url;
    },
    sampleTextFrame: (maxCols = 110) => {
      const pipe = pipelineRef.current;
      const canvas = canvasRef.current;
      if (!pipe || !canvas) return null;
      const { width, height, pixels, edges } = pipe.readSceneBuffer();
      const aspect = canvas.width / Math.max(1, canvas.height);
      const cols = Math.max(
        40,
        Math.min(maxCols, Math.round(canvas.width / Math.max(6, stateRef.current.fx.cellSize * 1.1)))
      );
      const rows = Math.max(20, Math.round((cols / aspect) * 0.56));
      return sampleAsciiGrid(
        pixels,
        edges,
        width,
        height,
        cols,
        rows,
        stateRef.current,
        pipe.getShape6DBundle()
      );
    },
    exportPlotterSvg: (mode: PlotterSvgMode) => {
      const pipe = pipelineRef.current;
      if (!pipe) return null;
      const { width, height, pixels } = pipe.readSceneBuffer();
      const cur = stateRef.current;
      const mp = cur.mediumParams;
      if (mode === 'squiggle') {
        return generateSquiggleSvg(pixels, width, height, {
          lineCount: Math.round(28 + mp.scale * 62),
          frequency: 0.25 + mp.detail * 0.85,
          amplitude: 0.3 + mp.texture * 0.8,
          invert: cur.fx.invert,
        });
      }
      if (mode === 'contour') {
        return generateContourSvg(pixels, width, height, {
          levels: Math.round(7 + mp.scale * 16),
        });
      }
      return generateStippleTspSvg(pixels, width, height, {
        pointCount: Math.round(450 + mp.scale * 900),
        relaxIters: 4,
        tspSingleLine: mode === 'tsp',
        invert: cur.fx.invert,
      });
    },
    getCanvas: () => canvasRef.current,
    triggerBurst: (nx = 0.5, ny = 0.5) => {
      pipelineRef.current?.triggerBurst(nx, ny, stateRef.current);
      dirtyRef.current = true;
    },
    setImageMedia: (src) => {
      pipelineRef.current?.setImageMedia(src);
      dirtyRef.current = true;
    },
    setVideoMedia: (vid) => {
      pipelineRef.current?.setVideoMedia(vid);
      dirtyRef.current = true;
    },
    clearTrails: () => {
      pipelineRef.current?.clearTrails();
      dirtyRef.current = true;
    },
    resetSimulation: () => {
      pipelineRef.current?.resetSimulation();
      dirtyRef.current = true;
    },
    resetFlyOffset: () => {
      flyRef.current = [0, 0, 0];
      pipelineRef.current?.setFlyOffset(0, 0, 0);
      dirtyRef.current = true;
    },
    triggerTransition: () => {
      pipelineRef.current?.triggerTransition();
      dirtyRef.current = true;
    },
    setCustomShader: (src) => {
      const err = pipelineRef.current?.setCustomShader(src) ?? null;
      dirtyRef.current = true;
      return err;
    },
    renderWorldThumbnail: (sceneId) => {
      const pipe = pipelineRef.current;
      if (!pipe) return null;
      try {
        return pipe.renderWorldThumbnail(sceneId, stateRef.current);
      } catch {
        return null;
      }
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let pipe: WebGLAsciiPipeline;
    try {
      pipe = new WebGLAsciiPipeline(canvas);
      pipelineRef.current = pipe;
      setWebglError(null);
    } catch (err) {
      setWebglError(err instanceof Error ? err.message : 'Unable to initialize WebGL2 context.');
      return;
    }

    document.fonts?.ready.then(() => {
      const cur = stateRef.current;
      pipelineRef.current?.rebuildAtlases(cur.phrase, cur.customRamp, cur.font);
      dirtyRef.current = true;
    });

    const syncSize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.max(120, Math.floor(rect.width * dpr));
      const ph = Math.max(120, Math.floor(rect.height * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      pipe.resize(pw, ph);
      dirtyRef.current = true;
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(wrap);

    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      setWebglError('WebGL context lost. Reload or resize to recover.');
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    let hidden = document.hidden;
    const onVisibility = () => {
      hidden = document.hidden;
      if (!hidden) {
        lastTime = performance.now();
        dirtyRef.current = true;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    let rafId = 0;
    let lastTime = performance.now();
    let fpsClock = 0;
    let fpsFrames = 0;

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      if (hidden) return;

      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const cur = stateRef.current;

      // WASD / Arrow camera free-fly velocity
      const keys = keysHeldRef.current;
      let flyMoving = false;
      if (keys.size > 0) {
        const speed = 2.2 * dt;
        const yaw = yawRef.current;
        const fwdX = -Math.sin(yaw);
        const fwdZ = -Math.cos(yaw);
        const rightX = Math.cos(yaw);
        const rightZ = -Math.sin(yaw);

        if (keys.has('KeyW') || keys.has('ArrowUp')) {
          flyRef.current[0] += fwdX * speed;
          flyRef.current[2] += fwdZ * speed;
          flyMoving = true;
        }
        if (keys.has('KeyS') || keys.has('ArrowDown')) {
          flyRef.current[0] -= fwdX * speed;
          flyRef.current[2] -= fwdZ * speed;
          flyMoving = true;
        }
        if (keys.has('KeyD') || keys.has('ArrowRight')) {
          flyRef.current[0] += rightX * speed;
          flyRef.current[2] += rightZ * speed;
          flyMoving = true;
        }
        if (keys.has('KeyA') || keys.has('ArrowLeft')) {
          flyRef.current[0] -= rightX * speed;
          flyRef.current[2] -= rightZ * speed;
          flyMoving = true;
        }
        if (flyMoving) {
          flyRef.current[0] = Math.max(-8, Math.min(8, flyRef.current[0]));
          flyRef.current[2] = Math.max(-8, Math.min(8, flyRef.current[2]));
          pipe.setFlyOffset(flyRef.current[0], flyRef.current[1], flyRef.current[2]);
          dirtyRef.current = true;
        }
      }

      // Live audio FFT sampling
      const audio = audioRef.current?.sample(cur.audioGain);
      if (audio && cur.audioMode !== 'off') {
        pipe.setAudio(audio.bass, audio.mid, audio.high, audio.energy);
        if (audio.beat && !pausedRef.current) {
          pipe.triggerBurst(0.5 + (Math.random() - 0.5) * 0.25, 0.5 + (Math.random() - 0.5) * 0.2, cur, 0.72);
        }
        dirtyRef.current = true;
      } else {
        pipe.setAudio(0, 0, 0, 0);
      }

      if (!pausedRef.current && cur.camera.autoOrbit) {
        targetYawRef.current += dt * cur.camera.orbitSpeed * cur.fx.motionSpeed;
      }

      const damp = 1 - Math.exp(-10 * dt);
      const yawDelta = targetYawRef.current - yawRef.current;
      const pitchDelta = targetPitchRef.current - pitchRef.current;
      yawRef.current += yawDelta * damp;
      pitchRef.current += pitchDelta * damp;

      const cameraSettled = Math.abs(yawDelta) < 0.0005 && Math.abs(pitchDelta) < 0.0005;
      const isLiveVideo = cur.scene === 'media' && (cur.mediaKind === 'video' || cur.mediaKind === 'webcam');

      // Idle power optimization: skip GPU redraws when paused with settled camera & zero active effects
      if (
        pausedRef.current &&
        !dirtyRef.current &&
        cameraSettled &&
        !pipe.hasActiveEffects() &&
        !isLiveVideo &&
        !flyMoving
      ) {
        return;
      }
      dirtyRef.current = false;

      let metrics: FrameMetrics;
      try {
        metrics = pipe.render(cur, yawRef.current, pitchRef.current, dt, pausedRef.current);
      } catch (err) {
        setWebglError(err instanceof Error ? err.message : 'Shader execution failed.');
        return;
      }

      fpsFrames++;
      fpsClock += dt;
      if (fpsClock >= 0.45) {
        onMetrics({
          ...metrics,
          fps: Math.round(fpsFrames / fpsClock),
        });
        fpsFrames = 0;
        fpsClock = 0;
      }
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      pipe.dispose();
      pipelineRef.current = null;
    };
  }, [onMetrics]);

  // Multi-touch pointer map for pinch-to-zoom + single-pointer orbit/paint
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; startZoom: number } | null>(null);
  const dragRef = useRef<{ active: boolean; moved: number; lastX: number; lastY: number }>({
    active: false,
    moved: 0,
    lastX: 0,
    lastY: 0,
  });

  const isInteractiveSim = () => {
    const s = stateRef.current.scene;
    return s !== 'media' && Boolean(SCENE_MAP[s]?.isStateful);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
    const ny = 1 - (e.clientY - rect.top) / Math.max(1, rect.height);
    pipelineRef.current?.setPointer(nx, ny, true, true);
    dirtyRef.current = true;

    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      pinchRef.current = {
        dist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
        startZoom: stateRef.current.camera.zoom,
      };
      dragRef.current.active = false;
      return;
    }

    dragRef.current = {
      active: true,
      moved: 0,
      lastX: e.clientX,
      lastY: e.clientY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
    const ny = 1 - (e.clientY - rect.top) / Math.max(1, rect.height);
    pipelineRef.current?.setPointer(nx, ny, true, pointersRef.current.size > 0);
    dirtyRef.current = true;

    // Two-finger pinch-to-zoom on touch screens
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const curDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (pinchRef.current.dist > 12) {
        const scale = curDist / pinchRef.current.dist;
        const nextZoom = Math.max(0.5, Math.min(2.2, pinchRef.current.startZoom * scale));
        onCameraChange({ zoom: Number(nextZoom.toFixed(2)) });
      }
      return;
    }

    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    dragRef.current.moved += Math.hypot(dx, dy);

    // On interactive 2D PDE sim worlds, dragging paints/stirs instead of orbiting camera
    if (isInteractiveSim()) return;

    if (dragRef.current.moved > 4) {
      if (stateRef.current.camera.autoOrbit) {
        onCameraChange({ autoOrbit: false });
      }
      targetYawRef.current -= dx * 0.0075;
      targetPitchRef.current = Math.max(-1.05, Math.min(1.12, targetPitchRef.current + dy * 0.0065));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
    const ny = 1 - (e.clientY - rect.top) / Math.max(1, rect.height);
    pipelineRef.current?.setPointer(nx, ny, true, pointersRef.current.size > 0);

    if (!dragRef.current.active) return;
    const moved = dragRef.current.moved;
    dragRef.current.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // pointer already released
    }

    if (moved < 6) {
      pipelineRef.current?.triggerBurst(nx, ny, stateRef.current);
      dirtyRef.current = true;
    } else if (!isInteractiveSim()) {
      onCameraChange({ yaw: targetYawRef.current, pitch: targetPitchRef.current });
    }
  };

  const handleDoubleClick = () => {
    flyRef.current = [0, 0, 0];
    pipelineRef.current?.setFlyOffset(0, 0, 0);
    const spec = stateRef.current.scene === 'media' ? null : SCENE_MAP[stateRef.current.scene];
    onCameraChange({
      yaw: spec?.defaultCamera.yaw ?? 0.35,
      pitch: spec?.defaultCamera.pitch ?? 0.2,
      zoom: spec?.defaultCamera.zoom ?? 1.0,
    });
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const nextZoom = Math.max(0.5, Math.min(2.2, stateRef.current.camera.zoom - e.deltaY * 0.0009));
    onCameraChange({ zoom: Number(nextZoom.toFixed(2)) });
  };

  return (
    <div
      ref={wrapRef}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onDropFile(file);
      }}
      className="relative flex-1 w-full h-full min-h-0 min-w-0 overflow-hidden bg-[#050608] select-none"
    >
      {webglError ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
          <p className="text-sm font-medium text-[#f2f4f7]">{webglError}</p>
          <p className="text-xs text-[#8d95a5] mt-1">
            WebGL2 hardware acceleration is required for the shader stage.
          </p>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          aria-label="Interactive 3D ASCII viewport. Drag to orbit or paint simulations, pinch or scroll to zoom, click to shatter glyphs, WASD to fly."
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => pipelineRef.current?.setPointer(0.5, 0.5, false, false)}
          onDoubleClick={handleDoubleClick}
          onWheel={handleWheel}
          className="block w-full h-full cursor-crosshair touch-none"
        />
      )}

      {dragOver && (
        <div className="pointer-events-none absolute inset-3 rounded border border-dashed border-[#f59e0b] bg-[#08090b]/85 flex items-center justify-center">
          <span className="font-mono-num text-xs text-[#f2f4f7]">
            Drop image or video onto stage
          </span>
        </div>
      )}
    </div>
  );
});
