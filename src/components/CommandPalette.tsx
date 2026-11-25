import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { MEDIA } from '@/engine/presets/media';
import { PALETTES } from '@/engine/presets/palettes';
import { SCENES } from '@/engine/presets/scenes';
import { FONTS, STYLES } from '@/engine/presets/styles';
import type { AudioMode, FontId, MediumId, PaletteId, SceneId, StyleId } from '@/types/studio';

interface CommandItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelectScene: (id: SceneId, matchLook?: boolean) => void;
  onSelectMedium: (id: MediumId) => void;
  onSelectStyle: (id: StyleId) => void;
  onSelectPalette: (id: PaletteId) => void;
  onSelectFont: (id: FontId) => void;
  onSelectAudio: (mode: AudioMode) => void;
  onTriggerBurst: () => void;
  onToggleWebcam: () => void;
  onToggleEditor: () => void;
  onToggleTour: () => void;
  onCopyShare: () => void;
  onUndo: () => void;
  onResetEffects: () => void;
  onResetSimulation: () => void;
  onOpenExport: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onSelectScene,
  onSelectMedium,
  onSelectStyle,
  onSelectPalette,
  onSelectFont,
  onSelectAudio,
  onTriggerBurst,
  onToggleWebcam,
  onToggleEditor,
  onToggleTour,
  onCopyShare,
  onUndo,
  onResetEffects,
  onResetSimulation,
  onOpenExport,
}: CommandPaletteProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  const items = useMemo<CommandItem[]>(() => {
    return [
      ...SCENES.map((s) => ({
        id: `scene-${s.id}`,
        group: s.category,
        label: s.name,
        hint: s.reference,
        run: () => onSelectScene(s.id, true),
      })),
      ...MEDIA.filter((m) => m.id !== 'ascii').map((med) => ({
        id: `medium-${med.id}`,
        group: `Medium · ${med.family}`,
        label: med.name,
        hint: med.reference,
        run: () => onSelectMedium(med.id),
      })),
      ...STYLES.map((st) => ({
        id: `style-${st.id}`,
        group: 'ASCII Style',
        label: st.name,
        hint: st.reference,
        run: () => onSelectStyle(st.id),
      })),
      ...FONTS.map((f) => ({
        id: `font-${f.id}`,
        group: 'Font',
        label: f.name,
        run: () => onSelectFont(f.id),
      })),
      ...PALETTES.map((p) => ({
        id: `pal-${p.id}`,
        group: 'Palette',
        label: p.name,
        run: () => onSelectPalette(p.id),
      })),
      {
        id: 'act-audio-synth',
        group: 'Audio',
        label: 'Audio Reactive: Built-in Synth Beat',
        run: () => onSelectAudio('synth'),
      },
      {
        id: 'act-audio-mic',
        group: 'Audio',
        label: 'Audio Reactive: Live Microphone FFT',
        run: () => onSelectAudio('mic'),
      },
      {
        id: 'act-audio-off',
        group: 'Audio',
        label: 'Audio Reactive: Turn Off',
        run: () => onSelectAudio('off'),
      },
      {
        id: 'act-editor',
        group: 'Action',
        label: 'Toggle Live GLSL Shader Editor',
        hint: 'E',
        run: onToggleEditor,
      },
      {
        id: 'act-tour',
        group: 'Action',
        label: 'Toggle Showcase Auto-Tour',
        hint: 'T',
        run: onToggleTour,
      },
      {
        id: 'act-share',
        group: 'Action',
        label: 'Copy Shareable Preset URL',
        run: onCopyShare,
      },
      {
        id: 'act-burst',
        group: 'Action',
        label: 'Shatter Glyph & Shockwave Burst',
        hint: 'X',
        run: onTriggerBurst,
      },
      {
        id: 'act-cam',
        group: 'Action',
        label: 'Toggle Live Webcam',
        run: onToggleWebcam,
      },
      {
        id: 'act-sim-reset',
        group: 'Action',
        label: 'Reseed Active Simulation',
        run: onResetSimulation,
      },
      {
        id: 'act-fx-reset',
        group: 'Action',
        label: 'Reset FX & Lighting Defaults',
        run: onResetEffects,
      },
      {
        id: 'act-undo',
        group: 'Action',
        label: 'Undo Last Change',
        hint: 'Ctrl+Z',
        run: onUndo,
      },
      {
        id: 'act-export',
        group: 'Action',
        label: 'Export Frame / Video / ANSI / SVG',
        run: onOpenExport,
      },
    ];
  }, [
    onSelectScene,
    onSelectMedium,
    onSelectStyle,
    onSelectFont,
    onSelectPalette,
    onSelectAudio,
    onToggleEditor,
    onToggleTour,
    onCopyShare,
    onTriggerBurst,
    onToggleWebcam,
    onResetSimulation,
    onResetEffects,
    onUndo,
    onOpenExport,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        item.hint?.toLowerCase().includes(q)
    );
  }, [items, query]);

  useEffect(() => {
    setCursor(0);
  }, [query, open]);

  // Keep keyboard-selected item smoothly visible inside scroll container
  useEffect(() => {
    const el = itemRefs.current[cursor];
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [cursor, filtered.length]);

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

  const execute = (item: CommandItem | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as Record<string, string>)}
      aria-label="Command palette"
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = '';
        onClose();
      }}
      className="studio-dialog"
    >
      <div className="flex flex-col max-h-[68dvh]">
        <div className="flex items-center gap-2 px-3.5 h-11 border-b border-[#1e2128] shrink-0">
          <Search className="w-4 h-4 text-[#7b8494] shrink-0" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setCursor((c) => Math.min(filtered.length - 1, c + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                execute(filtered[cursor]);
              }
            }}
            placeholder="Jump to world, medium (oil, watercolor, vhs, dither3d...), font, export..."
            className="flex-1 bg-transparent border-0 text-sm text-[#f2f4f7] placeholder:text-[#646c7a] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            className="inline-flex items-center justify-center w-6 h-6 rounded text-[#8d95a5] hover:text-[#f2f4f7]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-y-auto studio-scroll p-1.5 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#7b8494]">No matching commands</div>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.id}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                type="button"
                onMouseEnter={() => setCursor(idx)}
                onClick={() => execute(item)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded text-left text-xs cursor-pointer ${
                  idx === cursor
                    ? 'bg-[#1c2029] text-[#f2f4f7]'
                    : 'text-[#c8ced8] hover:bg-[#14171e]'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="font-mono-num text-[10px] text-[#7b8494] w-14 shrink-0 truncate">
                    {item.group}
                  </span>
                  <span className="font-medium truncate">{item.label}</span>
                </span>
                {item.hint && (
                  <span className="font-mono-num text-[11px] text-[#646c7a] shrink-0">
                    {item.hint}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </dialog>
  );
}
