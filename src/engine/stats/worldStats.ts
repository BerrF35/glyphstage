import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getDatabase, increment, onValue, ref, update, type Database } from 'firebase/database';
import type { SceneId, SceneSpec } from '@/types/studio';

export type WorldSortMode = 'curated' | 'stars' | 'views' | 'az';

export interface WorldStatEntry {
  stars: number;
  views: number;
}

export type WorldStatsMap = Partial<Record<Exclude<SceneId, 'media'>, WorldStatEntry>>;

const DEFAULT_RTDB_URL =
  'https://glyphstage-default-rtdb.asia-southeast1.firebasedatabase.app';

const VIEWED_SESSION_KEY = 'glyphstage:viewed:v1';

let cachedDb: Database | null = null;
let initAttempted = false;

function getDatabaseUrl(): string {
  const fromEnv =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_DATABASE_URL
      ? String(import.meta.env.VITE_FIREBASE_DATABASE_URL).trim()
      : '';
  return fromEnv || DEFAULT_RTDB_URL;
}

function getDb(): Database | null {
  if (cachedDb) return cachedDb;
  if (initAttempted) return null;
  initAttempted = true;

  if (typeof window === 'undefined') return null;

  try {
    const databaseURL = getDatabaseUrl();
    if (!databaseURL) return null;
    const app: FirebaseApp =
      getApps().find((a) => a.name === 'glyphstage-stats') ??
      initializeApp({ databaseURL }, 'glyphstage-stats');
    cachedDb = getDatabase(app);
    return cachedDb;
  } catch {
    return null;
  }
}

export function sanitizeStatsSnapshot(raw: unknown): WorldStatsMap {
  if (!raw || typeof raw !== 'object') return {};
  const result: WorldStatsMap = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== 'object') continue;
    const obj = val as Record<string, unknown>;
    const stars = Math.max(0, Math.floor(Number(obj.stars) || 0));
    const views = Math.max(0, Math.floor(Number(obj.views) || 0));
    result[key as Exclude<SceneId, 'media'>] = { stars, views };
  }
  return result;
}

export function subscribeWorldStats(
  onUpdate: (stats: WorldStatsMap) => void,
  onStatus?: (connected: boolean) => void
): () => void {
  const db = getDb();
  if (!db) {
    onStatus?.(false);
    return () => {};
  }

  try {
    const worldsRef = ref(db, 'worlds');
    const unsubscribe = onValue(
      worldsRef,
      (snap) => {
        onStatus?.(true);
        onUpdate(sanitizeStatsSnapshot(snap.val()));
      },
      () => {
        onStatus?.(false);
      }
    );
    return unsubscribe;
  } catch {
    onStatus?.(false);
    return () => {};
  }
}

export async function voteWorldStar(
  sceneId: Exclude<SceneId, 'media'>,
  delta: 1 | -1
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    await update(ref(db, `worlds/${sceneId}`), {
      stars: increment(delta),
    });
    return true;
  } catch {
    return false;
  }
}

function loadSessionViewed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(VIEWED_SESSION_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((x) => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function saveSessionViewed(set: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(VIEWED_SESSION_KEY, JSON.stringify([...set]));
  } catch {
    // ignore private browsing quota errors
  }
}

export async function recordWorldView(sceneId: Exclude<SceneId, 'media'>): Promise<boolean> {
  const viewed = loadSessionViewed();
  if (viewed.has(sceneId)) return false;

  viewed.add(sceneId);
  saveSessionViewed(viewed);

  const db = getDb();
  if (!db) return false;
  try {
    await update(ref(db, `worlds/${sceneId}`), {
      views: increment(1),
    });
    return true;
  } catch {
    return false;
  }
}

export function formatCompactCount(count: number): string {
  const n = Math.max(0, Math.floor(count || 0));
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (n < 1_000_000) return `${Math.floor(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function sortWorlds(
  scenes: SceneSpec[],
  stats: WorldStatsMap,
  sortBy: WorldSortMode
): SceneSpec[] {
  if (sortBy === 'curated') return scenes;
  const copy = [...scenes];
  if (sortBy === 'az') {
    copy.sort((a, b) => a.name.localeCompare(b.name));
    return copy;
  }
  if (sortBy === 'stars') {
    copy.sort((a, b) => {
      const sa = stats[a.id]?.stars ?? 0;
      const sb = stats[b.id]?.stars ?? 0;
      if (sb !== sa) return sb - sa;
      const va = stats[a.id]?.views ?? 0;
      const vb = stats[b.id]?.views ?? 0;
      if (vb !== va) return vb - va;
      return 0;
    });
    return copy;
  }
  // sortBy === 'views'
  copy.sort((a, b) => {
    const va = stats[a.id]?.views ?? 0;
    const vb = stats[b.id]?.views ?? 0;
    if (vb !== va) return vb - va;
    const sa = stats[a.id]?.stars ?? 0;
    const sb = stats[b.id]?.stars ?? 0;
    if (sb !== sa) return sb - sa;
    return 0;
  });
  return copy;
}
