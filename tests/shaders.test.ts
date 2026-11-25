import { describe, expect, it } from 'vitest';
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

describe('GLSL 300 es shader sources', () => {
  const simEntries: Array<[string, string]> = Object.entries(STATEFUL_SIMS)
    .filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] => Boolean(entry[1]))
    .map(([id, pair]) => [`sim:${id}`, pair.sim]);

  const coreShaders: Array<[string, string]> = [
    ['FULLSCREEN_VERT', FULLSCREEN_VERT],
    ['EDGES_FRAG', EDGES_FRAG],
    ['ASCII_FRAG', ASCII_FRAG],
    ['PARTICLES_VERT', PARTICLES_VERT],
    ['PARTICLES_FRAG', PARTICLES_FRAG],
    ['TRAIL_FRAG', TRAIL_FRAG],
    ['BLOOM_DOWN_FRAG', BLOOM_DOWN_FRAG],
    ['BLOOM_UP_FRAG', BLOOM_UP_FRAG],
    ['COMPOSITE_FRAG', COMPOSITE_FRAG],
    ...Object.entries(WORLD_SHADERS).map(([id, src]): [string, string] => [`world:${id}`, src]),
    ...simEntries,
  ];

  it('declares WebGL2 #version 300 es, balanced braces, and no trailing comment escapes', () => {
    expect(Object.keys(WORLD_SHADERS)).toHaveLength(61);
    expect(simEntries).toHaveLength(6);

    for (const [name, src] of coreShaders) {
      expect(src.trimStart().startsWith('#version 300 es'), `${name} missing version`).toBe(true);
      expect(src, `${name} missing main()`).toContain('void main()');
      expect(src, `${name} contains stray backslash`).not.toContain('\\');
      const opens = (src.match(/\{/g) || []).length;
      const closes = (src.match(/\}/g) || []).length;
      expect(opens, `${name} unbalanced braces`).toBe(closes);
    }
  });
});
