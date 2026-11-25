import { describe, expect, it } from 'vitest';
import { SCENES } from '@/engine/presets/scenes';
import {
  formatCompactCount,
  sanitizeStatsSnapshot,
  sortWorlds,
  type WorldStatsMap,
} from '@/engine/stats/worldStats';

describe('world stats & sorting', () => {
  it('formats compact star and view counts cleanly', () => {
    expect(formatCompactCount(0)).toBe('0');
    expect(formatCompactCount(42)).toBe('42');
    expect(formatCompactCount(999)).toBe('999');
    expect(formatCompactCount(1000)).toBe('1k');
    expect(formatCompactCount(1450)).toBe('1.4k');
    expect(formatCompactCount(12500)).toBe('12k');
    expect(formatCompactCount(1_250_000)).toBe('1.3M');
    expect(formatCompactCount(-5)).toBe('0');
  });

  it('sanitizes arbitrary snapshot payloads safely', () => {
    const clean = sanitizeStatsSnapshot({
      citadel: { stars: 12.8, views: 340 },
      fluid: { stars: -4, views: '25' },
      bad: null,
    });
    expect(clean.citadel).toEqual({ stars: 12, views: 340 });
    expect(clean.fluid).toEqual({ stars: 0, views: 25 });
    expect(clean['bad' as keyof WorldStatsMap]).toBeUndefined();
  });

  it('sorts worlds by stars, views, and alphabetically with deterministic tie-breakers', () => {
    const subset = SCENES.slice(0, 4); // citadel, cathedral, megacity, torii
    const stats: WorldStatsMap = {
      citadel: { stars: 5, views: 100 },
      cathedral: { stars: 40, views: 10 },
      megacity: { stars: 5, views: 350 },
      torii: { stars: 18, views: 220 },
    };

    const byStars = sortWorlds(subset, stats, 'stars').map((s) => s.id);
    expect(byStars).toEqual(['cathedral', 'torii', 'megacity', 'citadel']);

    const byViews = sortWorlds(subset, stats, 'views').map((s) => s.id);
    expect(byViews).toEqual(['megacity', 'torii', 'citadel', 'cathedral']);

    const byAz = sortWorlds(subset, stats, 'az').map((s) => s.id);
    expect(byAz).toEqual(['megacity', 'citadel', 'cathedral', 'torii']);

    const curated = sortWorlds(subset, stats, 'curated').map((s) => s.id);
    expect(curated).toEqual(['citadel', 'cathedral', 'megacity', 'torii']);
  });
});
