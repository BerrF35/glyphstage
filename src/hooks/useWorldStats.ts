import { useCallback, useEffect, useState } from 'react';
import {
  recordWorldView,
  subscribeWorldStats,
  voteWorldStar,
  type WorldStatsMap,
} from '@/engine/stats/worldStats';
import type { SceneId } from '@/types/studio';

export function useWorldStats(activeScene: SceneId) {
  const [stats, setStats] = useState<WorldStatsMap>({});
  const [liveConnected, setLiveConnected] = useState(false);

  // Live WebSocket subscription to global world star & view counts
  useEffect(() => {
    return subscribeWorldStats(setStats, setLiveConnected);
  }, []);

  // Count a world view after dwelling 1.2s (avoids inflating counts while scrubbing via [ / ])
  useEffect(() => {
    if (activeScene === 'media') return;
    const sceneId = activeScene;
    const timer = window.setTimeout(() => {
      void recordWorldView(sceneId).then((recorded) => {
        if (!recorded) return;
        setStats((prev) => {
          const cur = prev[sceneId] ?? { stars: 0, views: 0 };
          return { ...prev, [sceneId]: { ...cur, views: cur.views + 1 } };
        });
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [activeScene]);

  const voteStar = useCallback((sceneId: SceneId, willBeStarred: boolean) => {
    if (sceneId === 'media') return;
    const delta: 1 | -1 = willBeStarred ? 1 : -1;

    // Optimistic UI update for instant feedback
    setStats((prev) => {
      const cur = prev[sceneId] ?? { stars: 0, views: 0 };
      return {
        ...prev,
        [sceneId]: {
          ...cur,
          stars: Math.max(0, cur.stars + delta),
        },
      };
    });

    void voteWorldStar(sceneId, delta);
  }, []);

  return { stats, liveConnected, voteStar };
}
