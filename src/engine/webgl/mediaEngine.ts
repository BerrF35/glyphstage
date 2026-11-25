import { FULLSCREEN_VERT } from '@/engine/shaders/common.glsl';
import {
  CRT_LOTTES_FRAG,
  NTSC_PASS1_FRAG,
  NTSC_PASS2_FRAG,
  RUTTETRA_FRAG,
  RUTTETRA_VERT,
  WOSCOPE_BG_FRAG,
  WOSCOPE_FRAG,
  WOSCOPE_VERT,
} from '@/engine/shaders/media/analog.glsl';
import {
  IRIDESCENCE_FRAG,
  PIXELART_FRAG,
  PIXELSORT_MASK_FRAG,
  PIXELSORT_OUT_FRAG,
  PIXELSORT_STEP_FRAG,
  SLITSCAN_FRAG,
} from '@/engine/shaders/media/glitchOptics.glsl';
import {
  CONTOUR_FRAG,
  FDOG_FLOW_XDOG_FRAG,
  FDOG_PERP_FRAG,
  LIC_ENGRAVE_FRAG,
  SQUIGGLE_RENDER_FRAG,
  TAM_HATCH_FRAG,
} from '@/engine/shaders/media/ink.glsl';
import { KUWAHARA_FRAG, WATERCOLOR_FRAG } from '@/engine/shaders/media/painterly.glsl';
import {
  ETF_BILATERAL_FRAG,
  ETF_INIT_FRAG,
  JFA_INIT_FRAG,
  JFA_STEP_FRAG,
  PREFIX_SUM_X_FRAG,
  SQUIGGLE_SEED_FRAG,
} from '@/engine/shaders/media/primitives.glsl';
import {
  DITHER3D_FRAG,
  HALFTONE_FRAG,
  RISOGRAPH_FRAG,
  WERNESS_INIT_FRAG,
  WERNESS_OUT_FRAG,
  WERNESS_STEP_FRAG,
} from '@/engine/shaders/media/print.glsl';
import {
  MOSAIC_FRAG,
  STAINED_GLASS_FRAG,
  STIPPLE_FRAG,
} from '@/engine/shaders/media/tessellation.glsl';
import type { MediumId, StudioState } from '@/types/studio';
import {
  createProgram,
  createRenderTarget,
  createTexture2DArrayTarget,
  destroyRenderTarget,
  resizeRenderTarget,
  uploadMipmappedTexture2DArray,
  uploadRgbaDataTexture,
  uploadTexture3D,
  type RenderTarget,
  type TextureArrayTarget,
} from './context';
import {
  generateAiryThinFilmLut2D,
  generateDither3DVolume,
  generateSubstrateTexture,
  generateTamHatchPyramid,
} from './mediaLuts';

interface MediaProgram {
  program: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

const MAX_OSC_SEGMENTS = 3200;
const OSC_GRID_W = 84;
const OSC_GRID_H = 54;
const SLITSCAN_LAYERS = 64;
const RUTT_COLS = 144;
const RUTT_ROWS = 72;

/**
 * Modular WebGL2 Stylization Engine powering all 21 non-ASCII artistic media.
 * Resources & shaders are compiled lazily on first activation so ASCII startup remains instant
 * and unused shared primitives cost 0.0 ms.
 */
export class MediaRenderEngine {
  private gl: WebGL2RenderingContext;
  private programs = new Map<string, MediaProgram>();

  // Startup physical LUTs (created lazily on first non-ASCII render)
  private lutsReady = false;
  private dither3DTex: WebGLTexture | null = null;
  private ditherRampTex: WebGLTexture | null = null;
  private airyLutTex: WebGLTexture | null = null;
  private tamArrayTex: WebGLTexture | null = null;
  private substrateTex: WebGLTexture | null = null;

  // Shared GPU primitive targets (lazily allocated)
  private etfRts: [RenderTarget, RenderTarget] | null = null;
  private fdogRt: RenderTarget | null = null;
  private jfaRts: [RenderTarget, RenderTarget] | null = null;
  private wernessRts: [RenderTarget, RenderTarget] | null = null;
  private wernessPrevRt: RenderTarget | null = null;
  private wernessWarm = false;
  private ntscRt: RenderTarget | null = null;
  private sortRts: [RenderTarget, RenderTarget] | null = null;
  private prefixRts: [RenderTarget, RenderTarget] | null = null;
  private historyArray: TextureArrayTarget | null = null;
  private historyHead = 0;
  private historyFilled = false;

  // Real geometry resources for Woscope (instanced Gaussian beam quads) & Rutt-Etra (depth-tested ribbons)
  private oscSampleRt: RenderTarget | null = null;
  private oscSamplePixels = new Uint8Array(OSC_GRID_W * OSC_GRID_H * 4);
  private oscVao: WebGLVertexArrayObject | null = null;
  private oscQuadVbo: WebGLBuffer | null = null;
  private oscInstVbo: WebGLBuffer | null = null;
  private oscInstData = new Float32Array(MAX_OSC_SEGMENTS * 8);
  private oscFrameCounter = 0;
  private oscSegCount = 0;

  private ruttFbo: WebGLFramebuffer | null = null;
  private ruttDepthRb: WebGLRenderbuffer | null = null;
  private ruttTex: WebGLTexture | null = null;
  private ruttW = 0;
  private ruttH = 0;
  private ruttSkirtVao: WebGLVertexArrayObject | null = null;
  private ruttSkirtVbo: WebGLBuffer | null = null;
  private ruttLineVao: WebGLVertexArrayObject | null = null;
  private ruttLineVbo: WebGLBuffer | null = null;
  private copyProg: MediaProgram | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  private getProg(key: string, vert: string, frag: string, uniformNames: string[]): MediaProgram {
    const cached = this.programs.get(key);
    if (cached) return cached;
    const program = createProgram(this.gl, vert, frag);
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const name of uniformNames) {
      u[name] = this.gl.getUniformLocation(program, name);
    }
    const handle = { program, u };
    this.programs.set(key, handle);
    return handle;
  }

  private ensureLuts(): void {
    if (this.lutsReady) return;
    const gl = this.gl;
    this.lutsReady = true;

    const d3d = generateDither3DVolume(4);
    this.dither3DTex = uploadTexture3D(
      gl,
      d3d.width,
      d3d.height,
      d3d.depth,
      d3d.volumeData,
      gl.REPEAT,
      gl.CLAMP_TO_EDGE
    );
    this.ditherRampTex = uploadRgbaDataTexture(
      gl,
      null,
      d3d.rampWidth,
      1,
      d3d.rampData,
      gl.LINEAR,
      gl.CLAMP_TO_EDGE
    );

    const airy = generateAiryThinFilmLut2D(128, 1.48, 2.6);
    this.airyLutTex = uploadRgbaDataTexture(
      gl,
      null,
      airy.width,
      airy.height,
      airy.data,
      gl.LINEAR,
      gl.CLAMP_TO_EDGE
    );

    const tam = generateTamHatchPyramid();
    this.tamArrayTex = uploadMipmappedTexture2DArray(
      gl,
      tam.width,
      tam.height,
      tam.layers,
      tam.mipLevels
    );

    const sub = generateSubstrateTexture(256);
    this.substrateTex = uploadRgbaDataTexture(
      gl,
      null,
      sub.width,
      sub.height,
      sub.data,
      gl.LINEAR,
      gl.REPEAT
    );
  }

  private ensureEtf(w: number, h: number): [RenderTarget, RenderTarget] {
    if (!this.etfRts) {
      this.etfRts = [
        createRenderTarget(this.gl, w, h, this.gl.LINEAR, this.gl.CLAMP_TO_EDGE, true),
        createRenderTarget(this.gl, w, h, this.gl.LINEAR, this.gl.CLAMP_TO_EDGE, true),
      ];
    } else {
      resizeRenderTarget(this.gl, this.etfRts[0], w, h);
      resizeRenderTarget(this.gl, this.etfRts[1], w, h);
    }
    return this.etfRts;
  }

  /** Shared Primitive 1: Bilateral Edge Tangent Flow (Kang et al. NPAR 2007) */
  private computeBilateralEtf(
    quadVao: WebGLVertexArrayObject,
    sceneRt: RenderTarget,
    iterations = 2
  ): RenderTarget {
    const gl = this.gl;
    const [rtA, rtB] = this.ensureEtf(sceneRt.width, sceneRt.height);
    const tx = 1 / sceneRt.width;
    const ty = 1 / sceneRt.height;

    const initProg = this.getProg('etfInit', FULLSCREEN_VERT, ETF_INIT_FRAG, [
      'uSceneTex',
      'uTexelSize',
    ]);
    const smoothProg = this.getProg('etfBilateral', FULLSCREEN_VERT, ETF_BILATERAL_FRAG, [
      'uEtfTex',
      'uTexelSize',
      'uAxis',
    ]);

    gl.bindVertexArray(quadVao);
    gl.useProgram(initProg.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rtA.fbo);
    gl.viewport(0, 0, rtA.width, rtA.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
    gl.uniform1i(initProg.u.uSceneTex, 0);
    gl.uniform2f(initProg.u.uTexelSize, tx, ty);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(smoothProg.program);
    gl.uniform2f(smoothProg.u.uTexelSize, tx, ty);
    for (let it = 0; it < iterations; it++) {
      // Horizontal bilateral pass: rtA -> rtB
      gl.bindFramebuffer(gl.FRAMEBUFFER, rtB.fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, rtA.texture);
      gl.uniform1i(smoothProg.u.uEtfTex, 0);
      gl.uniform1i(smoothProg.u.uAxis, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Vertical bilateral pass: rtB -> rtA
      gl.bindFramebuffer(gl.FRAMEBUFFER, rtA.fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, rtB.texture);
      gl.uniform1i(smoothProg.u.uAxis, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    return rtA;
  }

  /** Shared Primitive 2: Jump Flooding Algorithm Voronoi (Rong & Tan I3D 2006) */
  private computeJfa(
    quadVao: WebGLVertexArrayObject,
    sceneRt: RenderTarget,
    etfRt: RenderTarget | null,
    cellPitch: number,
    importanceWeight: number,
    metric: number,
    time: number
  ): RenderTarget {
    const gl = this.gl;
    const jw = Math.min(512, Math.max(256, Math.round(sceneRt.width * 0.65)));
    const jh = Math.min(360, Math.max(180, Math.round(sceneRt.height * 0.65)));

    if (!this.jfaRts) {
      this.jfaRts = [
        createRenderTarget(gl, jw, jh, gl.NEAREST, gl.CLAMP_TO_EDGE, true),
        createRenderTarget(gl, jw, jh, gl.NEAREST, gl.CLAMP_TO_EDGE, true),
      ];
    } else {
      resizeRenderTarget(gl, this.jfaRts[0], jw, jh);
      resizeRenderTarget(gl, this.jfaRts[1], jw, jh);
    }

    const initProg = this.getProg('jfaInit', FULLSCREEN_VERT, JFA_INIT_FRAG, [
      'uSceneTex',
      'uResolution',
      'uCellPitch',
      'uTime',
      'uImportanceWeight',
    ]);
    const stepProg = this.getProg('jfaStep', FULLSCREEN_VERT, JFA_STEP_FRAG, [
      'uJfaTex',
      'uEtfTex',
      'uTexelSize',
      'uResolution',
      'uStep',
      'uMetric',
    ]);

    gl.bindVertexArray(quadVao);
    gl.useProgram(initProg.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.jfaRts[0].fbo);
    gl.viewport(0, 0, jw, jh);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
    gl.uniform1i(initProg.u.uSceneTex, 0);
    gl.uniform2f(initProg.u.uResolution, jw, jh);
    gl.uniform1f(initProg.u.uCellPitch, cellPitch);
    gl.uniform1f(initProg.u.uTime, time);
    gl.uniform1i(initProg.u.uImportanceWeight, importanceWeight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(stepProg.program);
    gl.uniform2f(stepProg.u.uTexelSize, 1 / jw, 1 / jh);
    gl.uniform2f(stepProg.u.uResolution, jw, jh);
    gl.uniform1i(stepProg.u.uMetric, metric);
    if (etfRt) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, etfRt.texture);
      gl.uniform1i(stepProg.u.uEtfTex, 1);
    }

    let flip = 0;
    const maxDim = Math.max(jw, jh);
    let step = 1;
    while (step * 2 < maxDim) step *= 2;
    // Standard JFA (step = N/2 ... 1) + 1 cleanup pass for exact Voronoi boundaries
    const steps: number[] = [];
    for (let s = step; s >= 1; s >>= 1) steps.push(s);
    steps.push(1);

    for (const s of steps) {
      const readRt = this.jfaRts[flip];
      const writeRt = this.jfaRts[1 - flip];
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeRt.fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readRt.texture);
      gl.uniform1i(stepProg.u.uJfaTex, 0);
      gl.uniform1f(stepProg.u.uStep, s);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      flip = 1 - flip;
    }

    return this.jfaRts[flip];
  }

  /** Shared Primitive 3: 9-pass Hillis-Steele horizontal prefix sum for FM Squiggle Waves */
  private computeSquigglePhase(
    quadVao: WebGLVertexArrayObject,
    sceneRt: RenderTarget,
    invert: boolean
  ): RenderTarget {
    const gl = this.gl;
    const pw = 512;
    const ph = 96;
    if (!this.prefixRts) {
      this.prefixRts = [
        createRenderTarget(gl, pw, ph, gl.LINEAR, gl.CLAMP_TO_EDGE, true),
        createRenderTarget(gl, pw, ph, gl.LINEAR, gl.CLAMP_TO_EDGE, true),
      ];
    }

    const seedProg = this.getProg('squiggleSeed', FULLSCREEN_VERT, SQUIGGLE_SEED_FRAG, [
      'uSceneTex',
      'uInvert',
    ]);
    const sumProg = this.getProg('prefixSumX', FULLSCREEN_VERT, PREFIX_SUM_X_FRAG, [
      'uTex',
      'uOffsetPx',
      'uWidth',
    ]);

    gl.bindVertexArray(quadVao);
    gl.useProgram(seedProg.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.prefixRts[0].fbo);
    gl.viewport(0, 0, pw, ph);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
    gl.uniform1i(seedProg.u.uSceneTex, 0);
    gl.uniform1f(seedProg.u.uInvert, invert ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(sumProg.program);
    gl.uniform1f(sumProg.u.uWidth, pw);
    let flip = 0;
    // 9 passes cover 2^9 = 512 pixels exactly!
    for (let k = 0; k < 9; k++) {
      const readRt = this.prefixRts[flip];
      const writeRt = this.prefixRts[1 - flip];
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeRt.fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readRt.texture);
      gl.uniform1i(sumProg.u.uTex, 0);
      gl.uniform1f(sumProg.u.uOffsetPx, 1 << k);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      flip = 1 - flip;
    }

    return this.prefixRts[flip];
  }

  private ensureOscBuffers(): void {
    if (this.oscVao) return;
    const gl = this.gl;
    this.oscSampleRt = createRenderTarget(gl, OSC_GRID_W, OSC_GRID_H, gl.LINEAR);

    const vao = gl.createVertexArray();
    const quadVbo = gl.createBuffer();
    const instVbo = gl.createBuffer();
    if (!vao || !quadVbo || !instVbo) throw new Error('Failed to create oscilloscope buffers');
    this.oscVao = vao;
    this.oscQuadVbo = quadVbo;
    this.oscInstVbo = instVbo;

    gl.bindVertexArray(vao);

    // 2 triangles covering unit quad [-1, 1]^2
    const quadVerts = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Per-instance attributes: aP0 (2f), aP1 (2f), aColInt (4f) -> stride 32 bytes
    gl.bindBuffer(gl.ARRAY_BUFFER, instVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.oscInstData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 8);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);
  }

  /**
   * Builds live XY vector contour traces from a tiny 84x54 scene downsample (zero GPU stall)
   * and optional audio Lissajous harmonic sweeps for Igor Null's woscope erf() beam renderer!
   */
  private updateOscilloscopeSegments(
    quadVao: WebGLVertexArrayObject,
    sceneRt: RenderTarget,
    state: StudioState,
    time: number,
    audioBands: [number, number, number, number]
  ): number {
    const gl = this.gl;
    this.ensureOscBuffers();
    const sampleRt = this.oscSampleRt!;

    this.oscFrameCounter++;
    // Refresh contour trace every 2nd frame for ultra-low readback cost while staying silky smooth
    if (this.oscFrameCounter % 2 === 1 || this.oscSegCount === 0) {
      if (!this.copyProg) {
        this.copyProg = this.getProg(
          'blitCopy',
          FULLSCREEN_VERT,
          `#version 300 es
          precision highp float;
          in vec2 vUv;
          out vec4 fragColor;
          uniform sampler2D uTex;
          void main() { fragColor = texture(uTex, vUv); }`,
          ['uTex']
        );
      }

      gl.bindVertexArray(quadVao);
      gl.useProgram(this.copyProg.program);
      gl.bindFramebuffer(gl.FRAMEBUFFER, sampleRt.fbo);
      gl.viewport(0, 0, OSC_GRID_W, OSC_GRID_H);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
      gl.uniform1i(this.copyProg.u.uTex, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0, 0, OSC_GRID_W, OSC_GRID_H, gl.RGBA, gl.UNSIGNED_BYTE, this.oscSamplePixels);

      const px = this.oscSamplePixels;
      const out = this.oscInstData;
      const variant = state.mediumParams.variant;
      const colorMix = state.mediumParams.colorMix;
      const density = state.mediumParams.detail;

      // Base CRT phosphor color (P31 Green, P11 Blue, Amber Radar, or Source Color)
      let baseR = 0.24;
      let baseG = 1.0;
      let baseB = 0.56;
      if (variant === 1) {
        baseR = 0.34;
        baseG = 0.72;
        baseB = 1.0;
      } else if (variant === 2) {
        baseR = 1.0;
        baseG = 0.68;
        baseB = 0.16;
      }

      let segs = 0;
      const pushSeg = (
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        sr: number,
        sg: number,
        sb: number,
        intensity: number
      ) => {
        if (segs >= MAX_OSC_SEGMENTS) return;
        const o = segs * 8;
        out[o] = x0;
        out[o + 1] = y0;
        out[o + 2] = x1;
        out[o + 3] = y1;
        if (variant === 3) {
          out[o + 4] = Math.min(1, sr * 1.25 + 0.1);
          out[o + 5] = Math.min(1, sg * 1.25 + 0.1);
          out[o + 6] = Math.min(1, sb * 1.25 + 0.1);
        } else {
          out[o + 4] = baseR * (1 - colorMix) + sr * colorMix;
          out[o + 5] = baseG * (1 - colorMix) + sg * colorMix;
          out[o + 6] = baseB * (1 - colorMix) + sb * colorMix;
        }
        out[o + 7] = intensity;
        segs++;
      };

      const lumAt = (x: number, y: number) => {
        const i = (y * OSC_GRID_W + x) * 4;
        return (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      };

      // Extract iso-luminance contour edges across 3 quantized contour thresholds (Marching-Squares-style)
      const thresholds = density > 0.66 ? [0.18, 0.42, 0.68] : density > 0.33 ? [0.22, 0.56] : [0.34];
      const step = density > 0.75 ? 1 : 2;

      for (const th of thresholds) {
        for (let y = 0; y < OSC_GRID_H - step; y += step) {
          for (let x = 0; x < OSC_GRID_W - step; x += step) {
            if (segs >= MAX_OSC_SEGMENTS - 160) break;
            const a = lumAt(x, y);
            const b = lumAt(x + step, y);
            const c = lumAt(x + step, y + step);
            const d = lumAt(x, y + step);

            const code = (a > th ? 1 : 0) | (b > th ? 2 : 0) | (c > th ? 4 : 0) | (d > th ? 8 : 0);
            if (code === 0 || code === 15) continue;

            const interp = (v0: number, v1: number) =>
              Math.max(0, Math.min(1, (th - v0) / (Math.abs(v1 - v0) > 1e-4 ? v1 - v0 : 1e-4)));

            const topX = x + interp(a, b) * step;
            const botX = x + interp(d, c) * step;
            const leftY = y + interp(a, d) * step;
            const rightY = y + interp(b, c) * step;

            const toNdcX = (gx: number) => (gx / (OSC_GRID_W - 1)) * 1.9 - 0.95;
            const toNdcY = (gy: number) => (gy / (OSC_GRID_H - 1)) * 1.9 - 0.95;

            const idx = (y * OSC_GRID_W + x) * 4;
            const sr = px[idx] / 255;
            const sg = px[idx + 1] / 255;
            const sb = px[idx + 2] / 255;
            const weight = 0.7 + th * 0.9;

            const pts: Array<[number, number]> = [];
            if ((a > th) !== (b > th)) pts.push([toNdcX(topX), toNdcY(y)]);
            if ((b > th) !== (c > th)) pts.push([toNdcX(x + step), toNdcY(rightY)]);
            if ((c > th) !== (d > th)) pts.push([toNdcX(botX), toNdcY(y + step)]);
            if ((d > th) !== (a > th)) pts.push([toNdcX(x), toNdcY(leftY)]);

            if (pts.length >= 2) {
              pushSeg(pts[0][0], pts[0][1], pts[1][0], pts[1][1], sr, sg, sb, weight);
            }
            if (pts.length === 4) {
              pushSeg(pts[2][0], pts[2][1], pts[3][0], pts[3][1], sr, sg, sb, weight);
            }
          }
        }
      }

      // Also trace sparse horizontal scanline deflection waves modulated by luminance + audio
      const scanStep = 6;
      for (let y = 3; y < OSC_GRID_H - 3 && segs < MAX_OSC_SEGMENTS - 80; y += scanStep) {
        let prevX = -0.95;
        let prevY = (y / (OSC_GRID_H - 1)) * 1.84 - 0.92;
        for (let x = 2; x < OSC_GRID_W - 1; x += 2) {
          const l = lumAt(x, y);
          const nx = (x / (OSC_GRID_W - 1)) * 1.9 - 0.95;
          const ny =
            (y / (OSC_GRID_H - 1)) * 1.84 -
            0.92 +
            l * 0.11 +
            Math.sin(nx * 9.0 + time * 4.0) * audioBands[0] * 0.04;
          if (l > 0.12) {
            const idx = (y * OSC_GRID_W + x) * 4;
            pushSeg(prevX, prevY, nx, ny, px[idx] / 255, px[idx + 1] / 255, px[idx + 2] / 255, 0.35 + l * 0.65);
          }
          prevX = nx;
          prevY = ny;
        }
      }

      this.oscSegCount = segs;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.oscInstVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.oscInstData.subarray(0, segs * 8));
    }

    return this.oscSegCount;
  }

  private ensureRuttEtraResources(w: number, h: number): void {
    const gl = this.gl;

    if (!this.ruttLineVao) {
      // Build static scanline ribbon line-strip vertices (RUTT_ROWS x RUTT_COLS)
      const lineVerts = new Float32Array(RUTT_ROWS * RUTT_COLS * 3);
      let ptr = 0;
      for (let r = 0; r < RUTT_ROWS; r++) {
        const v = (r + 0.5) / RUTT_ROWS;
        for (let c = 0; c < RUTT_COLS; c++) {
          const u = c / (RUTT_COLS - 1);
          lineVerts[ptr++] = u;
          lineVerts[ptr++] = v;
          lineVerts[ptr++] = 0.0;
        }
      }

      const lVao = gl.createVertexArray();
      const lVbo = gl.createBuffer();
      if (!lVao || !lVbo) throw new Error('Failed to create Rutt-Etra line VAO');
      this.ruttLineVao = lVao;
      this.ruttLineVbo = lVbo;
      gl.bindVertexArray(lVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, lVbo);
      gl.bufferData(gl.ARRAY_BUFFER, lineVerts, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);

      // Build opaque dark occlusion skirt triangle strips underneath each scanline ribbon
      const skirtVerts = new Float32Array(RUTT_ROWS * RUTT_COLS * 2 * 3);
      ptr = 0;
      for (let r = 0; r < RUTT_ROWS; r++) {
        const v = (r + 0.5) / RUTT_ROWS;
        for (let c = 0; c < RUTT_COLS; c++) {
          const u = c / (RUTT_COLS - 1);
          // Top vertex (displaced by luminance)
          skirtVerts[ptr++] = u;
          skirtVerts[ptr++] = v;
          skirtVerts[ptr++] = 0.0;
          // Bottom occlusion skirt anchor
          skirtVerts[ptr++] = u;
          skirtVerts[ptr++] = v;
          skirtVerts[ptr++] = 1.0;
        }
      }

      const sVao = gl.createVertexArray();
      const sVbo = gl.createBuffer();
      if (!sVao || !sVbo) throw new Error('Failed to create Rutt-Etra skirt VAO');
      this.ruttSkirtVao = sVao;
      this.ruttSkirtVbo = sVbo;
      gl.bindVertexArray(sVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, sVbo);
      gl.bufferData(gl.ARRAY_BUFFER, skirtVerts, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
      gl.bindVertexArray(null);
    }

    if (this.ruttW !== w || this.ruttH !== h || !this.ruttFbo) {
      if (this.ruttFbo) gl.deleteFramebuffer(this.ruttFbo);
      if (this.ruttDepthRb) gl.deleteRenderbuffer(this.ruttDepthRb);
      if (this.ruttTex) gl.deleteTexture(this.ruttTex);

      this.ruttW = w;
      this.ruttH = h;
      const tex = gl.createTexture();
      const rb = gl.createRenderbuffer();
      const fbo = gl.createFramebuffer();
      if (!tex || !rb || !fbo) throw new Error('Failed to create Rutt-Etra depth FBO');

      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      this.ruttTex = tex;
      this.ruttDepthRb = rb;
      this.ruttFbo = fbo;
    }
  }

  public resetTemporalState(): void {
    this.wernessWarm = false;
    this.historyFilled = false;
    this.historyHead = 0;
  }

  /**
   * Renders the selected non-ASCII artistic medium from `sceneRt` into `outputRt`.
   */
  public render(
    medium: Exclude<MediumId, 'ascii'>,
    quadVao: WebGLVertexArrayObject,
    sceneRt: RenderTarget,
    outputRt: RenderTarget,
    state: StudioState,
    cameraYaw: number,
    cameraPitch: number,
    time: number,
    paused: boolean,
    audioBands: [number, number, number, number]
  ): void {
    const gl = this.gl;
    this.ensureLuts();
    const mp = state.mediumParams;
    const outW = outputRt.width;
    const outH = outputRt.height;
    const sTx = 1 / sceneRt.width;
    const sTy = 1 / sceneRt.height;

    switch (medium) {
      case 'kuwahara': {
        const etf = this.computeBilateralEtf(quadVao, sceneRt, 2);
        const prog = this.getProg('kuwahara', FULLSCREEN_VERT, KUWAHARA_FRAG, [
          'uSceneTex',
          'uEtfTex',
          'uSubstrateTex',
          'uTexelSize',
          'uScale',
          'uDetail',
          'uTexture',
          'uColorMix',
          'uVariant',
        ]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(prog.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(prog.u.uSceneTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, etf.texture);
        gl.uniform1i(prog.u.uEtfTex, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.substrateTex);
        gl.uniform1i(prog.u.uSubstrateTex, 2);
        gl.uniform2f(prog.u.uTexelSize, sTx, sTy);
        gl.uniform1f(prog.u.uScale, mp.scale);
        gl.uniform1f(prog.u.uDetail, mp.detail);
        gl.uniform1f(prog.u.uTexture, mp.texture);
        gl.uniform1f(prog.u.uColorMix, mp.colorMix);
        gl.uniform1i(prog.u.uVariant, mp.variant);
        gl.bindVertexArray(quadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'watercolor': {
        const etf = this.computeBilateralEtf(quadVao, sceneRt, 1);
        const prog = this.getProg('watercolor', FULLSCREEN_VERT, WATERCOLOR_FRAG, [
          'uSceneTex',
          'uEtfTex',
          'uSubstrateTex',
          'uTexelSize',
          'uScale',
          'uDetail',
          'uTexture',
          'uColorMix',
          'uVariant',
          'uTime',
        ]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(prog.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(prog.u.uSceneTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, etf.texture);
        gl.uniform1i(prog.u.uEtfTex, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.substrateTex);
        gl.uniform1i(prog.u.uSubstrateTex, 2);
        gl.uniform2f(prog.u.uTexelSize, sTx, sTy);
        gl.uniform1f(prog.u.uScale, mp.scale);
        gl.uniform1f(prog.u.uDetail, mp.detail);
        gl.uniform1f(prog.u.uTexture, mp.texture);
        gl.uniform1f(prog.u.uColorMix, mp.colorMix);
        gl.uniform1i(prog.u.uVariant, mp.variant);
        gl.uniform1f(prog.u.uTime, time);
        gl.bindVertexArray(quadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'fdog': {
        const etf = this.computeBilateralEtf(quadVao, sceneRt, 2);
        if (!this.fdogRt) {
          this.fdogRt = createRenderTarget(gl, sceneRt.width, sceneRt.height, gl.LINEAR, gl.CLAMP_TO_EDGE, true);
        } else {
          resizeRenderTarget(gl, this.fdogRt, sceneRt.width, sceneRt.height);
        }

        const perpProg = this.getProg('fdogPerp', FULLSCREEN_VERT, FDOG_PERP_FRAG, [
          'uSceneTex',
          'uEtfTex',
          'uTexelSize',
          'uScale',
          'uDetail',
        ]);
        const flowProg = this.getProg('fdogFlow', FULLSCREEN_VERT, FDOG_FLOW_XDOG_FRAG, [
          'uSceneTex',
          'uEtfTex',
          'uFdogTex',
          'uSubstrateTex',
          'uTexelSize',
          'uResolution',
          'uScale',
          'uDetail',
          'uTexture',
          'uColorMix',
          'uVariant',
        ]);

        gl.bindVertexArray(quadVao);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fdogRt.fbo);
        gl.viewport(0, 0, this.fdogRt.width, this.fdogRt.height);
        gl.useProgram(perpProg.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(perpProg.u.uSceneTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, etf.texture);
        gl.uniform1i(perpProg.u.uEtfTex, 1);
        gl.uniform2f(perpProg.u.uTexelSize, sTx, sTy);
        gl.uniform1f(perpProg.u.uScale, mp.scale);
        gl.uniform1f(perpProg.u.uDetail, mp.detail);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(flowProg.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(flowProg.u.uSceneTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, etf.texture);
        gl.uniform1i(flowProg.u.uEtfTex, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.fdogRt.texture);
        gl.uniform1i(flowProg.u.uFdogTex, 2);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.substrateTex);
        gl.uniform1i(flowProg.u.uSubstrateTex, 3);
        gl.uniform2f(flowProg.u.uTexelSize, sTx, sTy);
        gl.uniform2f(flowProg.u.uResolution, outW, outH);
        gl.uniform1f(flowProg.u.uScale, mp.scale);
        gl.uniform1f(flowProg.u.uDetail, mp.detail);
        gl.uniform1f(flowProg.u.uTexture, mp.texture);
        gl.uniform1f(flowProg.u.uColorMix, mp.colorMix);
        gl.uniform1i(flowProg.u.uVariant, mp.variant);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'lic': {
        const etf = this.computeBilateralEtf(quadVao, sceneRt, 2);
        const prog = this.getProg('lic', FULLSCREEN_VERT, LIC_ENGRAVE_FRAG, [
          'uSceneTex',
          'uEtfTex',
          'uSubstrateTex',
          'uTexelSize',
          'uResolution',
          'uScale',
          'uDetail',
          'uTexture',
          'uColorMix',
          'uVariant',
        ]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(prog.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(prog.u.uSceneTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, etf.texture);
        gl.uniform1i(prog.u.uEtfTex, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.substrateTex);
        gl.uniform1i(prog.u.uSubstrateTex, 2);
        gl.uniform2f(prog.u.uTexelSize, sTx, sTy);
        gl.uniform2f(prog.u.uResolution, outW, outH);
        gl.uniform1f(prog.u.uScale, mp.scale);
        gl.uniform1f(prog.u.uDetail, mp.detail);
        gl.uniform1f(prog.u.uTexture, mp.texture);
        gl.uniform1f(prog.u.uColorMix, mp.colorMix);
        gl.uniform1i(prog.u.uVariant, mp.variant);
        gl.bindVertexArray(quadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'tam': {
        const etf = this.computeBilateralEtf(quadVao, sceneRt, 1);
        const prog = this.getProg('tam', FULLSCREEN_VERT, TAM_HATCH_FRAG, [
          'uSceneTex',
          'uEtfTex',
          'uSubstrateTex',
          'uTamArray',
          'uResolution',
          'uTexelSize',
          'uScale',
          'uDetail',
          'uTexture',
          'uColorMix',
          'uVariant',
        ]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(prog.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(prog.u.uSceneTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, etf.texture);
        gl.uniform1i(prog.u.uEtfTex, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.substrateTex);
        gl.uniform1i(prog.u.uSubstrateTex, 2);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tamArrayTex);
        gl.uniform1i(prog.u.uTamArray, 3);
        gl.uniform2f(prog.u.uResolution, outW, outH);
        gl.uniform2f(prog.u.uTexelSize, sTx, sTy);
        gl.uniform1f(prog.u.uScale, mp.scale);
        gl.uniform1f(prog.u.uDetail, mp.detail);
        gl.uniform1f(prog.u.uTexture, mp.texture);
        gl.uniform1f(prog.u.uColorMix, mp.colorMix);
        gl.uniform1i(prog.u.uVariant, mp.variant);
        gl.bindVertexArray(quadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'squiggle': {
        const phaseRt = this.computeSquigglePhase(quadVao, sceneRt, state.fx.invert);
        const prog = this.getProg('squiggleRender', FULLSCREEN_VERT, SQUIGGLE_RENDER_FRAG, [
          'uPhaseTex',
          'uSceneTex',
          'uSubstrateTex',
          'uResolution',
          'uScale',
          'uDetail',
          'uTexture',
          'uColorMix',
          'uVariant',
        ]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(prog.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, phaseRt.texture);
        gl.uniform1i(prog.u.uPhaseTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(prog.u.uSceneTex, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.substrateTex);
        gl.uniform1i(prog.u.uSubstrateTex, 2);
        gl.uniform2f(prog.u.uResolution, outW, outH);
        gl.uniform1f(prog.u.uScale, mp.scale);
        gl.uniform1f(prog.u.uDetail, mp.detail);
        gl.uniform1f(prog.u.uTexture, mp.texture);
        gl.uniform1f(prog.u.uColorMix, mp.colorMix);
        gl.uniform1i(prog.u.uVariant, mp.variant);
        gl.bindVertexArray(quadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'contour': {
        const prog = this.getProg('contour', FULLSCREEN_VERT, CONTOUR_FRAG, [
          'uSceneTex',
          'uSubstrateTex',
          'uScale',
          'uDetail',
          'uTexture',
          'uColorMix',
          'uVariant',
        ]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(prog.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(prog.u.uSceneTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.substrateTex);
        gl.uniform1i(prog.u.uSubstrateTex, 1);
        gl.uniform1f(prog.u.uScale, mp.scale);
        gl.uniform1f(prog.u.uDetail, mp.detail);
        gl.uniform1f(prog.u.uTexture, mp.texture);
        gl.uniform1f(prog.u.uColorMix, mp.colorMix);
        gl.uniform1i(prog.u.uVariant, mp.variant);
        gl.bindVertexArray(quadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'dither3d': {
        const prog = this.getProg('dither3d', FULLSCREEN_VERT, DITHER3D_FRAG, [
          'uSceneTex',
          'uDither3DTex',
          'uDitherRampTex',
          'uResolution',
          'uCamera',
          'uZoom',
          'uScale',
          'uDetail',
          'uTexture',
          'uColorMix',
          'uVariant',
        ]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(prog.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(prog.u.uSceneTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_3D, this.dither3DTex);
        gl.uniform1i(prog.u.uDither3DTex, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.ditherRampTex);
        gl.uniform1i(prog.u.uDitherRampTex, 2);
        gl.uniform2f(prog.u.uResolution, outW, outH);
        gl.uniform2f(prog.u.uCamera, cameraYaw, cameraPitch);
        gl.uniform1f(prog.u.uZoom, state.camera.zoom);
        gl.uniform1f(prog.u.uScale, mp.scale);
        gl.uniform1f(prog.u.uDetail, mp.detail);
        gl.uniform1f(prog.u.uTexture, mp.texture);
        gl.uniform1f(prog.u.uColorMix, mp.colorMix);
        gl.uniform1i(prog.u.uVariant, mp.variant);
        gl.bindVertexArray(quadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'werness': {
        const etf = this.computeBilateralEtf(quadVao, sceneRt, 1);
        // Resolution scaled by pixel pitch (crisp Macintosh / Obra Dinn pixel density)
        const pitch = Math.round(1.5 + (1 - mp.scale) * 2.5);
        const ww = Math.max(180, Math.min(640, Math.round(outW / pitch)));
        const wh = Math.max(120, Math.min(420, Math.round(outH / pitch)));

        if (!this.wernessRts || !this.wernessPrevRt) {
          this.wernessRts = [
            createRenderTarget(gl, ww, wh, gl.LINEAR, gl.CLAMP_TO_EDGE, true),
            createRenderTarget(gl, ww, wh, gl.LINEAR, gl.CLAMP_TO_EDGE, true),
          ];
          this.wernessPrevRt = createRenderTarget(gl, ww, wh, gl.NEAREST, gl.CLAMP_TO_EDGE, true);
          this.wernessWarm = false;
        } else {
          if (this.wernessRts[0].width !== ww || this.wernessRts[0].height !== wh) {
            resizeRenderTarget(gl, this.wernessRts[0], ww, wh);
            resizeRenderTarget(gl, this.wernessRts[1], ww, wh);
            resizeRenderTarget(gl, this.wernessPrevRt, ww, wh);
            this.wernessWarm = false;
          }
        }

        const initProg = this.getProg('wernessInit', FULLSCREEN_VERT, WERNESS_INIT_FRAG, [
          'uSceneTex',
          'uPrevDitherTex',
          'uEtfTex',
          'uEdgeBoost',
          'uWarmStart',
        ]);
        const stepProg = this.getProg('wernessStep', FULLSCREEN_VERT, WERNESS_STEP_FRAG, [
          'uTex',
          'uTexelSize',
          'uPx',
          'uPy',
          'uKernelMode',
        ]);
        const outProg = this.getProg('wernessOut', FULLSCREEN_VERT, WERNESS_OUT_FRAG, [
          'uDitherTex',
          'uSceneTex',
          'uColorMix',
          'uVariant',
        ]);

        gl.bindVertexArray(quadVao);
        gl.useProgram(initProg.program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.wernessRts[0].fbo);
        gl.viewport(0, 0, ww, wh);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(initProg.u.uSceneTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.wernessPrevRt.texture);
        gl.uniform1i(initProg.u.uPrevDitherTex, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, etf.texture);
        gl.uniform1i(initProg.u.uEtfTex, 2);
        gl.uniform1f(initProg.u.uEdgeBoost, mp.texture);
        gl.uniform1f(initProg.u.uWarmStart, this.wernessWarm ? 1.0 : 0.0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // Brent Werness 9-phase 3x3 modulo checkerboard passes (18 or 27 iterations = 2-3 full sweeps)
        const sweeps = mp.detail > 0.65 ? 3 : 2;
        const totalPasses = sweeps * 9;
        const kernelMode = mp.variant === 1 ? 1 : mp.variant === 2 ? 2 : 0;

        gl.useProgram(stepProg.program);
        gl.uniform2f(stepProg.u.uTexelSize, 1 / ww, 1 / wh);
        gl.uniform1i(stepProg.u.uKernelMode, kernelMode);
        let flip = 0;
        for (let t = 0; t < totalPasses; t++) {
          const readRt = this.wernessRts[flip];
          const writeRt = this.wernessRts[1 - flip];
          gl.bindFramebuffer(gl.FRAMEBUFFER, writeRt.fbo);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, readRt.texture);
          gl.uniform1i(stepProg.u.uTex, 0);
          gl.uniform1i(stepProg.u.uPx, t % 3);
          gl.uniform1i(stepProg.u.uPy, Math.floor(t / 3) % 3);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          flip = 1 - flip;
        }

        // Save converged buffer for next frame warm-start
        const converged = this.wernessRts[flip];
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, converged.fbo);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.wernessPrevRt.fbo);
        gl.blitFramebuffer(0, 0, ww, wh, 0, 0, ww, wh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        this.wernessWarm = true;

        // Crisp nearest-neighbor upscale to screen with Obra Dinn / Amber Mac SE color palette
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(outProg.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.wernessPrevRt.texture);
        gl.uniform1i(outProg.u.uDitherTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(outProg.u.uSceneTex, 1);
        gl.uniform1f(outProg.u.uColorMix, mp.colorMix);
        gl.uniform1i(outProg.u.uVariant, mp.variant);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'halftone': {
        const etf = this.computeBilateralEtf(quadVao, sceneRt, 1);
        const prog = this.getProg('halftone', FULLSCREEN_VERT, HALFTONE_FRAG, [
          'uSceneTex',
          'uEtfTex',
          'uSubstrateTex',
          'uResolution',
          'uTexelSize',
          'uScale',
          'uDetail',
          'uTexture',
          'uColorMix',
          'uVariant',
        ]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(prog.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(prog.u.uSceneTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, etf.texture);
        gl.uniform1i(prog.u.uEtfTex, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.substrateTex);
        gl.uniform1i(prog.u.uSubstrateTex, 2);
        gl.uniform2f(prog.u.uResolution, outW, outH);
        gl.uniform2f(prog.u.uTexelSize, sTx, sTy);
        gl.uniform1f(prog.u.uScale, mp.scale);
        gl.uniform1f(prog.u.uDetail, mp.detail);
        gl.uniform1f(prog.u.uTexture, mp.texture);
        gl.uniform1f(prog.u.uColorMix, mp.colorMix);
        gl.uniform1i(prog.u.uVariant, mp.variant);
        gl.bindVertexArray(quadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'risograph': {
        const prog = this.getProg('risograph', FULLSCREEN_VERT, RISOGRAPH_FRAG, [
          'uSceneTex',
          'uSubstrateTex',
          'uResolution',
          'uTexelSize',
          'uScale',
          'uDetail',
          'uTexture',
          'uColorMix',
          'uVariant',
        ]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(prog.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(prog.u.uSceneTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.substrateTex);
        gl.uniform1i(prog.u.uSubstrateTex, 1);
        gl.uniform2f(prog.u.uResolution, outW, outH);
        gl.uniform2f(prog.u.uTexelSize, sTx, sTy);
        gl.uniform1f(prog.u.uScale, mp.scale);
        gl.uniform1f(prog.u.uDetail, mp.detail);
        gl.uniform1f(prog.u.uTexture, mp.texture);
        gl.uniform1f(prog.u.uColorMix, mp.colorMix);
        gl.uniform1i(prog.u.uVariant, mp.variant);
        gl.bindVertexArray(quadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'crt': {
        const prog = this.getProg('crtLottes', FULLSCREEN_VERT, CRT_LOTTES_FRAG, [
          'uSceneTex',
          'uResolution',
          'uScale',
          'uDetail',
          'uTexture',
          'uColorMix',
          'uVariant',
        ]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(prog.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(prog.u.uSceneTex, 0);
        gl.uniform2f(prog.u.uResolution, outW, outH);
        gl.uniform1f(prog.u.uScale, mp.scale);
        gl.uniform1f(prog.u.uDetail, mp.detail);
        gl.uniform1f(prog.u.uTexture, mp.texture);
        gl.uniform1f(prog.u.uColorMix, mp.colorMix);
        gl.uniform1i(prog.u.uVariant, mp.variant);
        gl.bindVertexArray(quadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'ntsc': {
        if (!this.ntscRt) {
          this.ntscRt = createRenderTarget(gl, sceneRt.width, sceneRt.height, gl.LINEAR, gl.CLAMP_TO_EDGE, true);
        } else {
          resizeRenderTarget(gl, this.ntscRt, sceneRt.width, sceneRt.height);
        }
        const p1 = this.getProg('ntsc1', FULLSCREEN_VERT, NTSC_PASS1_FRAG, [
          'uSceneTex',
          'uResolution',
          'uTime',
          'uScale',
          'uDetail',
          'uTexture',
          'uVariant',
        ]);
        const p2 = this.getProg('ntsc2', FULLSCREEN_VERT, NTSC_PASS2_FRAG, [
          'uPass1Tex',
          'uTexelSize',
          'uTime',
          'uScale',
          'uDetail',
          'uTexture',
          'uColorMix',
          'uVariant',
        ]);

        gl.bindVertexArray(quadVao);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.ntscRt.fbo);
        gl.viewport(0, 0, this.ntscRt.width, this.ntscRt.height);
        gl.useProgram(p1.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(p1.u.uSceneTex, 0);
        gl.uniform2f(p1.u.uResolution, this.ntscRt.width, this.ntscRt.height);
        gl.uniform1f(p1.u.uTime, time);
        gl.uniform1f(p1.u.uScale, mp.scale);
        gl.uniform1f(p1.u.uDetail, mp.detail);
        gl.uniform1f(p1.u.uTexture, mp.texture);
        gl.uniform1i(p1.u.uVariant, mp.variant);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(p2.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.ntscRt.texture);
        gl.uniform1i(p2.u.uPass1Tex, 0);
        gl.uniform2f(p2.u.uTexelSize, 1 / this.ntscRt.width, 1 / this.ntscRt.height);
        gl.uniform1f(p2.u.uTime, time);
        gl.uniform1f(p2.u.uScale, mp.scale);
        gl.uniform1f(p2.u.uDetail, mp.detail);
        gl.uniform1f(p2.u.uTexture, mp.texture);
        gl.uniform1f(p2.u.uColorMix, mp.colorMix);
        gl.uniform1i(p2.u.uVariant, mp.variant);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'oscilloscope': {
        const segCount = this.updateOscilloscopeSegments(quadVao, sceneRt, state, time, audioBands);
        const bgProg = this.getProg('woscopeBg', FULLSCREEN_VERT, WOSCOPE_BG_FRAG, [
          'uResolution',
          'uVariant',
        ]);
        const beamProg = this.getProg('woscopeBeam', WOSCOPE_VERT, WOSCOPE_FRAG, [
          'uResolution',
          'uSigmaPx',
          'uGain',
        ]);

        // 1. Graticule CRT background
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.bindVertexArray(quadVao);
        gl.useProgram(bgProg.program);
        gl.uniform2f(bgProg.u.uResolution, outW, outH);
        gl.uniform1i(bgProg.u.uVariant, mp.variant);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // 2. Additive analytical erf() Gaussian electron beam segments (Igor Null woscope)
        if (segCount > 0 && this.oscVao) {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE);
          gl.useProgram(beamProg.program);
          gl.uniform2f(beamProg.u.uResolution, outW, outH);
          gl.uniform1f(beamProg.u.uSigmaPx, 1.0 + mp.scale * 3.6);
          gl.uniform1f(beamProg.u.uGain, 0.55 + mp.texture * 1.45);
          gl.bindVertexArray(this.oscVao);
          gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, segCount);
          gl.disable(gl.BLEND);
          gl.bindVertexArray(quadVao);
        }
        break;
      }

      case 'ruttetra': {
        this.ensureRuttEtraResources(outW, outH);
        const prog = this.getProg('ruttEtra', RUTTETRA_VERT, RUTTETRA_FRAG, [
          'uSceneTex',
          'uCamera',
          'uExtrude',
          'uTilt',
          'uVariant',
          'uColorMix',
          'uIsSkirtPass',
        ]);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.ruttFbo);
        gl.viewport(0, 0, outW, outH);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clearColor(0.02, 0.024, 0.032, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(prog.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(prog.u.uSceneTex, 0);
        gl.uniform2f(prog.u.uCamera, cameraYaw, cameraPitch);
        gl.uniform1f(prog.u.uExtrude, 0.16 + mp.detail * 0.72);
        gl.uniform1f(prog.u.uTilt, mp.texture);
        gl.uniform1i(prog.u.uVariant, mp.variant);
        gl.uniform1f(prog.u.uColorMix, mp.colorMix);

        // Density controls how many of the 72 scanlines are drawn (every 1st, 2nd, etc.)
        const rowStride = mp.scale < 0.35 ? 2 : 1;

        // Draw back-to-front per scanline: dark occlusion skirt first, then luminous ridge line!
        if (mp.variant !== 3 && this.ruttSkirtVao) {
          gl.enable(gl.POLYGON_OFFSET_FILL);
          gl.polygonOffset(1.0, 2.0);
          gl.uniform1i(prog.u.uIsSkirtPass, 1);
          gl.bindVertexArray(this.ruttSkirtVao);
          for (let r = 0; r < RUTT_ROWS; r += rowStride) {
            gl.drawArrays(gl.TRIANGLE_STRIP, r * RUTT_COLS * 2, RUTT_COLS * 2);
          }
          gl.disable(gl.POLYGON_OFFSET_FILL);
        }

        if (this.ruttLineVao) {
          gl.uniform1i(prog.u.uIsSkirtPass, 0);
          gl.bindVertexArray(this.ruttLineVao);
          const drawMode = mp.variant === 3 ? gl.POINTS : gl.LINE_STRIP;
          for (let r = 0; r < RUTT_ROWS; r += rowStride) {
            gl.drawArrays(drawMode, r * RUTT_COLS, RUTT_COLS);
          }
        }

        gl.disable(gl.DEPTH_TEST);
        gl.bindVertexArray(quadVao);

        // Blit depth-rendered Rutt-Etra frame into outputRt cleanly
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.ruttFbo);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, outputRt.fbo);
        gl.blitFramebuffer(0, 0, outW, outH, 0, 0, outW, outH, gl.COLOR_BUFFER_BIT, gl.LINEAR);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        break;
      }

      case 'stainedglass': {
        const pitch = Math.round(32 - mp.scale * 22);
        const jfa = this.computeJfa(quadVao, sceneRt, null, pitch, 0, 0, time);
        const prog = this.getProg('stainedGlass', FULLSCREEN_VERT, STAINED_GLASS_FRAG, [
          'uSceneTex',
          'uJfaTex',
          'uSubstrateTex',
          'uTexelSize',
          'uResolution',
          'uScale',
          'uDetail',
          'uTexture',
          'uColorMix',
          'uVariant',
        ]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(prog.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(prog.u.uSceneTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, jfa.texture);
        gl.uniform1i(prog.u.uJfaTex, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.substrateTex);
        gl.uniform1i(prog.u.uSubstrateTex, 2);
        gl.uniform2f(prog.u.uTexelSize, 1 / jfa.width, 1 / jfa.height);
        gl.uniform2f(prog.u.uResolution, outW, outH);
        gl.uniform1f(prog.u.uScale, mp.scale);
        gl.uniform1f(prog.u.uDetail, mp.detail);
        gl.uniform1f(prog.u.uTexture, mp.texture);
        gl.uniform1f(prog.u.uColorMix, mp.colorMix);
        gl.uniform1i(prog.u.uVariant, mp.variant);
        gl.bindVertexArray(quadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'mosaic': {
        const etf = this.computeBilateralEtf(quadVao, sceneRt, 2);
        const pitch = Math.round(22 - mp.scale * 15);
        // Metric = 1 activates Alejo Hausner's ETF-rotated Manhattan L1 Voronoi distance!
        const jfa = this.computeJfa(quadVao, sceneRt, etf, pitch, 0, 1, time);
        const prog = this.getProg('mosaic', FULLSCREEN_VERT, MOSAIC_FRAG, [
          'uSceneTex',
          'uJfaTex',
          'uEtfTex',
          'uSubstrateTex',
          'uTexelSize',
          'uResolution',
          'uScale',
          'uDetail',
          'uTexture',
          'uColorMix',
          'uVariant',
        ]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(prog.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(prog.u.uSceneTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, jfa.texture);
        gl.uniform1i(prog.u.uJfaTex, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, etf.texture);
        gl.uniform1i(prog.u.uEtfTex, 2);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.substrateTex);
        gl.uniform1i(prog.u.uSubstrateTex, 3);
        gl.uniform2f(prog.u.uTexelSize, 1 / jfa.width, 1 / jfa.height);
        gl.uniform2f(prog.u.uResolution, outW, outH);
        gl.uniform1f(prog.u.uScale, mp.scale);
        gl.uniform1f(prog.u.uDetail, mp.detail);
        gl.uniform1f(prog.u.uTexture, mp.texture);
        gl.uniform1f(prog.u.uColorMix, mp.colorMix);
        gl.uniform1i(prog.u.uVariant, mp.variant);
        gl.bindVertexArray(quadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'stipple': {
        const pitch = Math.round(13 - mp.scale * 8);
        // ImportanceWeight = 1 activates Secord / StippleGen darkness-weighted seed distribution
        const jfa = this.computeJfa(quadVao, sceneRt, null, pitch, 1, 0, time);
        const prog = this.getProg('stipple', FULLSCREEN_VERT, STIPPLE_FRAG, [
          'uSceneTex',
          'uJfaTex',
          'uSubstrateTex',
          'uTexelSize',
          'uResolution',
          'uScale',
          'uDetail',
          'uTexture',
          'uColorMix',
          'uVariant',
        ]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(prog.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(prog.u.uSceneTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, jfa.texture);
        gl.uniform1i(prog.u.uJfaTex, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.substrateTex);
        gl.uniform1i(prog.u.uSubstrateTex, 2);
        gl.uniform2f(prog.u.uTexelSize, 1 / jfa.width, 1 / jfa.height);
        gl.uniform2f(prog.u.uResolution, outW, outH);
        gl.uniform1f(prog.u.uScale, mp.scale);
        gl.uniform1f(prog.u.uDetail, mp.detail);
        gl.uniform1f(prog.u.uTexture, mp.texture);
        gl.uniform1f(prog.u.uColorMix, mp.colorMix);
        gl.uniform1i(prog.u.uVariant, mp.variant);
        gl.bindVertexArray(quadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'pixelsort': {
        const sw = Math.min(480, Math.max(240, Math.round(sceneRt.width * 0.6)));
        const sh = Math.min(320, Math.max(160, Math.round(sceneRt.height * 0.6)));
        if (!this.sortRts) {
          this.sortRts = [
            createRenderTarget(gl, sw, sh, gl.NEAREST),
            createRenderTarget(gl, sw, sh, gl.NEAREST),
          ];
        } else {
          resizeRenderTarget(gl, this.sortRts[0], sw, sh);
          resizeRenderTarget(gl, this.sortRts[1], sw, sh);
        }

        const maskProg = this.getProg('psMask', FULLSCREEN_VERT, PIXELSORT_MASK_FRAG, [
          'uSceneTex',
          'uResolution',
          'uDetail',
          'uTexture',
          'uTime',
          'uVariant',
        ]);
        const stepProg = this.getProg('psStep', FULLSCREEN_VERT, PIXELSORT_STEP_FRAG, [
          'uSortTex',
          'uTexelSize',
          'uPassIndex',
          'uVariant',
        ]);
        const outProg = this.getProg('psOut', FULLSCREEN_VERT, PIXELSORT_OUT_FRAG, [
          'uSortTex',
          'uSceneTex',
          'uColorMix',
        ]);

        gl.bindVertexArray(quadVao);
        gl.useProgram(maskProg.program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.sortRts[0].fbo);
        gl.viewport(0, 0, sw, sh);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(maskProg.u.uSceneTex, 0);
        gl.uniform2f(maskProg.u.uResolution, sw, sh);
        gl.uniform1f(maskProg.u.uDetail, mp.detail);
        gl.uniform1f(maskProg.u.uTexture, mp.texture);
        gl.uniform1f(maskProg.u.uTime, time);
        gl.uniform1i(maskProg.u.uVariant, mp.variant);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // Run Masked Odd-Even Transposition ping-pong passes (16..56 passes = crisp Kim Asendorf cascades)
        const passes = Math.round(16 + mp.scale * 40);
        gl.useProgram(stepProg.program);
        gl.uniform2f(stepProg.u.uTexelSize, 1 / sw, 1 / sh);
        gl.uniform1i(stepProg.u.uVariant, mp.variant);
        let flip = 0;
        for (let i = 0; i < passes; i++) {
          const readRt = this.sortRts[flip];
          const writeRt = this.sortRts[1 - flip];
          gl.bindFramebuffer(gl.FRAMEBUFFER, writeRt.fbo);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, readRt.texture);
          gl.uniform1i(stepProg.u.uSortTex, 0);
          gl.uniform1i(stepProg.u.uPassIndex, i);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          flip = 1 - flip;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(outProg.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sortRts[flip].texture);
        gl.uniform1i(outProg.u.uSortTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(outProg.u.uSceneTex, 1);
        gl.uniform1f(outProg.u.uColorMix, mp.colorMix);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'slitscan': {
        const hw = 320;
        const hh = 200;
        if (!this.historyArray) {
          this.historyArray = createTexture2DArrayTarget(gl, hw, hh, SLITSCAN_LAYERS);
          this.historyFilled = false;
        }

        if (!this.copyProg) {
          this.copyProg = this.getProg(
            'blitCopy',
            FULLSCREEN_VERT,
            `#version 300 es
            precision highp float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTex;
            void main() { fragColor = texture(uTex, vUv); }`,
            ['uTex']
          );
        }

        gl.bindVertexArray(quadVao);
        gl.useProgram(this.copyProg.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(this.copyProg.u.uTex, 0);

        if (!this.historyFilled) {
          // Prefill all 64 layers with the first frame so slit-scan never shows black slices on entry
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.historyArray.fbo);
          gl.viewport(0, 0, hw, hh);
          for (let layer = 0; layer < SLITSCAN_LAYERS; layer++) {
            gl.framebufferTextureLayer(
              gl.FRAMEBUFFER,
              gl.COLOR_ATTACHMENT0,
              this.historyArray.texture,
              0,
              layer
            );
            gl.drawArrays(gl.TRIANGLES, 0, 3);
          }
          this.historyHead = 0;
          this.historyFilled = true;
        } else if (!paused) {
          this.historyHead = (this.historyHead + 1) % SLITSCAN_LAYERS;
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.historyArray.fbo);
          gl.viewport(0, 0, hw, hh);
          gl.framebufferTextureLayer(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            this.historyArray.texture,
            0,
            this.historyHead
          );
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        const prog = this.getProg('slitscan', FULLSCREEN_VERT, SLITSCAN_FRAG, [
          'uHistoryArray',
          'uSceneTex',
          'uHeadLayer',
          'uNumLayers',
          'uScale',
          'uDetail',
          'uTexture',
          'uColorMix',
          'uVariant',
        ]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(prog.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.historyArray.texture);
        gl.uniform1i(prog.u.uHistoryArray, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(prog.u.uSceneTex, 1);
        gl.uniform1i(prog.u.uHeadLayer, this.historyHead);
        gl.uniform1i(prog.u.uNumLayers, SLITSCAN_LAYERS);
        gl.uniform1f(prog.u.uScale, mp.scale);
        gl.uniform1f(prog.u.uDetail, mp.detail);
        gl.uniform1f(prog.u.uTexture, mp.texture);
        gl.uniform1f(prog.u.uColorMix, mp.colorMix);
        gl.uniform1i(prog.u.uVariant, mp.variant);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'pixelart': {
        const prog = this.getProg('pixelart', FULLSCREEN_VERT, PIXELART_FRAG, [
          'uSceneTex',
          'uResolution',
          'uCamera',
          'uScale',
          'uDetail',
          'uTexture',
          'uColorMix',
          'uVariant',
        ]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(prog.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(prog.u.uSceneTex, 0);
        gl.uniform2f(prog.u.uResolution, outW, outH);
        gl.uniform2f(prog.u.uCamera, cameraYaw, cameraPitch);
        gl.uniform1f(prog.u.uScale, mp.scale);
        gl.uniform1f(prog.u.uDetail, mp.detail);
        gl.uniform1f(prog.u.uTexture, mp.texture);
        gl.uniform1f(prog.u.uColorMix, mp.colorMix);
        gl.uniform1i(prog.u.uVariant, mp.variant);
        gl.bindVertexArray(quadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }

      case 'iridescence': {
        const prog = this.getProg('iridescence', FULLSCREEN_VERT, IRIDESCENCE_FRAG, [
          'uSceneTex',
          'uAiryLutTex',
          'uSubstrateTex',
          'uTexelSize',
          'uTime',
          'uScale',
          'uDetail',
          'uTexture',
          'uColorMix',
          'uVariant',
        ]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, outputRt.fbo);
        gl.viewport(0, 0, outW, outH);
        gl.useProgram(prog.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneRt.texture);
        gl.uniform1i(prog.u.uSceneTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.airyLutTex);
        gl.uniform1i(prog.u.uAiryLutTex, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.substrateTex);
        gl.uniform1i(prog.u.uSubstrateTex, 2);
        gl.uniform2f(prog.u.uTexelSize, sTx, sTy);
        gl.uniform1f(prog.u.uTime, time);
        gl.uniform1f(prog.u.uScale, mp.scale);
        gl.uniform1f(prog.u.uDetail, mp.detail);
        gl.uniform1f(prog.u.uTexture, mp.texture);
        gl.uniform1f(prog.u.uColorMix, mp.colorMix);
        gl.uniform1i(prog.u.uVariant, mp.variant);
        gl.bindVertexArray(quadVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        break;
      }
    }
  }

  public dispose(): void {
    const gl = this.gl;
    for (const handle of this.programs.values()) gl.deleteProgram(handle.program);
    this.programs.clear();

    if (this.dither3DTex) gl.deleteTexture(this.dither3DTex);
    if (this.ditherRampTex) gl.deleteTexture(this.ditherRampTex);
    if (this.airyLutTex) gl.deleteTexture(this.airyLutTex);
    if (this.tamArrayTex) gl.deleteTexture(this.tamArrayTex);
    if (this.substrateTex) gl.deleteTexture(this.substrateTex);

    if (this.etfRts) {
      destroyRenderTarget(gl, this.etfRts[0]);
      destroyRenderTarget(gl, this.etfRts[1]);
    }
    if (this.fdogRt) destroyRenderTarget(gl, this.fdogRt);
    if (this.jfaRts) {
      destroyRenderTarget(gl, this.jfaRts[0]);
      destroyRenderTarget(gl, this.jfaRts[1]);
    }
    if (this.wernessRts) {
      destroyRenderTarget(gl, this.wernessRts[0]);
      destroyRenderTarget(gl, this.wernessRts[1]);
    }
    if (this.wernessPrevRt) destroyRenderTarget(gl, this.wernessPrevRt);
    if (this.ntscRt) destroyRenderTarget(gl, this.ntscRt);
    if (this.sortRts) {
      destroyRenderTarget(gl, this.sortRts[0]);
      destroyRenderTarget(gl, this.sortRts[1]);
    }
    if (this.prefixRts) {
      destroyRenderTarget(gl, this.prefixRts[0]);
      destroyRenderTarget(gl, this.prefixRts[1]);
    }
    if (this.historyArray) {
      gl.deleteFramebuffer(this.historyArray.fbo);
      gl.deleteTexture(this.historyArray.texture);
    }
    if (this.oscSampleRt) destroyRenderTarget(gl, this.oscSampleRt);
    if (this.oscVao) gl.deleteVertexArray(this.oscVao);
    if (this.oscQuadVbo) gl.deleteBuffer(this.oscQuadVbo);
    if (this.oscInstVbo) gl.deleteBuffer(this.oscInstVbo);
    if (this.ruttFbo) gl.deleteFramebuffer(this.ruttFbo);
    if (this.ruttDepthRb) gl.deleteRenderbuffer(this.ruttDepthRb);
    if (this.ruttTex) gl.deleteTexture(this.ruttTex);
    if (this.ruttLineVao) gl.deleteVertexArray(this.ruttLineVao);
    if (this.ruttLineVbo) gl.deleteBuffer(this.ruttLineVbo);
    if (this.ruttSkirtVao) gl.deleteVertexArray(this.ruttSkirtVao);
    if (this.ruttSkirtVbo) gl.deleteBuffer(this.ruttSkirtVbo);
  }
}
