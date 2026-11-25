import { hexToVec3, PALETTE_MAP } from '@/engine/presets/palettes';
import { DEFAULT_LIGHT_STATE, SCENE_MAP } from '@/engine/presets/scenes';
import { STYLE_INDEX, STYLE_MAP } from '@/engine/presets/styles';
import { ASCII_FRAG } from '@/engine/shaders/ascii.glsl';
import { FULLSCREEN_VERT } from '@/engine/shaders/common.glsl';
import { EDGES_FRAG } from '@/engine/shaders/edges.glsl';
import {
  BLOOM_DOWN_FRAG,
  BLOOM_UP_FRAG,
  COMPOSITE_FRAG,
  PARTICLES_FRAG,
  PARTICLES_VERT,
  TRAIL_FRAG,
} from '@/engine/shaders/post.glsl';
import { STATEFUL_SIMS, WORLD_SHADERS } from '@/engine/shaders/worldRegistry';
import type { FontId, FrameMetrics, SceneId, StudioState } from '@/types/studio';
import {
  createProgram,
  createRenderTarget,
  destroyRenderTarget,
  resizeRenderTarget,
  uploadCanvasTexture,
  uploadRgbaDataTexture,
  type RenderTarget,
} from './context';
import {
  buildBrailleAtlasCanvas,
  buildExtrudedTextCanvas,
  buildMainAtlasCanvas,
  buildPhraseAtlasCanvas,
  buildShape6DAtlasAndVectors,
  type Shape6DAtlasBundle,
} from './fontAtlas';
import { NavierStokesFluidSolver } from './fluidSolver';
import { MediaRenderEngine } from './mediaEngine';
import { AsciiParticleSystem } from './particleSystem';
import { getBuiltInStudies } from './studies';

interface ProgramHandles {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

const MAX_CACHED_PROGRAMS = 16;

const SCENE_UNIFORM_NAMES = [
  'uResolution',
  'uTime',
  'uCamera',
  'uZoom',
  'uFlyOffset',
  'uLightDir',
  'uLightIntensity',
  'uRimIntensity',
  'uExposure',
  'uContrast',
  'uPointer',
  'uPointerActive',
  'uPointerDown',
  'uAudio',
  'uMediaParallax',
  'uMediaMirror',
  'uMediaThreshold',
  'uMediaAspect',
  'uMediaTex',
  'uTextTex',
  'uSimTex',
];

const SIM_UNIFORM_NAMES = [
  'uPrevSim',
  'uSimRes',
  'uTime',
  'uFrame',
  'uPointer',
  'uPointerActive',
  'uPointerDown',
  'uAudio',
];

function collectUniforms(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: string[]
): ProgramHandles {
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const name of names) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  return { program, uniforms };
}

export class WebGLAsciiPipeline {
  private gl: WebGL2RenderingContext;
  private quadVao: WebGLVertexArrayObject;
  private particleVao: WebGLVertexArrayObject;
  private particleVbo: WebGLBuffer;

  private scenePrograms = new Map<SceneId, ProgramHandles>();
  private simPrograms = new Map<SceneId, ProgramHandles>();
  private customProgram: ProgramHandles | null = null;
  private customSource: string | null = null;

  private edgeProg: ProgramHandles;
  private asciiProg: ProgramHandles;
  private particleProg: ProgramHandles;
  private trailProg: ProgramHandles;
  private bloomDownProg: ProgramHandles;
  private bloomUpProg: ProgramHandles;
  private compositeProg: ProgramHandles;

  private sceneRt: RenderTarget;
  private edgeRt: RenderTarget;
  private asciiRt: RenderTarget;
  private trailRts: [RenderTarget, RenderTarget];
  private bloomRts: [RenderTarget, RenderTarget, RenderTarget];
  private simRts: [RenderTarget, RenderTarget];
  private thumbRt: RenderTarget;
  private thumbSimRts: [RenderTarget, RenderTarget];
  private trailFlip = 0;
  private simFlip = 0;
  private simFrame = 0;
  private activeSimScene: SceneId | null = null;

  private mainAtlasTex: WebGLTexture;
  private phraseAtlasTex: WebGLTexture;
  private shapeAtlasTex: WebGLTexture;
  private shapeLutTex: WebGLTexture;
  private shapeBundle: Shape6DAtlasBundle;
  private brailleAtlasTex: WebGLTexture;
  private textTex: WebGLTexture;
  private mediaTex: WebGLTexture;
  private mediaAspect: [number, number] = [512, 512];

  private lastPhrase = '';
  private lastCustomRamp = '';
  private lastFont: FontId = 'plex';
  private lastCustomText = '';
  private lastStudyId = '';
  private videoEl: HTMLVideoElement | null = null;
  private particles = new AsciiParticleSystem();
  private mediaEngine: MediaRenderEngine;
  private fluidSolver: NavierStokesFluidSolver | null = null;
  private lastSceneHiRes = false;

  private width = 960;
  private height = 600;
  private simTime = 0;
  private pointerX = 0.5;
  private pointerY = 0.5;
  private pointerActive = 0;
  private pointerDown = 0;
  private audioBands: [number, number, number, number] = [0, 0, 0, 0];
  private flyOffset: [number, number, number] = [0, 0, 0];
  private transitionLevel = 0;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      throw new Error('WebGL2 is not available in this browser.');
    }
    this.gl = gl;

    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create VAO');
    this.quadVao = vao;

    this.edgeProg = collectUniforms(gl, createProgram(gl, FULLSCREEN_VERT, EDGES_FRAG), [
      'uSceneTex',
      'uTexelSize',
    ]);

    this.asciiProg = collectUniforms(gl, createProgram(gl, FULLSCREEN_VERT, ASCII_FRAG), [
      'uSceneTex',
      'uEdgeTex',
      'uMainAtlas',
      'uBrailleAtlas',
      'uShapeAtlas',
      'uShapeLut',
      'uPhraseAtlas',
      'uResolution',
      'uGrid',
      'uTime',
      'uStyle',
      'uEdgeMix',
      'uEdgeThreshold',
      'uDither',
      'uShapeCrunch',
      'uInvert',
      'uUsePhrase',
      'uPhraseLen',
      'uUseCustomRamp',
      'uBgColor',
      'uLowColor',
      'uMidColor',
      'uHighColor',
      'uAccentColor',
      'uUseSourceColor',
      'uLightMode',
      'uShockwaves',
      'uTransition',
    ]);

    this.particleProg = collectUniforms(gl, createProgram(gl, PARTICLES_VERT, PARTICLES_FRAG), [
      'uMainAtlas',
    ]);

    this.trailProg = collectUniforms(gl, createProgram(gl, FULLSCREEN_VERT, TRAIL_FRAG), [
      'uCurrentTex',
      'uPrevTex',
      'uDecay',
      'uBgColor',
      'uLightMode',
    ]);

    this.bloomDownProg = collectUniforms(gl, createProgram(gl, FULLSCREEN_VERT, BLOOM_DOWN_FRAG), [
      'uTex',
      'uTexelSize',
      'uPrefilter',
    ]);

    this.bloomUpProg = collectUniforms(gl, createProgram(gl, FULLSCREEN_VERT, BLOOM_UP_FRAG), [
      'uTex',
      'uTexelSize',
    ]);

    this.compositeProg = collectUniforms(gl, createProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG), [
      'uBaseTex',
      'uBloomTex',
      'uResolution',
      'uBloom',
      'uCrt',
      'uLightMode',
      'uBgColor',
    ]);

    const pVao = gl.createVertexArray();
    const pVbo = gl.createBuffer();
    if (!pVao || !pVbo) throw new Error('Failed to create particle buffers');
    this.particleVao = pVao;
    this.particleVbo = pVbo;

    gl.bindVertexArray(this.particleVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVbo);
    gl.bufferData(gl.ARRAY_BUFFER, 640 * 8 * 4, gl.DYNAMIC_DRAW);
    const strideBytes = 8 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, strideBytes, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, strideBytes, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, strideBytes, 12);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, strideBytes, 16);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 3, gl.FLOAT, false, strideBytes, 20);
    gl.bindVertexArray(null);

    this.sceneRt = createRenderTarget(gl, 480, 300, gl.LINEAR);
    this.edgeRt = createRenderTarget(gl, 480, 300, gl.LINEAR);
    this.asciiRt = createRenderTarget(gl, this.width, this.height, gl.LINEAR);
    this.trailRts = [
      createRenderTarget(gl, this.width, this.height, gl.LINEAR),
      createRenderTarget(gl, this.width, this.height, gl.LINEAR),
    ];
    this.bloomRts = [
      createRenderTarget(gl, 480, 300, gl.LINEAR),
      createRenderTarget(gl, 240, 150, gl.LINEAR),
      createRenderTarget(gl, 120, 75, gl.LINEAR),
    ];
    this.simRts = [
      createRenderTarget(gl, 256, 160, gl.LINEAR, gl.REPEAT, true),
      createRenderTarget(gl, 256, 160, gl.LINEAR, gl.REPEAT, true),
    ];
    this.thumbRt = createRenderTarget(gl, 256, 160, gl.LINEAR);
    this.thumbSimRts = [
      createRenderTarget(gl, 128, 80, gl.LINEAR, gl.REPEAT, true),
      createRenderTarget(gl, 128, 80, gl.LINEAR, gl.REPEAT, true),
    ];

    this.mainAtlasTex = uploadCanvasTexture(gl, null, buildMainAtlasCanvas('', 'plex'), gl.LINEAR, true);
    this.phraseAtlasTex = uploadCanvasTexture(
      gl,
      null,
      buildPhraseAtlasCanvas('GLYPHSTAGE ', 'plex'),
      gl.LINEAR,
      true
    );
    this.shapeBundle = buildShape6DAtlasAndVectors('plex');
    this.shapeAtlasTex = uploadCanvasTexture(gl, null, this.shapeBundle.canvas, gl.LINEAR, true);
    this.shapeLutTex = uploadRgbaDataTexture(gl, null, 96, 2, this.shapeBundle.lutData);
    this.brailleAtlasTex = uploadCanvasTexture(gl, null, buildBrailleAtlasCanvas(), gl.LINEAR, true);
    this.textTex = uploadCanvasTexture(gl, null, buildExtrudedTextCanvas('GLYPHSTAGE'), gl.LINEAR);

    const defaultStudy = getBuiltInStudies()[0];
    this.lastStudyId = defaultStudy.id;
    this.mediaTex = uploadCanvasTexture(gl, null, defaultStudy.canvas, gl.LINEAR);
    this.mediaAspect = [defaultStudy.canvas.width, defaultStudy.canvas.height];
    this.mediaEngine = new MediaRenderEngine(gl);
  }

  private getSceneProgram(sceneId: SceneId): ProgramHandles {
    const cached = this.scenePrograms.get(sceneId);
    if (cached) {
      // Refresh LRU recency
      this.scenePrograms.delete(sceneId);
      this.scenePrograms.set(sceneId, cached);
      return cached;
    }

    if (this.scenePrograms.size >= MAX_CACHED_PROGRAMS) {
      const oldestKey = this.scenePrograms.keys().next().value;
      if (oldestKey !== undefined) {
        const old = this.scenePrograms.get(oldestKey);
        if (old) this.gl.deleteProgram(old.program);
        this.scenePrograms.delete(oldestKey);
      }
    }

    const fragSource = WORLD_SHADERS[sceneId];
    const prog = collectUniforms(
      this.gl,
      createProgram(this.gl, FULLSCREEN_VERT, fragSource),
      SCENE_UNIFORM_NAMES
    );
    this.scenePrograms.set(sceneId, prog);
    return prog;
  }

  private getSimProgram(sceneId: SceneId): ProgramHandles | null {
    const pair = STATEFUL_SIMS[sceneId];
    if (!pair) return null;
    const cached = this.simPrograms.get(sceneId);
    if (cached) return cached;
    const prog = collectUniforms(
      this.gl,
      createProgram(this.gl, FULLSCREEN_VERT, pair.sim),
      SIM_UNIFORM_NAMES
    );
    this.simPrograms.set(sceneId, prog);
    return prog;
  }

  public setCustomShader(source: string | null): string | null {
    if (!source) {
      if (this.customProgram) {
        this.gl.deleteProgram(this.customProgram.program);
        this.customProgram = null;
      }
      this.customSource = null;
      return null;
    }
    if (source === this.customSource && this.customProgram) return null;
    try {
      const next = collectUniforms(
        this.gl,
        createProgram(this.gl, FULLSCREEN_VERT, source),
        SCENE_UNIFORM_NAMES
      );
      if (this.customProgram) this.gl.deleteProgram(this.customProgram.program);
      this.customProgram = next;
      this.customSource = source;
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Shader compile error';
    }
  }

  public hasActiveEffects(): boolean {
    return this.particles.hasActiveEffects || this.transitionLevel > 0.01;
  }

  public getShape6DBundle(): Shape6DAtlasBundle {
    return this.shapeBundle;
  }

  private syncSceneResolution(hiRes: boolean): void {
    const scale = hiRes ? 0.72 : 0.5;
    const capW = hiRes ? 1152 : 720;
    const capH = hiRes ? 720 : 480;
    const minW = hiRes ? 360 : 240;
    const minH = hiRes ? 240 : 160;
    const sceneW = Math.min(capW, Math.max(minW, Math.round(this.width * scale)));
    const sceneH = Math.min(capH, Math.max(minH, Math.round(this.height * scale)));
    if (this.sceneRt.width !== sceneW || this.sceneRt.height !== sceneH) {
      resizeRenderTarget(this.gl, this.sceneRt, sceneW, sceneH);
      resizeRenderTarget(this.gl, this.edgeRt, sceneW, sceneH);
    }
    this.lastSceneHiRes = hiRes;
  }

  public resize(pixelWidth: number, pixelHeight: number): void {
    const w = Math.max(64, Math.floor(pixelWidth));
    const h = Math.max(64, Math.floor(pixelHeight));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;

    this.syncSceneResolution(this.lastSceneHiRes);
    resizeRenderTarget(this.gl, this.asciiRt, w, h);
    resizeRenderTarget(this.gl, this.trailRts[0], w, h);
    resizeRenderTarget(this.gl, this.trailRts[1], w, h);
    resizeRenderTarget(this.gl, this.bloomRts[0], Math.max(64, Math.round(w * 0.5)), Math.max(64, Math.round(h * 0.5)));
    resizeRenderTarget(this.gl, this.bloomRts[1], Math.max(32, Math.round(w * 0.25)), Math.max(32, Math.round(h * 0.25)));
    resizeRenderTarget(this.gl, this.bloomRts[2], Math.max(16, Math.round(w * 0.125)), Math.max(16, Math.round(h * 0.125)));
    this.clearTrails();
  }

  public clearTrails(): void {
    const gl = this.gl;
    for (const rt of this.trailRts) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
      gl.viewport(0, 0, rt.width, rt.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.mediaEngine.resetTemporalState();
  }

  public resetSimulation(): void {
    this.simFrame = 0;
    this.fluidSolver?.reset();
  }

  public setPointer(normX: number, normY: number, active: boolean, down = false): void {
    this.pointerX = normX;
    this.pointerY = normY;
    this.pointerActive = active ? 1 : 0;
    this.pointerDown = down ? 1 : 0;
  }

  public setAudio(bass: number, mid: number, high: number, energy: number): void {
    this.audioBands = [bass, mid, high, energy];
  }

  public setFlyOffset(x: number, y: number, z: number): void {
    this.flyOffset = [x, y, z];
  }

  public triggerTransition(): void {
    this.transitionLevel = 1.0;
  }

  public triggerBurst(normX: number, normY: number, state: StudioState, strength = 1.0): void {
    const gl = this.gl;
    const pal = PALETTE_MAP[state.palette];
    let primary = hexToVec3(pal.high);
    const accent = hexToVec3(pal.accent);

    // Sample the live scene color under the clicked coordinate so shattered glyphs match the hit surface
    try {
      const px = Math.max(0, Math.min(this.sceneRt.width - 1, Math.floor(normX * this.sceneRt.width)));
      const py = Math.max(0, Math.min(this.sceneRt.height - 1, Math.floor(normY * this.sceneRt.height)));
      const pixel = new Uint8Array(4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneRt.fbo);
      gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const lum = (0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2]) / 255;
      if (lum > 0.14 && pal.useSourceColor) {
        primary = [pixel[0] / 255, pixel[1] / 255, pixel[2] / 255];
      }
    } catch {
      // fallback to palette highlight color
    }

    this.particles.burst(normX, normY, primary, accent, 120, strength);
  }

  public setImageMedia(source: HTMLImageElement | HTMLCanvasElement): void {
    this.videoEl = null;
    const w = source instanceof HTMLImageElement ? source.naturalWidth || source.width : source.width;
    const h = source instanceof HTMLImageElement ? source.naturalHeight || source.height : source.height;
    this.mediaAspect = [Math.max(1, w), Math.max(1, h)];
    this.mediaTex = uploadCanvasTexture(this.gl, this.mediaTex, source, this.gl.LINEAR);
  }

  public setVideoMedia(video: HTMLVideoElement | null): void {
    this.videoEl = video;
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      this.mediaAspect = [video.videoWidth, video.videoHeight];
    }
  }

  public rebuildAtlases(phrase: string, customRamp: string, font: FontId): void {
    const gl = this.gl;
    this.lastPhrase = phrase;
    this.lastCustomRamp = customRamp;
    this.lastFont = font;
    this.mainAtlasTex = uploadCanvasTexture(
      gl,
      this.mainAtlasTex,
      buildMainAtlasCanvas(customRamp, font),
      gl.LINEAR,
      true
    );
    this.phraseAtlasTex = uploadCanvasTexture(
      gl,
      this.phraseAtlasTex,
      buildPhraseAtlasCanvas(phrase, font),
      gl.LINEAR,
      true
    );
    this.shapeBundle = buildShape6DAtlasAndVectors(font);
    this.shapeAtlasTex = uploadCanvasTexture(
      gl,
      this.shapeAtlasTex,
      this.shapeBundle.canvas,
      gl.LINEAR,
      true
    );
    this.shapeLutTex = uploadRgbaDataTexture(gl, this.shapeLutTex, 96, 2, this.shapeBundle.lutData);
  }

  private stepStatefulSim(
    simProg: ProgramHandles,
    rts: [RenderTarget, RenderTarget],
    flip: number,
    frame: number,
    substeps: number,
    time: number
  ): { flip: number; frame: number } {
    const gl = this.gl;
    gl.useProgram(simProg.program);
    gl.bindVertexArray(this.quadVao);
    let curFlip = flip;
    let curFrame = frame;

    for (let s = 0; s < substeps; s++) {
      const prevRt = rts[curFlip];
      const nextRt = rts[1 - curFlip];
      gl.bindFramebuffer(gl.FRAMEBUFFER, nextRt.fbo);
      gl.viewport(0, 0, nextRt.width, nextRt.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, prevRt.texture);
      gl.uniform1i(simProg.uniforms.uPrevSim, 0);
      gl.uniform2f(simProg.uniforms.uSimRes, nextRt.width, nextRt.height);
      gl.uniform1f(simProg.uniforms.uTime, time + s * 0.004);
      gl.uniform1i(simProg.uniforms.uFrame, curFrame);
      gl.uniform2f(simProg.uniforms.uPointer, this.pointerX, this.pointerY);
      gl.uniform1f(simProg.uniforms.uPointerActive, this.pointerActive);
      gl.uniform1f(simProg.uniforms.uPointerDown, this.pointerDown);
      gl.uniform4f(
        simProg.uniforms.uAudio,
        this.audioBands[0],
        this.audioBands[1],
        this.audioBands[2],
        this.audioBands[3]
      );
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      curFlip = 1 - curFlip;
      curFrame++;
    }

    return { flip: curFlip, frame: curFrame };
  }

  public render(
    state: StudioState,
    cameraYaw: number,
    cameraPitch: number,
    dt: number,
    paused: boolean
  ): FrameMetrics {
    const gl = this.gl;
    if (!paused) {
      this.simTime += dt * state.fx.motionSpeed;
    }
    if (this.transitionLevel > 0) {
      this.transitionLevel = Math.max(0, this.transitionLevel - dt * 2.4);
    }

    if (
      state.font !== this.lastFont ||
      state.customRamp !== this.lastCustomRamp
    ) {
      this.rebuildAtlases(state.phrase, state.customRamp, state.font);
    } else if (state.phrase !== this.lastPhrase) {
      this.lastPhrase = state.phrase;
      this.phraseAtlasTex = uploadCanvasTexture(
        gl,
        this.phraseAtlasTex,
        buildPhraseAtlasCanvas(state.phrase, state.font),
        gl.LINEAR,
        true
      );
    }

    if (state.scene === 'type3d' && state.customText !== this.lastCustomText) {
      this.lastCustomText = state.customText;
      this.textTex = uploadCanvasTexture(
        gl,
        this.textTex,
        buildExtrudedTextCanvas(state.customText),
        gl.LINEAR
      );
    }

    if (state.scene === 'media') {
      if (state.mediaKind === 'study' && state.studyId !== this.lastStudyId) {
        const found = getBuiltInStudies().find((s) => s.id === state.studyId);
        if (found) {
          this.lastStudyId = found.id;
          this.setImageMedia(found.canvas);
        }
      } else if (
        (state.mediaKind === 'video' || state.mediaKind === 'webcam') &&
        this.videoEl &&
        this.videoEl.readyState >= 2 &&
        this.videoEl.videoWidth > 0
      ) {
        this.mediaAspect = [this.videoEl.videoWidth, this.videoEl.videoHeight];
        this.mediaTex = uploadCanvasTexture(gl, this.mediaTex, this.videoEl, gl.LINEAR);
      }
    }

    // Upgrade sceneRt resolution dynamically for non-ASCII artistic media
    this.syncSceneResolution(state.medium !== 'ascii');

    // Stateful simulation update: true incompressible Navier-Stokes for 'fluid', ping-pong PDE for other Sim Lab worlds
    let activeSimTex: WebGLTexture = this.simRts[this.simFlip].texture;
    if (state.scene === 'fluid') {
      if (!this.fluidSolver) {
        this.fluidSolver = new NavierStokesFluidSolver(gl);
      }
      if (!paused || this.activeSimScene !== 'fluid') {
        this.fluidSolver.step(
          this.quadVao,
          paused ? 0.016 : dt * Math.max(0.2, state.fx.motionSpeed),
          this.simTime,
          this.pointerX,
          this.pointerY,
          this.pointerActive,
          this.pointerDown,
          this.audioBands[0]
        );
      }
      this.activeSimScene = 'fluid';
      activeSimTex = this.fluidSolver.getDyeTexture();
    } else {
      const simPair = STATEFUL_SIMS[state.scene];
      if (simPair) {
        if (this.activeSimScene !== state.scene) {
          this.activeSimScene = state.scene;
          this.simFrame = 0;
        }
        const simProg = this.getSimProgram(state.scene);
        if (simProg && (!paused || this.simFrame < 2)) {
          // Warm-start first frame with extra substeps so coral/fire/slime appear rich instantly
          const steps = this.simFrame === 0 ? Math.max(simPair.substeps * 5, 24) : simPair.substeps;
          const stepped = this.stepStatefulSim(
            simProg,
            this.simRts,
            this.simFlip,
            this.simFrame,
            steps,
            this.simTime
          );
          this.simFlip = stepped.flip;
          this.simFrame = stepped.frame;
        }
        activeSimTex = this.simRts[this.simFlip].texture;
      } else {
        this.activeSimScene = null;
      }
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cellW = Math.max(5, state.fx.cellSize * 0.64 * dpr);
    const cellH = Math.max(8, state.fx.cellSize * dpr);
    const cols = Math.max(24, Math.floor(this.width / cellW));
    const rows = Math.max(16, Math.floor(this.height / cellH));

    const az = (state.light.azimuth * Math.PI) / 180;
    const el = (state.light.elevation * Math.PI) / 180;
    const lx = Math.sin(az) * Math.cos(el);
    const ly = Math.sin(el);
    const lz = Math.cos(az) * Math.cos(el);

    const sceneProg = this.customProgram ?? this.getSceneProgram(state.scene);
    const su = sceneProg.uniforms;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneRt.fbo);
    gl.viewport(0, 0, this.sceneRt.width, this.sceneRt.height);
    gl.useProgram(sceneProg.program);
    gl.uniform2f(su.uResolution, this.sceneRt.width, this.sceneRt.height);
    gl.uniform1f(su.uTime, this.simTime);
    gl.uniform2f(su.uCamera, cameraYaw, cameraPitch);
    gl.uniform1f(su.uZoom, state.camera.zoom);
    gl.uniform3f(su.uFlyOffset, this.flyOffset[0], this.flyOffset[1], this.flyOffset[2]);
    gl.uniform3f(su.uLightDir, lx, ly, lz);
    gl.uniform1f(su.uLightIntensity, state.light.intensity);
    gl.uniform1f(su.uRimIntensity, state.light.rimIntensity);
    gl.uniform1f(su.uExposure, state.light.exposure);
    gl.uniform1f(su.uContrast, state.light.contrast);
    gl.uniform2f(su.uPointer, this.pointerX, this.pointerY);
    gl.uniform1f(su.uPointerActive, this.pointerActive);
    gl.uniform1f(su.uPointerDown, this.pointerDown);
    gl.uniform4f(su.uAudio, this.audioBands[0], this.audioBands[1], this.audioBands[2], this.audioBands[3]);
    gl.uniform1f(su.uMediaParallax, state.mediaParallax);
    gl.uniform1f(su.uMediaMirror, state.mediaMirror && state.mediaKind === 'webcam' ? 1 : 0);
    gl.uniform1f(su.uMediaThreshold, state.mediaThreshold);
    gl.uniform2f(su.uMediaAspect, this.mediaAspect[0], this.mediaAspect[1]);

    if (su.uMediaTex) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.mediaTex);
      gl.uniform1i(su.uMediaTex, 0);
    }
    if (su.uTextTex) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.textTex);
      gl.uniform1i(su.uTextTex, 1);
    }
    if (su.uSimTex) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, activeSimTex);
      gl.uniform1i(su.uSimTex, 2);
    }

    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const pal = PALETTE_MAP[state.palette];
    const bg = hexToVec3(pal.bg);
    const low = hexToVec3(pal.low);
    const mid = hexToVec3(pal.mid);
    const high = hexToVec3(pal.high);
    const acc = hexToVec3(pal.accent);

    let pCount = 0;
    let effectiveLightMode = pal.lightMode;

    if (state.medium === 'ascii') {
      // DoG + Sobel directional edge pass
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.edgeRt.fbo);
      gl.viewport(0, 0, this.edgeRt.width, this.edgeRt.height);
      gl.useProgram(this.edgeProg.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneRt.texture);
      gl.uniform1i(this.edgeProg.uniforms.uSceneTex, 0);
      gl.uniform2f(this.edgeProg.uniforms.uTexelSize, 1 / this.sceneRt.width, 1 / this.sceneRt.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Update particles + shockwaves BEFORE ASCII pass so shockwave rings deform the live grid
      const particleData = this.particles.update(
        paused ? 0 : dt,
        this.width / Math.max(1, this.height)
      );
      pCount = particleData.length / 8;

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.asciiRt.fbo);
      gl.viewport(0, 0, this.asciiRt.width, this.asciiRt.height);
      this.drawAsciiPass(state, cols, rows, bg, low, mid, high, acc, pal.useSourceColor, pal.lightMode, true);

      if (pCount > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, pal.lightMode ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE);
        gl.useProgram(this.particleProg.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.mainAtlasTex);
        gl.uniform1i(this.particleProg.uniforms.uMainAtlas, 0);

        gl.bindVertexArray(this.particleVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, particleData);
        gl.drawArrays(gl.POINTS, 0, pCount);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(this.quadVao);
      }
    } else {
      // Pluggable non-ASCII artistic medium pass (Painterly, Ink, Print, Analog, Tessellation, Glitch, Optics)
      this.mediaEngine.render(
        state.medium,
        this.quadVao,
        this.sceneRt,
        this.asciiRt,
        state,
        cameraYaw,
        cameraPitch,
        this.simTime,
        paused,
        this.audioBands
      );
      effectiveLightMode = this.isLightPaperMedium(state);
    }

    // Temporal persistence trails
    const prevTrail = this.trailRts[this.trailFlip];
    const currTrail = this.trailRts[1 - this.trailFlip];
    gl.bindFramebuffer(gl.FRAMEBUFFER, currTrail.fbo);
    gl.viewport(0, 0, currTrail.width, currTrail.height);
    gl.useProgram(this.trailProg.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.asciiRt.texture);
    gl.uniform1i(this.trailProg.uniforms.uCurrentTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, prevTrail.texture);
    gl.uniform1i(this.trailProg.uniforms.uPrevTex, 1);
    gl.uniform1f(this.trailProg.uniforms.uDecay, paused ? 0 : Math.min(0.86, state.fx.trails));
    gl.uniform3f(this.trailProg.uniforms.uBgColor, bg[0], bg[1], bg[2]);
    gl.uniform1i(this.trailProg.uniforms.uLightMode, effectiveLightMode ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.trailFlip = 1 - this.trailFlip;

    // 3-Level Karis-weighted Kawase Pyramid Bloom (1/2 -> 1/4 -> 1/8 -> 1/4 -> 1/2)
    const bloomStrength = state.fx.bloom + this.audioBands[0] * 0.25;
    if (!effectiveLightMode && bloomStrength > 0.01) {
      const [bHalf, bQuarter, bEighth] = this.bloomRts;

      gl.useProgram(this.bloomDownProg.program);
      // Prefilter + Downscale to Half
      gl.bindFramebuffer(gl.FRAMEBUFFER, bHalf.fbo);
      gl.viewport(0, 0, bHalf.width, bHalf.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currTrail.texture);
      gl.uniform1i(this.bloomDownProg.uniforms.uTex, 0);
      gl.uniform2f(this.bloomDownProg.uniforms.uTexelSize, 1 / currTrail.width, 1 / currTrail.height);
      gl.uniform1i(this.bloomDownProg.uniforms.uPrefilter, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Downscale Half -> Quarter
      gl.bindFramebuffer(gl.FRAMEBUFFER, bQuarter.fbo);
      gl.viewport(0, 0, bQuarter.width, bQuarter.height);
      gl.bindTexture(gl.TEXTURE_2D, bHalf.texture);
      gl.uniform2f(this.bloomDownProg.uniforms.uTexelSize, 1 / bHalf.width, 1 / bHalf.height);
      gl.uniform1i(this.bloomDownProg.uniforms.uPrefilter, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Downscale Quarter -> Eighth
      gl.bindFramebuffer(gl.FRAMEBUFFER, bEighth.fbo);
      gl.viewport(0, 0, bEighth.width, bEighth.height);
      gl.bindTexture(gl.TEXTURE_2D, bQuarter.texture);
      gl.uniform2f(this.bloomDownProg.uniforms.uTexelSize, 1 / bQuarter.width, 1 / bQuarter.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Additive 9-tap tent upsample Eighth -> Quarter -> Half
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.bloomUpProg.program);

      gl.bindFramebuffer(gl.FRAMEBUFFER, bQuarter.fbo);
      gl.viewport(0, 0, bQuarter.width, bQuarter.height);
      gl.bindTexture(gl.TEXTURE_2D, bEighth.texture);
      gl.uniform1i(this.bloomUpProg.uniforms.uTex, 0);
      gl.uniform2f(this.bloomUpProg.uniforms.uTexelSize, 1 / bEighth.width, 1 / bEighth.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, bHalf.fbo);
      gl.viewport(0, 0, bHalf.width, bHalf.height);
      gl.bindTexture(gl.TEXTURE_2D, bQuarter.texture);
      gl.uniform2f(this.bloomUpProg.uniforms.uTexelSize, 1 / bQuarter.width, 1 / bQuarter.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
    }

    // Final screen composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.compositeProg.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currTrail.texture);
    gl.uniform1i(this.compositeProg.uniforms.uBaseTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomRts[0].texture);
    gl.uniform1i(this.compositeProg.uniforms.uBloomTex, 1);
    gl.uniform2f(this.compositeProg.uniforms.uResolution, this.width, this.height);
    gl.uniform1f(this.compositeProg.uniforms.uBloom, bloomStrength);
    gl.uniform1f(this.compositeProg.uniforms.uCrt, state.medium === 'crt' ? 0 : state.fx.crt);
    gl.uniform1i(this.compositeProg.uniforms.uLightMode, effectiveLightMode ? 1 : 0);
    gl.uniform3f(this.compositeProg.uniforms.uBgColor, bg[0], bg[1], bg[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    return {
      fps: 60,
      cols,
      rows,
      particles: pCount,
      elapsed: this.simTime,
      audioEnergy: this.audioBands[3],
    };
  }

  private isLightPaperMedium(state: StudioState): boolean {
    const v = state.mediumParams.variant;
    switch (state.medium) {
      case 'watercolor':
        return v !== 3;
      case 'fdog':
        return v !== 3;
      case 'lic':
        return v === 0;
      case 'tam':
        return v !== 3;
      case 'squiggle':
        return v === 0 || v === 2;
      case 'contour':
        return v === 0;
      case 'dither3d':
        return v === 2 || v === 3;
      case 'halftone':
        return v === 1 || v === 2;
      case 'risograph':
        return true;
      case 'stipple':
        return v === 0 || v === 1;
      default:
        return false;
    }
  }

  private drawAsciiPass(
    state: StudioState,
    cols: number,
    rows: number,
    bg: [number, number, number],
    low: [number, number, number],
    mid: [number, number, number],
    high: [number, number, number],
    acc: [number, number, number],
    useSourceColor: boolean,
    lightMode: boolean,
    withFx: boolean
  ): void {
    const gl = this.gl;
    const u = this.asciiProg.uniforms;
    gl.useProgram(this.asciiProg.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneRt.texture);
    gl.uniform1i(u.uSceneTex, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.edgeRt.texture);
    gl.uniform1i(u.uEdgeTex, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.mainAtlasTex);
    gl.uniform1i(u.uMainAtlas, 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.brailleAtlasTex);
    gl.uniform1i(u.uBrailleAtlas, 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.shapeAtlasTex);
    gl.uniform1i(u.uShapeAtlas, 4);

    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.shapeLutTex);
    gl.uniform1i(u.uShapeLut, 5);

    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.phraseAtlasTex);
    gl.uniform1i(u.uPhraseAtlas, 6);

    gl.uniform2f(u.uResolution, this.width, this.height);
    gl.uniform2f(u.uGrid, cols, rows);
    gl.uniform1f(u.uTime, this.simTime);
    gl.uniform1i(u.uStyle, STYLE_INDEX[state.style]);
    gl.uniform1f(u.uEdgeMix, state.fx.edgeMix);
    gl.uniform1f(u.uEdgeThreshold, state.fx.edgeThreshold);
    gl.uniform1f(u.uDither, state.fx.dither);
    gl.uniform1f(u.uShapeCrunch, state.fx.shapeCrunch);
    gl.uniform1i(u.uInvert, state.fx.invert ? 1 : 0);
    gl.uniform1i(u.uUsePhrase, state.usePhrase ? 1 : 0);
    gl.uniform1i(u.uPhraseLen, Math.min(64, Math.max(1, state.phrase.length)));
    gl.uniform1i(u.uUseCustomRamp, state.useCustomRamp ? 1 : 0);

    gl.uniform3f(u.uBgColor, bg[0], bg[1], bg[2]);
    gl.uniform3f(u.uLowColor, low[0], low[1], low[2]);
    gl.uniform3f(u.uMidColor, mid[0], mid[1], mid[2]);
    gl.uniform3f(u.uHighColor, high[0], high[1], high[2]);
    gl.uniform3f(u.uAccentColor, acc[0], acc[1], acc[2]);
    gl.uniform1i(u.uUseSourceColor, useSourceColor ? 1 : 0);
    gl.uniform1i(u.uLightMode, lightMode ? 1 : 0);
    gl.uniform4fv(u.uShockwaves, withFx ? this.particles.getShockwaveUniforms() : new Float32Array(16));
    gl.uniform1f(u.uTransition, withFx ? this.transitionLevel : 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Non-destructive live offscreen WebGL2 thumbnail generator for WorldBrowser cards
  public renderWorldThumbnail(sceneId: Exclude<SceneId, 'media'>, baseState: StudioState): string {
    const gl = this.gl;
    const spec = SCENE_MAP[sceneId];
    const styleSpec = STYLE_MAP[spec.suggestedStyle];
    const pal = PALETTE_MAP[spec.suggestedPalette];
    const bg = hexToVec3(pal.bg);
    const low = hexToVec3(pal.low);
    const mid = hexToVec3(pal.mid);
    const high = hexToVec3(pal.high);
    const acc = hexToVec3(pal.accent);

    const thumbState: StudioState = {
      ...baseState,
      scene: sceneId,
      style: spec.suggestedStyle,
      palette: spec.suggestedPalette,
      usePhrase: false,
      useCustomRamp: false,
      light: { ...DEFAULT_LIGHT_STATE },
      fx: { ...baseState.fx, ...styleSpec.defaults, invert: false },
    };

    let simTex = this.simRts[this.simFlip].texture;
    if (sceneId === 'fluid') {
      if (!this.fluidSolver) this.fluidSolver = new NavierStokesFluidSolver(gl);
      this.fluidSolver.step(this.quadVao, 0.016, 2.4, 0.5, 0.5, 0, 0, 0.25);
      simTex = this.fluidSolver.getDyeTexture();
    } else {
      const simPair = STATEFUL_SIMS[sceneId];
      if (simPair) {
        const simProg = this.getSimProgram(sceneId);
        if (simProg) {
          const res = this.stepStatefulSim(simProg, this.thumbSimRts, 0, 0, 32, 2.4);
          simTex = this.thumbSimRts[res.flip].texture;
        }
      }
    }

    const sceneProg = this.getSceneProgram(sceneId);
    const su = sceneProg.uniforms;
    const az = (DEFAULT_LIGHT_STATE.azimuth * Math.PI) / 180;
    const el = (DEFAULT_LIGHT_STATE.elevation * Math.PI) / 180;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneRt.fbo);
    gl.viewport(0, 0, this.sceneRt.width, this.sceneRt.height);
    gl.useProgram(sceneProg.program);
    gl.uniform2f(su.uResolution, this.sceneRt.width, this.sceneRt.height);
    gl.uniform1f(su.uTime, 2.4);
    gl.uniform2f(su.uCamera, spec.defaultCamera.yaw ?? 0.3, spec.defaultCamera.pitch ?? 0.2);
    gl.uniform1f(su.uZoom, spec.defaultCamera.zoom ?? 1.0);
    gl.uniform3f(su.uFlyOffset, 0, 0, 0);
    gl.uniform3f(su.uLightDir, Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    gl.uniform1f(su.uLightIntensity, DEFAULT_LIGHT_STATE.intensity);
    gl.uniform1f(su.uRimIntensity, DEFAULT_LIGHT_STATE.rimIntensity);
    gl.uniform1f(su.uExposure, DEFAULT_LIGHT_STATE.exposure);
    gl.uniform1f(su.uContrast, DEFAULT_LIGHT_STATE.contrast);
    gl.uniform2f(su.uPointer, 0.5, 0.5);
    gl.uniform1f(su.uPointerActive, 0);
    gl.uniform1f(su.uPointerDown, 0);
    gl.uniform4f(su.uAudio, 0, 0, 0, 0);
    if (su.uTextTex) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.textTex);
      gl.uniform1i(su.uTextTex, 1);
    }
    if (su.uSimTex) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, simTex);
      gl.uniform1i(su.uSimTex, 2);
    }
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.edgeRt.fbo);
    gl.viewport(0, 0, this.edgeRt.width, this.edgeRt.height);
    gl.useProgram(this.edgeProg.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneRt.texture);
    gl.uniform1i(this.edgeProg.uniforms.uSceneTex, 0);
    gl.uniform2f(this.edgeProg.uniforms.uTexelSize, 1 / this.sceneRt.width, 1 / this.sceneRt.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const tw = this.thumbRt.width;
    const th = this.thumbRt.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.thumbRt.fbo);
    gl.viewport(0, 0, tw, th);
    this.drawAsciiPass(thumbState, 52, 22, bg, low, mid, high, acc, pal.useSourceColor, pal.lightMode, false);

    const pixels = new Uint8Array(tw * th * 4);
    gl.readPixels(0, 0, tw, th, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Flip bottom-up WebGL readPixels into a tiny 2D canvas dataURL
    const out = document.createElement('canvas');
    out.width = tw;
    out.height = th;
    const ctx = out.getContext('2d');
    if (!ctx) return '';
    const img = ctx.createImageData(tw, th);
    for (let y = 0; y < th; y++) {
      const srcRow = (th - 1 - y) * tw * 4;
      const dstRow = y * tw * 4;
      for (let x = 0; x < tw * 4; x += 4) {
        img.data[dstRow + x] = pixels[srcRow + x];
        img.data[dstRow + x + 1] = pixels[srcRow + x + 1];
        img.data[dstRow + x + 2] = pixels[srcRow + x + 2];
        img.data[dstRow + x + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return out.toDataURL('image/webp', 0.85);
  }

  public readSceneBuffer(): { width: number; height: number; pixels: Uint8Array; edges: Uint8Array } {
    const gl = this.gl;
    const { width, height } = this.sceneRt;
    const pixels = new Uint8Array(width * height * 4);
    const edges = new Uint8Array(width * height * 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneRt.fbo);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.edgeRt.fbo);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, edges);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { width, height, pixels, edges };
  }

  public dispose(): void {
    const gl = this.gl;
    destroyRenderTarget(gl, this.sceneRt);
    destroyRenderTarget(gl, this.edgeRt);
    destroyRenderTarget(gl, this.asciiRt);
    destroyRenderTarget(gl, this.trailRts[0]);
    destroyRenderTarget(gl, this.trailRts[1]);
    for (const rt of this.bloomRts) destroyRenderTarget(gl, rt);
    destroyRenderTarget(gl, this.simRts[0]);
    destroyRenderTarget(gl, this.simRts[1]);
    destroyRenderTarget(gl, this.thumbRt);
    destroyRenderTarget(gl, this.thumbSimRts[0]);
    destroyRenderTarget(gl, this.thumbSimRts[1]);

    gl.deleteTexture(this.mainAtlasTex);
    gl.deleteTexture(this.phraseAtlasTex);
    gl.deleteTexture(this.shapeAtlasTex);
    gl.deleteTexture(this.shapeLutTex);
    gl.deleteTexture(this.brailleAtlasTex);
    gl.deleteTexture(this.textTex);
    gl.deleteTexture(this.mediaTex);

    for (const handle of this.scenePrograms.values()) gl.deleteProgram(handle.program);
    this.scenePrograms.clear();
    for (const handle of this.simPrograms.values()) gl.deleteProgram(handle.program);
    this.simPrograms.clear();
    if (this.customProgram) gl.deleteProgram(this.customProgram.program);

    gl.deleteProgram(this.edgeProg.program);
    gl.deleteProgram(this.asciiProg.program);
    gl.deleteProgram(this.particleProg.program);
    gl.deleteProgram(this.trailProg.program);
    gl.deleteProgram(this.bloomDownProg.program);
    gl.deleteProgram(this.bloomUpProg.program);
    gl.deleteProgram(this.compositeProg.program);

    this.mediaEngine.dispose();
    this.fluidSolver?.dispose();
    gl.deleteBuffer(this.particleVbo);
    gl.deleteVertexArray(this.particleVao);
    gl.deleteVertexArray(this.quadVao);
  }
}
