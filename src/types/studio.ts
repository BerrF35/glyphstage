export type WorldCategory =
  | 'architecture'
  | 'fractals'
  | 'cosmos'
  | 'nature'
  | 'topology'
  | 'kinetic'
  | 'demoscene'
  | 'dungeon'
  | 'higherdim'
  | 'emergent';

export type SceneId =
  | 'citadel'
  | 'cathedral'
  | 'megacity'
  | 'torii'
  | 'escher'
  | 'pantheon'
  | 'mandelbulb'
  | 'apollonian'
  | 'menger'
  | 'julia4d'
  | 'kaliland'
  | 'sierpinski'
  | 'singularity'
  | 'dyson'
  | 'saturn'
  | 'reactor'
  | 'nebula'
  | 'warp'
  | 'topography'
  | 'swell'
  | 'medusa'
  | 'caldera'
  | 'glacier'
  | 'fungi'
  | 'gyroid'
  | 'knot'
  | 'metaballs'
  | 'helix'
  | 'orrery'
  | 'poincare'
  | 'playcore'
  | 'chladni'
  | 'moire'
  | 'quasicrystal'
  | 'flame'
  | 'type3d'
  | 'donut'
  | 'synthwave'
  | 'hartverdrahtet'
  | 'truchet'
  | 'voxels'
  | 'matrix'
  | 'brogue'
  | 'ziggurat'
  | 'monolith'
  | 'crypt'
  | 'reef'
  | 'fortress'
  | 'tesseract'
  | 'aurora'
  | 'kleinian'
  | 'starnest'
  | 'turing'
  | 'hopf'
  | 'grayscott'
  | 'fluid'
  | 'life'
  | 'ripple'
  | 'slime'
  | 'doomsim'
  | 'media';

export type MediumFamily =
  | 'ascii'
  | 'painterly'
  | 'ink'
  | 'print'
  | 'analog'
  | 'tessellation'
  | 'glitch'
  | 'optics';

export type MediumId =
  | 'ascii'
  | 'kuwahara'
  | 'watercolor'
  | 'fdog'
  | 'lic'
  | 'tam'
  | 'squiggle'
  | 'contour'
  | 'dither3d'
  | 'werness'
  | 'halftone'
  | 'risograph'
  | 'crt'
  | 'ntsc'
  | 'oscilloscope'
  | 'ruttetra'
  | 'stainedglass'
  | 'mosaic'
  | 'stipple'
  | 'pixelsort'
  | 'slitscan'
  | 'pixelart'
  | 'iridescence';

export type StyleId =
  | 'edge'
  | 'effulgence'
  | 'shape6d'
  | 'braille'
  | 'ansi'
  | 'playcore'
  | 'phosphor'
  | 'blocks'
  | 'hatch'
  | 'cascade';

export type PaletteId =
  | 'effulgence'
  | 'native'
  | 'oxide'
  | 'amber'
  | 'phosphor'
  | 'paper'
  | 'blueprint'
  | 'thermal'
  | 'crimson'
  | 'glacier';

export type FontId = 'plex' | 'jetbrains' | 'space' | 'cp437' | 'petscii';

export type AudioMode = 'off' | 'synth' | 'mic';

export type MediaKind = 'study' | 'image' | 'video' | 'webcam';

export type StudyId = 'dome' | 'monolith' | 'interference';

export interface CameraState {
  yaw: number;
  pitch: number;
  zoom: number;
  autoOrbit: boolean;
  orbitSpeed: number;
}

export interface LightState {
  azimuth: number;
  elevation: number;
  intensity: number;
  rimIntensity: number;
  exposure: number;
  contrast: number;
}

export interface EffectState {
  cellSize: number;
  edgeMix: number;
  edgeThreshold: number;
  dither: number;
  bloom: number;
  trails: number;
  crt: number;
  shapeCrunch: number;
  invert: boolean;
  motionSpeed: number;
}

export interface MediumParams {
  scale: number;
  detail: number;
  texture: number;
  colorMix: number;
  variant: number;
}

export interface StudioState {
  scene: SceneId;
  medium: MediumId;
  mediumParams: MediumParams;
  style: StyleId;
  palette: PaletteId;
  font: FontId;
  customText: string;
  phrase: string;
  usePhrase: boolean;
  customRamp: string;
  useCustomRamp: boolean;
  mediaKind: MediaKind;
  studyId: StudyId;
  mediaParallax: number;
  mediaMirror: boolean;
  mediaThreshold: number;
  audioMode: AudioMode;
  audioGain: number;
  camera: CameraState;
  light: LightState;
  fx: EffectState;
}

export interface PaletteSpec {
  id: PaletteId;
  name: string;
  bg: string;
  low: string;
  mid: string;
  high: string;
  accent: string;
  lightMode: boolean;
  useSourceColor: boolean;
}

export interface StyleSpec {
  id: StyleId;
  name: string;
  shortName: string;
  sample: string;
  reference: string;
  defaults: Partial<EffectState>;
  suggestedPalette?: PaletteId;
}

export interface MediumControlLabels {
  scale: string;
  detail: string;
  texture: string;
  colorMix: string;
  variants?: string[];
}

export interface MediumSpec {
  id: MediumId;
  family: MediumFamily;
  name: string;
  shortName: string;
  reference: string;
  badge: string;
  defaults: MediumParams;
  controls: MediumControlLabels;
  fxOverrides?: Partial<EffectState>;
  suggestedPalette?: PaletteId;
  supportsPlotterSvg?: boolean;
}

export interface FontSpec {
  id: FontId;
  name: string;
  shortName: string;
  cssFamily: string;
  weight: number;
  pixelSnap?: boolean;
  uppercaseOnly?: boolean;
}

export interface SceneSpec {
  id: Exclude<SceneId, 'media'>;
  name: string;
  shortName: string;
  category: WorldCategory;
  reference: string;
  suggestedStyle: StyleId;
  suggestedPalette: PaletteId;
  defaultCamera: Partial<CameraState>;
  isStateful?: boolean;
  simSubsteps?: number;
}

export interface FrameMetrics {
  fps: number;
  cols: number;
  rows: number;
  particles: number;
  elapsed: number;
  audioEnergy?: number;
}
