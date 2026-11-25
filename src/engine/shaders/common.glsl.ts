export const FULLSCREEN_VERT = `#version 300 es
precision highp float;

out vec2 vUv;

void main() {
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const BAYER_GLSL = `
float bayer4(vec2 p) {
  ivec2 ip = ivec2(mod(floor(p), 4.0));
  int idx = ip.y * 4 + ip.x;
  const float m[16] = float[16](
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0
  );
  return (m[idx] + 0.5) / 16.0;
}

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
`;
