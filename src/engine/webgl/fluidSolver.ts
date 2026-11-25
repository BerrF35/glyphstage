import { FULLSCREEN_VERT } from '@/engine/shaders/common.glsl';
import {
  createProgram,
  createRenderTarget,
  destroyRenderTarget,
  type RenderTarget,
} from './context';

/**
 * True Incompressible 2D Navier-Stokes Fluid Solver
 * Faithfully modeled after Pavel Dobryakov (PavelDoGreat/WebGL-Fluid-Simulation)
 * & Mark Harris (GPU Gems Ch. 38):
 *   curl -> vorticity confinement -> divergence (wall reflection) ->
 *   16x Jacobi pressure relaxation -> gradient subtraction -> semi-Lagrangian advection.
 */

const SPLAT_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTarget;
uniform float uAspect;
uniform vec2 uPoint;
uniform vec3 uColor;
uniform float uRadius;

void main() {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  vec3 splat = exp(-dot(p, p) / max(1e-5, uRadius)) * uColor;
  vec3 base = texture(uTarget, vUv).xyz;
  fragColor = vec4(base + splat, 1.0);
}
`;

const CURL_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uVelocity;
uniform vec2 uTexelSize;

void main() {
  float L = texture(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).y;
  float R = texture(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).y;
  float T = texture(uVelocity, vUv + vec2(0.0, uTexelSize.y)).x;
  float B = texture(uVelocity, vUv - vec2(0.0, uTexelSize.y)).x;
  float vorticity = R - L - T + B;
  fragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}
`;

const VORTICITY_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexelSize;
uniform float uCurlStrength;
uniform float uDt;

void main() {
  float L = texture(uCurl, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture(uCurl, vUv + vec2(uTexelSize.x, 0.0)).x;
  float T = texture(uCurl, vUv + vec2(0.0, uTexelSize.y)).x;
  float B = texture(uCurl, vUv - vec2(0.0, uTexelSize.y)).x;
  float C = texture(uCurl, vUv).x;

  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= uCurlStrength * C;
  force.y *= -1.0;

  vec2 vel = texture(uVelocity, vUv).xy;
  vel += force * uDt;
  vel = clamp(vel, vec2(-1000.0), vec2(1000.0));
  fragColor = vec4(vel, 0.0, 1.0);
}
`;

const DIVERGENCE_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uVelocity;
uniform vec2 uTexelSize;

void main() {
  vec2 vL = vUv - vec2(uTexelSize.x, 0.0);
  vec2 vR = vUv + vec2(uTexelSize.x, 0.0);
  vec2 vT = vUv + vec2(0.0, uTexelSize.y);
  vec2 vB = vUv - vec2(0.0, uTexelSize.y);

  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;

  // Solid-wall boundary reflection (PavelDoGreat/WebGL-Fluid-Simulation)
  if (vL.x < 0.0) L = -C.x;
  if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y;
  if (vB.y < 0.0) B = -C.y;

  float div = 0.5 * (R - L + T - B);
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

const CLEAR_PRESSURE_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform float uValue;

void main() {
  fragColor = uValue * texture(uTexture, vUv);
}
`;

const PRESSURE_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexelSize;

void main() {
  float L = texture(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
  float T = texture(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
  float B = texture(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
  float div = texture(uDivergence, vUv).x;
  float pressure = (L + R + B + T - div) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`;

const GRADIENT_SUBTRACT_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;

void main() {
  float L = texture(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
  float T = texture(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
  float B = texture(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
  vec2 vel = texture(uVelocity, vUv).xy;
  vel -= vec2(R - L, T - B);
  fragColor = vec4(vel, 0.0, 1.0);
}
`;

const ADVECTION_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uDissipation;

void main() {
  vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uTexelSize;
  vec4 result = texture(uSource, clamp(coord, vec2(0.001), vec2(0.999)));
  float decay = 1.0 + uDissipation * uDt;
  fragColor = result / decay;
}
`;

interface Prog {
  program: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

function makeProg(gl: WebGL2RenderingContext, frag: string, names: string[]): Prog {
  const program = createProgram(gl, FULLSCREEN_VERT, frag);
  const u: Record<string, WebGLUniformLocation | null> = {};
  for (const n of names) u[n] = gl.getUniformLocation(program, n);
  return { program, u };
}

export class NavierStokesFluidSolver {
  private gl: WebGL2RenderingContext;
  private simW = 192;
  private simH = 120;
  private dyeW = 512;
  private dyeH = 320;

  private velRts: [RenderTarget, RenderTarget];
  private dyeRts: [RenderTarget, RenderTarget];
  private pressRts: [RenderTarget, RenderTarget];
  private divRt: RenderTarget;
  private curlRt: RenderTarget;

  private velFlip = 0;
  private dyeFlip = 0;
  private pressFlip = 0;

  private splatProg: Prog;
  private curlProg: Prog;
  private vorticityProg: Prog;
  private divergenceProg: Prog;
  private clearProg: Prog;
  private pressureProg: Prog;
  private gradSubProg: Prog;
  private advectProg: Prog;

  private lastPointerX = 0.5;
  private lastPointerY = 0.5;
  private seeded = false;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    // Enable linear filtering on half-float targets if available
    gl.getExtension('OES_texture_half_float_linear');
    gl.getExtension('EXT_color_buffer_float');

    this.velRts = [
      createRenderTarget(gl, this.simW, this.simH, gl.LINEAR, gl.CLAMP_TO_EDGE, true),
      createRenderTarget(gl, this.simW, this.simH, gl.LINEAR, gl.CLAMP_TO_EDGE, true),
    ];
    this.dyeRts = [
      createRenderTarget(gl, this.dyeW, this.dyeH, gl.LINEAR, gl.CLAMP_TO_EDGE, true),
      createRenderTarget(gl, this.dyeW, this.dyeH, gl.LINEAR, gl.CLAMP_TO_EDGE, true),
    ];
    this.pressRts = [
      createRenderTarget(gl, this.simW, this.simH, gl.NEAREST, gl.CLAMP_TO_EDGE, true),
      createRenderTarget(gl, this.simW, this.simH, gl.NEAREST, gl.CLAMP_TO_EDGE, true),
    ];
    this.divRt = createRenderTarget(gl, this.simW, this.simH, gl.NEAREST, gl.CLAMP_TO_EDGE, true);
    this.curlRt = createRenderTarget(gl, this.simW, this.simH, gl.NEAREST, gl.CLAMP_TO_EDGE, true);

    this.splatProg = makeProg(gl, SPLAT_FRAG, ['uTarget', 'uAspect', 'uPoint', 'uColor', 'uRadius']);
    this.curlProg = makeProg(gl, CURL_FRAG, ['uVelocity', 'uTexelSize']);
    this.vorticityProg = makeProg(gl, VORTICITY_FRAG, [
      'uVelocity',
      'uCurl',
      'uTexelSize',
      'uCurlStrength',
      'uDt',
    ]);
    this.divergenceProg = makeProg(gl, DIVERGENCE_FRAG, ['uVelocity', 'uTexelSize']);
    this.clearProg = makeProg(gl, CLEAR_PRESSURE_FRAG, ['uTexture', 'uValue']);
    this.pressureProg = makeProg(gl, PRESSURE_FRAG, ['uPressure', 'uDivergence', 'uTexelSize']);
    this.gradSubProg = makeProg(gl, GRADIENT_SUBTRACT_FRAG, ['uPressure', 'uVelocity', 'uTexelSize']);
    this.advectProg = makeProg(gl, ADVECTION_FRAG, [
      'uVelocity',
      'uSource',
      'uTexelSize',
      'uDt',
      'uDissipation',
    ]);

    this.reset();
  }

  public reset(): void {
    const gl = this.gl;
    for (const rt of [
      ...this.velRts,
      ...this.dyeRts,
      ...this.pressRts,
      this.divRt,
      this.curlRt,
    ]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
      gl.viewport(0, 0, rt.width, rt.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.seeded = false;
  }

  private splat(
    quadVao: WebGLVertexArrayObject,
    x: number,
    y: number,
    dx: number,
    dy: number,
    r: number,
    g: number,
    b: number,
    radius: number
  ): void {
    const gl = this.gl;
    const aspect = this.simW / this.simH;
    gl.useProgram(this.splatProg.program);
    gl.bindVertexArray(quadVao);

    // 1. Velocity impulse
    const vRead = this.velRts[this.velFlip];
    const vWrite = this.velRts[1 - this.velFlip];
    gl.bindFramebuffer(gl.FRAMEBUFFER, vWrite.fbo);
    gl.viewport(0, 0, vWrite.width, vWrite.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, vRead.texture);
    gl.uniform1i(this.splatProg.u.uTarget, 0);
    gl.uniform1f(this.splatProg.u.uAspect, aspect);
    gl.uniform2f(this.splatProg.u.uPoint, x, y);
    gl.uniform3f(this.splatProg.u.uColor, dx, dy, 0);
    gl.uniform1f(this.splatProg.u.uRadius, radius);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.velFlip = 1 - this.velFlip;

    // 2. Color dye splat
    const dRead = this.dyeRts[this.dyeFlip];
    const dWrite = this.dyeRts[1 - this.dyeFlip];
    gl.bindFramebuffer(gl.FRAMEBUFFER, dWrite.fbo);
    gl.viewport(0, 0, dWrite.width, dWrite.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dRead.texture);
    gl.uniform3f(this.splatProg.u.uColor, r, g, b);
    gl.uniform1f(this.splatProg.u.uRadius, radius * 1.15);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.dyeFlip = 1 - this.dyeFlip;
  }

  public step(
    quadVao: WebGLVertexArrayObject,
    dt: number,
    time: number,
    pointerX: number,
    pointerY: number,
    pointerActive: number,
    pointerDown: number,
    audioBass: number
  ): void {
    const gl = this.gl;
    const stepDt = Math.min(0.018, Math.max(0.008, dt || 0.016));

    // Seed initial counter-rotating dye bursts on frame 0 so the canvas opens rich & swirling
    if (!this.seeded) {
      this.seeded = true;
      const bursts = [
        { x: 0.28, y: 0.52, dx: 260, dy: 95, c: [0.08, 0.78, 0.96] },
        { x: 0.72, y: 0.48, dx: -260, dy: -95, c: [0.98, 0.42, 0.14] },
        { x: 0.5, y: 0.25, dx: 80, dy: 240, c: [0.85, 0.18, 0.62] },
        { x: 0.5, y: 0.75, dx: -80, dy: -240, c: [0.96, 0.82, 0.18] },
      ];
      for (const b of bursts) {
        this.splat(quadVao, b.x, b.y, b.dx, b.dy, b.c[0], b.c[1], b.c[2], 0.0045);
      }
      for (let i = 0; i < 6; i++) {
        this.solveOnce(quadVao, 0.016);
      }
    }

    // Continuous smooth orbital emitters (creates rich self-sustaining vortices even hands-off)
    const boost = 1.0 + audioBass * 1.6;
    const e1x = 0.26 + Math.sin(time * 0.52) * 0.14;
    const e1y = 0.5 + Math.cos(time * 0.71) * 0.26;
    const e2x = 0.74 - Math.sin(time * 0.47) * 0.14;
    const e2y = 0.5 - Math.cos(time * 0.63) * 0.26;
    const e3x = 0.5 + Math.cos(time * 0.58) * 0.28;
    const e3y = 0.24 + Math.sin(time * 0.82) * 0.09;

    this.splat(
      quadVao,
      e1x,
      e1y,
      Math.cos(time * 0.71) * 165 * boost,
      Math.sin(time * 0.52) * 145 * boost,
      0.03 * boost,
      0.24 * boost,
      0.34 * boost,
      0.0022
    );
    this.splat(
      quadVao,
      e2x,
      e2y,
      -Math.cos(time * 0.63) * 165 * boost,
      -Math.sin(time * 0.47) * 145 * boost,
      0.34 * boost,
      0.14 * boost,
      0.04 * boost,
      0.0022
    );
    this.splat(
      quadVao,
      e3x,
      e3y,
      Math.sin(time * 0.95) * 120 * boost,
      155 * boost,
      0.26 * boost,
      0.06 * boost,
      0.22 * boost,
      0.0018
    );

    // Interactive pointer vortex splat
    if (pointerActive > 0.5) {
      const dx = (pointerX - this.lastPointerX) * 2600;
      const dy = (pointerY - this.lastPointerY) * 2600;
      const mag = Math.hypot(dx, dy);
      if (mag > 4 || pointerDown > 0.5) {
        const gain = pointerDown > 0.5 ? 1.8 : 0.85;
        const hue = (time * 0.35) % 1.0;
        const cr = 0.45 + 0.45 * Math.cos(6.28318 * (hue + 0.0));
        const cg = 0.45 + 0.45 * Math.cos(6.28318 * (hue + 0.33));
        const cb = 0.45 + 0.45 * Math.cos(6.28318 * (hue + 0.67));
        this.splat(
          quadVao,
          pointerX,
          pointerY,
          dx * gain + (pointerDown > 0.5 ? Math.cos(time * 6) * 110 : 0),
          dy * gain + (pointerDown > 0.5 ? Math.sin(time * 6) * 110 : 0),
          cr * 0.48 * gain,
          cg * 0.48 * gain,
          cb * 0.48 * gain,
          pointerDown > 0.5 ? 0.0042 : 0.0022
        );
      }
      this.lastPointerX = pointerX;
      this.lastPointerY = pointerY;
    }

    this.solveOnce(quadVao, stepDt);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private solveOnce(quadVao: WebGLVertexArrayObject, dt: number): void {
    const gl = this.gl;
    const tx = 1.0 / this.simW;
    const ty = 1.0 / this.simH;
    gl.bindVertexArray(quadVao);

    // 1. Curl
    gl.useProgram(this.curlProg.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.curlRt.fbo);
    gl.viewport(0, 0, this.simW, this.simH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velRts[this.velFlip].texture);
    gl.uniform1i(this.curlProg.u.uVelocity, 0);
    gl.uniform2f(this.curlProg.u.uTexelSize, tx, ty);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. Vorticity confinement (reinjects silk-like counter-rotating swirls!)
    gl.useProgram(this.vorticityProg.program);
    const vWrite = this.velRts[1 - this.velFlip];
    gl.bindFramebuffer(gl.FRAMEBUFFER, vWrite.fbo);
    gl.viewport(0, 0, this.simW, this.simH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velRts[this.velFlip].texture);
    gl.uniform1i(this.vorticityProg.u.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curlRt.texture);
    gl.uniform1i(this.vorticityProg.u.uCurl, 1);
    gl.uniform2f(this.vorticityProg.u.uTexelSize, tx, ty);
    gl.uniform1f(this.vorticityProg.u.uCurlStrength, 32.0);
    gl.uniform1f(this.vorticityProg.u.uDt, dt);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.velFlip = 1 - this.velFlip;

    // 3. Divergence with wall reflection
    gl.useProgram(this.divergenceProg.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.divRt.fbo);
    gl.viewport(0, 0, this.simW, this.simH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velRts[this.velFlip].texture);
    gl.uniform1i(this.divergenceProg.u.uVelocity, 0);
    gl.uniform2f(this.divergenceProg.u.uTexelSize, tx, ty);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 4. Damp pressure warm-start & run 16 Jacobi iterations
    gl.useProgram(this.clearProg.program);
    const pClearWrite = this.pressRts[1 - this.pressFlip];
    gl.bindFramebuffer(gl.FRAMEBUFFER, pClearWrite.fbo);
    gl.viewport(0, 0, this.simW, this.simH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pressRts[this.pressFlip].texture);
    gl.uniform1i(this.clearProg.u.uTexture, 0);
    gl.uniform1f(this.clearProg.u.uValue, 0.8);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.pressFlip = 1 - this.pressFlip;

    gl.useProgram(this.pressureProg.program);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.divRt.texture);
    gl.uniform1i(this.pressureProg.u.uDivergence, 1);
    gl.uniform2f(this.pressureProg.u.uTexelSize, tx, ty);
    for (let i = 0; i < 16; i++) {
      const pRead = this.pressRts[this.pressFlip];
      const pWrite = this.pressRts[1 - this.pressFlip];
      gl.bindFramebuffer(gl.FRAMEBUFFER, pWrite.fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pRead.texture);
      gl.uniform1i(this.pressureProg.u.uPressure, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.pressFlip = 1 - this.pressFlip;
    }

    // 5. Gradient subtraction (enforces div(u) = 0 incompressibility)
    gl.useProgram(this.gradSubProg.program);
    const vProjWrite = this.velRts[1 - this.velFlip];
    gl.bindFramebuffer(gl.FRAMEBUFFER, vProjWrite.fbo);
    gl.viewport(0, 0, this.simW, this.simH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pressRts[this.pressFlip].texture);
    gl.uniform1i(this.gradSubProg.u.uPressure, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.velRts[this.velFlip].texture);
    gl.uniform1i(this.gradSubProg.u.uVelocity, 1);
    gl.uniform2f(this.gradSubProg.u.uTexelSize, tx, ty);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.velFlip = 1 - this.velFlip;

    // 6. Semi-Lagrangian Velocity Advection
    gl.useProgram(this.advectProg.program);
    const vAdvWrite = this.velRts[1 - this.velFlip];
    gl.bindFramebuffer(gl.FRAMEBUFFER, vAdvWrite.fbo);
    gl.viewport(0, 0, this.simW, this.simH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velRts[this.velFlip].texture);
    gl.uniform1i(this.advectProg.u.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.velRts[this.velFlip].texture);
    gl.uniform1i(this.advectProg.u.uSource, 1);
    gl.uniform2f(this.advectProg.u.uTexelSize, tx, ty);
    gl.uniform1f(this.advectProg.u.uDt, dt);
    gl.uniform1f(this.advectProg.u.uDissipation, 0.25);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.velFlip = 1 - this.velFlip;

    // 7. Semi-Lagrangian High-Res Dye Advection
    const dAdvWrite = this.dyeRts[1 - this.dyeFlip];
    gl.bindFramebuffer(gl.FRAMEBUFFER, dAdvWrite.fbo);
    gl.viewport(0, 0, this.dyeW, this.dyeH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velRts[this.velFlip].texture);
    gl.uniform1i(this.advectProg.u.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.dyeRts[this.dyeFlip].texture);
    gl.uniform1i(this.advectProg.u.uSource, 1);
    gl.uniform2f(this.advectProg.u.uTexelSize, tx, ty);
    gl.uniform1f(this.advectProg.u.uDt, dt);
    gl.uniform1f(this.advectProg.u.uDissipation, 0.65);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.dyeFlip = 1 - this.dyeFlip;
  }

  public getDyeTexture(): WebGLTexture {
    return this.dyeRts[this.dyeFlip].texture;
  }

  public dispose(): void {
    const gl = this.gl;
    for (const rt of [
      ...this.velRts,
      ...this.dyeRts,
      ...this.pressRts,
      this.divRt,
      this.curlRt,
    ]) {
      destroyRenderTarget(gl, rt);
    }
    for (const p of [
      this.splatProg,
      this.curlProg,
      this.vorticityProg,
      this.divergenceProg,
      this.clearProg,
      this.pressureProg,
      this.gradSubProg,
      this.advectProg,
    ]) {
      gl.deleteProgram(p.program);
    }
  }
}
