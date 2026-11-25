import type { SceneId } from '@/types/studio';
import { ARCHITECTURE_SHADERS } from './worlds/architecture.glsl';
import { COSMOS_SHADERS } from './worlds/cosmos.glsl';
import { DEMOSCENE_SHADERS } from './worlds/demoscene.glsl';
import { DUNGEON_SHADERS } from './worlds/dungeon.glsl';
import { EMERGENT_SIMS, EMERGENT_VIEW_SHADERS, type StatefulSimPair } from './worlds/emergent.glsl';
import { FRACTAL_SHADERS } from './worlds/fractals.glsl';
import { HIGHERDIM_SHADERS } from './worlds/higherdim.glsl';
import { KINETIC_SHADERS } from './worlds/kinetic.glsl';
import { NATURE_SHADERS } from './worlds/nature.glsl';
import { TOPOLOGY_SHADERS } from './worlds/topology.glsl';

export const WORLD_SHADERS: Record<SceneId, string> = {
  ...ARCHITECTURE_SHADERS,
  ...FRACTAL_SHADERS,
  ...COSMOS_SHADERS,
  ...NATURE_SHADERS,
  ...TOPOLOGY_SHADERS,
  ...KINETIC_SHADERS,
  ...DEMOSCENE_SHADERS,
  ...DUNGEON_SHADERS,
  ...HIGHERDIM_SHADERS,
  ...EMERGENT_VIEW_SHADERS,
};

export const STATEFUL_SIMS: Partial<Record<SceneId, StatefulSimPair>> = EMERGENT_SIMS;
