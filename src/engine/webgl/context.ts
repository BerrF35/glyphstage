export interface RenderTarget {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
  internalFormat: number;
  type: number;
}

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create WebGL shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || 'Unknown shader compile error';
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vertSource: string,
  fragSource: string
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create WebGL program');

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || 'Unknown program link error';
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

export function createRenderTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  filter: number = gl.LINEAR,
  wrap: number = gl.CLAMP_TO_EDGE,
  useHalfFloat = false
): RenderTarget {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));

  let internalFormat: number = gl.RGBA8;
  let type: number = gl.UNSIGNED_BYTE;
  if (useHalfFloat && gl.getExtension('EXT_color_buffer_float')) {
    internalFormat = gl.RGBA16F;
    type = gl.HALF_FLOAT;
  }

  const texture = gl.createTexture();
  if (!texture) throw new Error('Failed to allocate texture');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, gl.RGBA, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);

  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error('Failed to allocate framebuffer');
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { fbo, texture, width: w, height: h, internalFormat, type };
}

export function resizeRenderTarget(
  gl: WebGL2RenderingContext,
  rt: RenderTarget,
  width: number,
  height: number
): void {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  if (rt.width === w && rt.height === h) return;
  rt.width = w;
  rt.height = h;
  gl.bindTexture(gl.TEXTURE_2D, rt.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, rt.internalFormat, w, h, 0, gl.RGBA, rt.type, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

export function destroyRenderTarget(gl: WebGL2RenderingContext, rt: RenderTarget): void {
  gl.deleteFramebuffer(rt.fbo);
  gl.deleteTexture(rt.texture);
}

export function uploadCanvasTexture(
  gl: WebGL2RenderingContext,
  target: WebGLTexture | null,
  source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement,
  filter: number = gl.LINEAR,
  generateMips = false
): WebGLTexture {
  const tex = target ?? gl.createTexture();
  if (!tex) throw new Error('Failed to allocate image texture');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  if (generateMips) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

export function uploadRgbaDataTexture(
  gl: WebGL2RenderingContext,
  target: WebGLTexture | null,
  width: number,
  height: number,
  data: Uint8Array,
  filter: number = gl.NEAREST,
  wrap: number = gl.CLAMP_TO_EDGE
): WebGLTexture {
  const tex = target ?? gl.createTexture();
  if (!tex) throw new Error('Failed to allocate LUT texture');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

export function uploadTexture3D(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  depth: number,
  data: Uint8Array,
  wrapXY: number = gl.REPEAT,
  wrapZ: number = gl.CLAMP_TO_EDGE
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('Failed to allocate 3D texture');
  gl.bindTexture(gl.TEXTURE_3D, tex);
  gl.texImage3D(
    gl.TEXTURE_3D,
    0,
    gl.RGBA8,
    width,
    height,
    depth,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    data
  );
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, wrapXY);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, wrapXY);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, wrapZ);
  gl.bindTexture(gl.TEXTURE_3D, null);
  return tex;
}

export interface TextureArrayTarget {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  layers: number;
}

export function createTexture2DArrayTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  layers: number
): TextureArrayTarget {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const texture = gl.createTexture();
  if (!texture) throw new Error('Failed to allocate 2D texture array');
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, w, h, layers);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);

  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error('Failed to allocate 2D array FBO');
  return { texture, fbo, width: w, height: h, layers };
}

export function uploadMipmappedTexture2DArray(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  layers: number,
  mipLevels: Uint8Array[][]
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('Failed to allocate TAM texture array');
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, mipLevels.length, gl.RGBA8, width, height, layers);

  for (let mip = 0; mip < mipLevels.length; mip++) {
    const mw = Math.max(1, width >> mip);
    const mh = Math.max(1, height >> mip);
    for (let layer = 0; layer < layers; layer++) {
      gl.texSubImage3D(
        gl.TEXTURE_2D_ARRAY,
        mip,
        0,
        0,
        layer,
        mw,
        mh,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        mipLevels[mip][layer]
      );
    }
  }

  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  return tex;
}
