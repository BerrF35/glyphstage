import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Shuffle, Star, X } from 'lucide-react';
import { PALETTE_MAP } from '@/engine/presets/palettes';
import { SCENES, WORLD_CATEGORIES } from '@/engine/presets/scenes';
import { STYLE_MAP } from '@/engine/presets/styles';
import type { SceneId, WorldCategory } from '@/types/studio';

interface WorldBrowserProps {
  open: boolean;
  activeScene: SceneId;
  matchLook: boolean;
  favorites: SceneId[];
  thumbs: Record<string, string>;
  onRequestThumb: (sceneId: Exclude<SceneId, 'media'>) => void;
  onToggleFavorite: (id: SceneId) => void;
  onToggleMatchLook: (val: boolean) => void;
  onSelectScene: (id: SceneId, matchLook: boolean) => void;
  onShuffle: () => void;
  onClose: () => void;
}

export function WorldBrowser({
  open,
  activeScene,
  matchLook,
  favorites,
  thumbs,
  onRequestThumb,
  onToggleFavorite,
  onToggleMatchLook,
  onSelectScene,
  onShuffle,
  onClose,
}: WorldBrowserProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState<'all' | 'favorites' | WorldCategory>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      setQuery('');
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };

    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e) && dialog.open) dialog.close();
    };

    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('pointerup', onUp);
    return () => {
      dialog.removeEventListener('pointerdown', onDown);
      dialog.removeEventListener('pointerup', onUp);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SCENES.filter((scene) => {
      if (category === 'favorites') {
        if (!favorites.includes(scene.id)) return false;
      } else if (category !== 'all' && scene.category !== category) {
        return false;
      }
      if (!q) return true;
      return (
        scene.name.toLowerCase().includes(q) ||
        scene.reference.toLowerCase().includes(q) ||
        scene.category.toLowerCase().includes(q) ||
        scene.suggestedStyle.toLowerCase().includes(q)
      );
    });
  }, [category, query, favorites]);

  // Progressive non-blocking WebGL2 thumbnail generation for visible cards
  const thumbsRef = useRef(thumbs);
  thumbsRef.current = thumbs;

  useEffect(() => {
    if (!open) return;
    const missing = filtered
      .map((s) => s.id)
      .filter((id) => !thumbsRef.current[id]);

    if (missing.length === 0) return;

    let cancelled = false;
    let idx = 0;
    let timerId = 0;

    const step = () => {
      if (cancelled || idx >= missing.length) return;
      // Render 2 thumbnails per slice so UI scrolling and typing stay 60fps
      for (let k = 0; k < 2 && idx < missing.length; k++) {
        const id = missing[idx++];
        if (!thumbsRef.current[id]) {
          onRequestThumb(id);
        }
      }
      if (idx < missing.length) {
        timerId = window.setTimeout(step, 32);
      }
    };

    timerId = window.setTimeout(step, 40);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [open, filtered, onRequestThumb]);

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as Record<string, string>)}
      aria-labelledby="world-atlas-title"
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = '';
        onClose();
      }}
      className="studio-dialog world-dialog"
    >
      <div className="flex flex-col max-h-[84dvh]">
        <div className="px-4 py-3 border-b border-[#1e2128] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <h1 id="world-atlas-title" className="text-sm font-semibold text-[#f2f4f7] m-0">
              Worlds
            </h1>
            <span className="font-mono-num text-[11px] text-[#8d95a5]">
              {filtered.length} / {SCENES.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-[#c8ced8] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={matchLook}
                onChange={(e) => onToggleMatchLook(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-[#f59e0b]"
              />
              <span>Match curated style</span>
            </label>

            <button
              type="button"
              onClick={() => {
                onShuffle();
                onClose();
              }}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded bg-[#161a22] hover:bg-[#1e232e] border border-[#2a303d] text-xs font-medium text-[#f2f4f7] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b]"
            >
              <Shuffle className="w-3.5 h-3.5 text-[#f59e0b]" />
              <span>Shuffle</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close worlds browser"
              className="inline-flex items-center justify-center w-7 h-7 rounded text-[#8d95a5] hover:text-[#f2f4f7] hover:bg-[#1a1e26] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-4 py-2.5 border-b border-[#1e2128] flex flex-col gap-2 shrink-0 bg-[#0b0d10]">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-[#646c7a] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${SCENES.length} worlds, artists, sims (Gray-Scott, Quilez, Harri, play.core, Doom)...`}
              className="w-full h-8 pl-8 pr-2.5 rounded bg-[#08090b] border border-[#232732] text-xs text-[#f2f4f7] placeholder:text-[#646c7a] focus-visible:outline-2 focus-visible:outline-[#f59e0b]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setCategory('all')}
              className={`h-7 px-2.5 rounded text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                category === 'all'
                  ? 'bg-[#1c2029] text-[#f2f4f7] border border-[#2f3542]'
                  : 'text-[#8d95a5] hover:text-[#f2f4f7] border border-transparent'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setCategory('favorites')}
              className={`inline-flex items-center gap-1 h-7 px-2.5 rounded text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                category === 'favorites'
                  ? 'bg-[#1c2029] text-[#f59e0b] border border-[#f59e0b]/40'
                  : 'text-[#8d95a5] hover:text-[#f2f4f7] border border-transparent'
              }`}
            >
              <Star className="w-3 h-3" />
              <span>Saved</span>
              {favorites.length > 0 && (
                <span className="font-mono-num text-[10px] opacity-80">{favorites.length}</span>
              )}
            </button>
            {WORLD_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`h-7 px-2.5 rounded text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                  category === cat.id
                    ? 'bg-[#1c2029] text-[#f2f4f7] border border-[#2f3542]'
                    : 'text-[#8d95a5] hover:text-[#f2f4f7] border border-transparent'
                }`}
              >
                {cat.shortLabel}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto studio-scroll p-3.5">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#7b8494]">
              {category === 'favorites' && favorites.length === 0
                ? 'Star any world card to build your favorites list.'
                : `No worlds match "${query}"`}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {filtered.map((scene) => {
                const active = scene.id === activeScene;
                const isFav = favorites.includes(scene.id);
                const pal = PALETTE_MAP[scene.suggestedPalette];
                const style = STYLE_MAP[scene.suggestedStyle];
                const thumbUrl = thumbs[scene.id];

                return (
                  <div
                    key={scene.id}
                    className={`group relative rounded border overflow-hidden transition-colors duration-120 ${
                      active
                        ? 'bg-[#1a1e26] border-[#f59e0b]/70 text-[#f2f4f7]'
                        : 'bg-[#12151b] border-[#1f232c] text-[#d5dbe6] hover:border-[#343b4a] hover:bg-[#161a22]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectScene(scene.id, matchLook);
                        onClose();
                      }}
                      className="w-full text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#f59e0b]"
                    >
                      <div
                        className="relative aspect-[16/10] w-full overflow-hidden border-b border-[#1e2128]"
                        style={{ backgroundColor: pal.bg }}
                      >
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover block"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-mono-num text-[11px] tracking-widest opacity-45" style={{ color: pal.mid }}>
                            {style.sample}
                          </div>
                        )}
                        {scene.isStateful && (
                          <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-[#08090b]/85 border border-[#f59e0b]/50 font-mono-num text-[9px] font-semibold text-[#f59e0b]">
                            INTERACTIVE SIM
                          </span>
                        )}
                      </div>

                      <div className="p-2.5">
                        <div className="flex items-start justify-between gap-2 pr-6">
                          <span className="text-xs font-semibold leading-snug truncate">
                            {scene.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#7b8494] mt-0.5 truncate">
                          {scene.reference}
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-[#1e2128] flex items-center justify-between text-[10px] font-mono-num text-[#8d95a5]">
                          <span>{style.shortName}</span>
                          <span className="flex items-center gap-0.5 shrink-0" aria-hidden="true">
                            <span className="w-2 h-2.5 rounded-[1px]" style={{ backgroundColor: pal.bg }} />
                            <span className="w-2 h-2.5 rounded-[1px]" style={{ backgroundColor: pal.mid }} />
                            <span className="w-2 h-2.5 rounded-[1px]" style={{ backgroundColor: pal.accent }} />
                          </span>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(scene.id);
                      }}
                      aria-label={isFav ? `Remove ${scene.name} from favorites` : `Save ${scene.name} to favorites`}
                      aria-pressed={isFav}
                      className={`absolute top-1.5 right-1.5 w-6 h-6 rounded flex items-center justify-center cursor-pointer transition-colors ${
                        isFav
                          ? 'bg-[#08090b]/85 text-[#f59e0b] border border-[#f59e0b]/50'
                          : 'bg-[#08090b]/70 text-[#8d95a5] hover:text-[#f2f4f7] border border-[#2a2f3a]/70'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
