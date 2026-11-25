export const PARTICLES_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPos;
layout(location = 1) in float aSize;
layout(location = 2) in float aLife;
layout(location = 3) in float aGlyph;
layout(location = 4) in vec3 aColor;

out float vLife;
out float vGlyph;
out vec3 vColor;

void main() {
  vLife = aLife;
  vGlyph = aGlyph;
  vColor = aColor;
  gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = aSize;
}
`;

export const PARTICLES_FRAG = `#version 300 es
precision highp float;

in float vLife;
in float vGlyph;
in vec3 vColor;
out vec4 fragColor;

uniform sampler2D uMainAtlas;

void main() {
  int idx = int(clamp(vGlyph, 1.0, 15.0));
  vec2 uv = mix(vec2(0.06), vec2(0.94), gl_PointCoord);
  vec2 atlasUv = (vec2(float(idx), 2.0) + uv) / vec2(16.0, 8.0);
  float a = texture(uMainAtlas, atlasUv).r * smoothstep(0.0, 0.25, vLife);
  if (a < 0.05) discard;
  fragColor = vec4(vColor * 1.35, a);
}
`;

export const TRAIL_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uCurrentTex;
uniform sampler2D uPrevTex;
uniform float uDecay;
uniform vec3 uBgColor;
uniform int uLightMode;

void main() {
  vec4 cur = texture(uCurrentTex, vUv);
  vec4 prev = texture(uPrevTex, vUv);

  if (uLightMode == 1 || uDecay <= 0.01) {
    fragColor = cur;
    return;
  }

  vec3 decayed = mix(uBgColor, prev.rgb, uDecay);
  vec3 rgb = max(cur.rgb, decayed);
  float bloom = max(cur.a, prev.a * uDecay * 0.82);
  fragColor = vec4(rgb, bloom);
}
`;

// Acerola-inspired Karis-weighted Kawase box downsample (suppresses single-glyph bloom fireflies)
export const BLOOM_DOWN_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform vec2 uTexelSize;
uniform int uPrefilter;

float maxComp(vec3 c) {
  return max(c.r, max(c.g, c.b));
}

void main() {
  vec4 o = uTexelSize.xyxy * vec4(-1.0, -1.0, 1.0, 1.0);
  vec4 s1 = texture(uTex, vUv + o.xy);
  vec4 s2 = texture(uTex, vUv + o.zy);
  vec4 s3 = texture(uTex, vUv + o.xw);
  vec4 s4 = texture(uTex, vUv + o.zw);

  vec3 c1 = uPrefilter == 1 ? s1.rgb * s1.a : s1.rgb;
  vec3 c2 = uPrefilter == 1 ? s2.rgb * s2.a : s2.rgb;
  vec3 c3 = uPrefilter == 1 ? s3.rgb * s3.a : s3.rgb;
  vec3 c4 = uPrefilter == 1 ? s4.rgb * s4.a : s4.rgb;

  float w1 = 1.0 / (1.0 + maxComp(c1));
  float w2 = 1.0 / (1.0 + maxComp(c2));
  float w3 = 1.0 / (1.0 + maxComp(c3));
  float w4 = 1.0 / (1.0 + maxComp(c4));

  vec3 avg = (c1 * w1 + c2 * w2 + c3 * w3 + c4 * w4) / max(0.0001, w1 + w2 + w3 + w4);
  fragColor = vec4(avg, 1.0);
}
`;

// 9-tap tent filter upsample for silky multi-scale CRT phosphor halation
export const BLOOM_UP_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform vec2 uTexelSize;

void main() {
  vec2 d = uTexelSize * 1.15;
  vec3 sum = texture(uTex, vUv).rgb * 4.0;
  sum += texture(uTex, vUv + vec2(-d.x, 0.0)).rgb * 2.0;
  sum += texture(uTex, vUv + vec2(d.x, 0.0)).rgb * 2.0;
  sum += texture(uTex, vUv + vec2(0.0, -d.y)).rgb * 2.0;
  sum += texture(uTex, vUv + vec2(0.0, d.y)).rgb * 2.0;
  sum += texture(uTex, vUv + vec2(-d.x, -d.y)).rgb;
  sum += texture(uTex, vUv + vec2(d.x, -d.y)).rgb;
  sum += texture(uTex, vUv + vec2(-d.x, d.y)).rgb;
  sum += texture(uTex, vUv + vec2(d.x, d.y)).rgb;
  fragColor = vec4(sum / 16.0, 1.0);
}
`;

export const COMPOSITE_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uBaseTex;
uniform sampler2D uBloomTex;
uniform vec2 uResolution;
uniform float uBloom;
uniform float uCrt;
uniform int uLightMode;
uniform vec3 uBgColor;

void main() {
  vec2 uv = vUv;

  if (uCrt > 0.02) {
    vec2 d = uv - 0.5;
    float r2 = dot(d, d);
    uv = 0.5 + d * (1.0 + r2 * 0.16 * uCrt);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      fragColor = vec4(uBgColor * 0.4, 1.0);
      return;
    }
  }

  vec3 col;
  if (uCrt > 0.08 && uLightMode == 0) {
    vec2 shift = (uv - 0.5) * 0.0028 * uCrt;
    col.r = texture(uBaseTex, uv + shift).r;
    col.g = texture(uBaseTex, uv).g;
    col.b = texture(uBaseTex, uv - shift).b;
  } else {
    col = texture(uBaseTex, uv).rgb;
  }

  if (uLightMode == 0 && uBloom > 0.01) {
    vec3 bloom = texture(uBloomTex, uv).rgb;
    col += bloom * uBloom * 0.85;
  }

  if (uCrt > 0.02) {
    float scan = 1.0 - (0.14 * uCrt) * (0.5 - 0.5 * cos(uv.y * uResolution.y * 3.14159));
    float vig = 1.0 - dot(uv - 0.5, uv - 0.5) * (0.55 * uCrt);
    col *= scan * vig;
  }

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
