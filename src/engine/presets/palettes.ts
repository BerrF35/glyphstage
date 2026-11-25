import type { PaletteId, PaletteSpec } from '@/types/studio';

export const PALETTES: PaletteSpec[] = [
  {
    id: 'effulgence',
    name: 'Effulgence',
    bg: '#050608',
    low: '#13313d',
    mid: '#38d9c0',
    high: '#eefcf9',
    accent: '#ff922b',
    lightMode: false,
    useSourceColor: false,
  },
  {
    id: 'native',
    name: 'True Color',
    bg: '#07080a',
    low: '#262930',
    mid: '#9ca3af',
    high: '#f8fafc',
    accent: '#f59e0b',
    lightMode: false,
    useSourceColor: true,
  },
  {
    id: 'oxide',
    name: 'Oxide',
    bg: '#08090b',
    low: '#1e2528',
    mid: '#6b7d85',
    high: '#e5edf0',
    accent: '#10b981',
    lightMode: false,
    useSourceColor: false,
  },
  {
    id: 'amber',
    name: 'P3 Amber',
    bg: '#090705',
    low: '#3f2108',
    mid: '#d97706',
    high: '#fef3c7',
    accent: '#fbbf24',
    lightMode: false,
    useSourceColor: false,
  },
  {
    id: 'phosphor',
    name: 'P39 Green',
    bg: '#040a06',
    low: '#0c3b20',
    mid: '#22c55e',
    high: '#dcfce7',
    accent: '#4ade80',
    lightMode: false,
    useSourceColor: false,
  },
  {
    id: 'paper',
    name: 'Swiss Paper',
    bg: '#f2efe9',
    low: '#b8b2a6',
    mid: '#4a4742',
    high: '#121210',
    accent: '#d9381e',
    lightMode: true,
    useSourceColor: false,
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    bg: '#08182f',
    low: '#183b6b',
    mid: '#5fa4e8',
    high: '#f0f7ff',
    accent: '#7dd3fc',
    lightMode: false,
    useSourceColor: false,
  },
  {
    id: 'thermal',
    name: 'Thermal',
    bg: '#060609',
    low: '#1e3a8a',
    mid: '#dc2626',
    high: '#fef08a',
    accent: '#ffffff',
    lightMode: false,
    useSourceColor: false,
  },
  {
    id: 'crimson',
    name: 'Crimson',
    bg: '#090505',
    low: '#450a0a',
    mid: '#dc2626',
    high: '#fde68a',
    accent: '#fb923c',
    lightMode: false,
    useSourceColor: false,
  },
  {
    id: 'glacier',
    name: 'Glacier',
    bg: '#04080e',
    low: '#0e3454',
    mid: '#38bdf8',
    high: '#f0f9ff',
    accent: '#a5f3fc',
    lightMode: false,
    useSourceColor: false,
  },
];

export const PALETTE_MAP: Record<PaletteId, PaletteSpec> = Object.fromEntries(
  PALETTES.map((p) => [p.id, p])
) as Record<PaletteId, PaletteSpec>;

export function hexToVec3(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  if (Number.isNaN(num) || clean.length !== 6) return [1, 1, 1];
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}
