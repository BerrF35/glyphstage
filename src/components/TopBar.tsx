import { AudioLines, Check, Code2, Download, Film, Link2, SlidersHorizontal } from 'lucide-react';
import {
  getMediaByFamily,
  MEDIUM_FAMILIES,
  MEDIUM_MAP,
} from '@/engine/presets/media';
import { STYLES } from '@/engine/presets/styles';
import type { AudioMode, MediumFamily, MediumId, SceneId, StyleId } from '@/types/studio';

interface TopBarProps {
  activeMedium: MediumId;
  activeStyle: StyleId;
  activeScene: SceneId;
  audioMode: AudioMode;
  inspectorOpen: boolean;
  editorOpen: boolean;
  shareCopied: boolean;
  onSelectMedium: (id: MediumId) => void;
  onSelectStyle: (id: StyleId) => void;
  onToggleAudio: () => void;
  onToggleEditor: () => void;
  onCopyShare: () => void;
  onToggleMedia: () => void;
  onToggleInspector: () => void;
  onOpenExport: () => void;
}

export function TopBar({
  activeMedium,
  activeStyle,
  activeScene,
  audioMode,
  inspectorOpen,
  editorOpen,
  shareCopied,
  onSelectMedium,
  onSelectStyle,
  onToggleAudio,
  onToggleEditor,
  onCopyShare,
  onToggleMedia,
  onToggleInspector,
  onOpenExport,
}: TopBarProps) {
  const isMedia = activeScene === 'media';
  const audioOn = audioMode !== 'off';
  const activeFamily: MediumFamily = MEDIUM_MAP[activeMedium]?.family ?? 'ascii';
  const familyMedia = getMediaByFamily(activeFamily);

  const handleFamilyChange = (family: MediumFamily) => {
    if (family === 'ascii') {
      onSelectMedium('ascii');
      return;
    }
    const items = getMediaByFamily(family);
    if (items.length > 0) {
      onSelectMedium(items[0].id);
    }
  };

  // Mobile unified select value: "ascii:<styleId>" or "medium:<mediumId>"
  const mobileSelectVal =
    activeMedium === 'ascii' ? `ascii:${activeStyle}` : `medium:${activeMedium}`;

  const handleMobileSelect = (val: string) => {
    if (val.startsWith('ascii:')) {
      onSelectStyle(val.slice(6) as StyleId);
    } else if (val.startsWith('medium:')) {
      onSelectMedium(val.slice(7) as MediumId);
    }
  };

  return (
    <header className="h-11 shrink-0 bg-[#08090b] border-b border-[#1e2128] px-3 flex items-center justify-between gap-2 min-w-0">
      <div className="flex items-center gap-2 shrink-0">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="shrink-0"
        >
          <rect x="2" y="2" width="20" height="20" rx="2" stroke="#f2f4f7" strokeWidth="1.5" />
          <path d="M7 8h4M7 12h10M7 16h6" stroke="#f59e0b" strokeWidth="1.75" strokeLinecap="square" />
          <rect x="14" y="7" width="3" height="2" fill="#f2f4f7" />
        </svg>
        <h1 className="text-sm font-semibold tracking-[-0.02em] text-[#f2f4f7] m-0 whitespace-nowrap">
          glyphstage
        </h1>
      </div>

      {/* Mobile compact unified medium & style selector */}
      <div className="flex-1 flex items-center justify-center min-w-0 sm:hidden">
        <label htmlFor="mobile-style-select" className="sr-only">
          Artistic rendering medium
        </label>
        <select
          id="mobile-style-select"
          value={mobileSelectVal}
          onChange={(e) => handleMobileSelect(e.target.value)}
          className="h-7 max-w-[144px] w-full rounded bg-[#15181e] border border-[#2a2f3a] px-2 text-xs font-medium text-[#f2f4f7] focus-visible:outline-2 focus-visible:outline-[#f59e0b]"
        >
          <optgroup label="ASCII & Text-Mode">
            {STYLES.map((style) => (
              <option key={style.id} value={`ascii:${style.id}`}>
                {style.name}
              </option>
            ))}
          </optgroup>
          {MEDIUM_FAMILIES.filter((f) => f.id !== 'ascii').map((fam) => (
            <optgroup key={fam.id} label={fam.label}>
              {getMediaByFamily(fam.id).map((m) => (
                <option key={m.id} value={`medium:${m.id}`}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Desktop & tablet: Family selector + direct medium/style pills */}
      <div className="hidden sm:flex flex-1 items-center gap-1.5 min-w-0">
        <label htmlFor="desktop-family-select" className="sr-only">
          Rendering medium family
        </label>
        <select
          id="desktop-family-select"
          value={activeFamily}
          onChange={(e) => handleFamilyChange(e.target.value as MediumFamily)}
          title="Switch artistic medium family (ASCII, Paint, Ink, Print, Analog, Mosaic, Glitch, Optics)"
          className={`h-7 shrink-0 rounded px-2 text-xs font-semibold border cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] ${
            activeFamily !== 'ascii'
              ? 'bg-[#1e1b14] text-[#f59e0b] border-[#f59e0b]/45'
              : 'bg-[#14171e] text-[#f2f4f7] border-[#2a303d]'
          }`}
        >
          {MEDIUM_FAMILIES.map((fam) => (
            <option key={fam.id} value={fam.id} className="bg-[#0e1014] text-[#f2f4f7]">
              {fam.shortLabel}
            </option>
          ))}
        </select>

        <nav
          aria-label="Active family looks"
          className="flex flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar min-w-0 py-1"
        >
          {activeFamily === 'ascii'
            ? STYLES.map((style) => {
                const active = activeMedium === 'ascii' && style.id === activeStyle;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => onSelectStyle(style.id)}
                    aria-pressed={active}
                    className={`px-2 h-7 rounded text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#f59e0b] active:scale-[0.97] ${
                      active
                        ? 'bg-[#1c2029] text-[#f2f4f7] border border-[#2f3542]'
                        : 'text-[#8d95a5] hover:text-[#f2f4f7] hover:bg-[#13161c] border border-transparent'
                    }`}
                  >
                    {style.shortName}
                  </button>
                );
              })
            : familyMedia.map((med) => {
                const active = med.id === activeMedium;
                return (
                  <button
                    key={med.id}
                    type="button"
                    onClick={() => onSelectMedium(med.id)}
                    aria-pressed={active}
                    title={`${med.name} — ${med.reference}`}
                    className={`px-2.5 h-7 rounded text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#f59e0b] active:scale-[0.97] ${
                      active
                        ? 'bg-[#1c2029] text-[#f59e0b] border border-[#f59e0b]/45'
                        : 'text-[#8d95a5] hover:text-[#f2f4f7] hover:bg-[#13161c] border border-transparent'
                    }`}
                  >
                    {med.shortName}
                  </button>
                );
              })}
        </nav>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onToggleAudio}
          aria-pressed={audioOn}
          title={audioOn ? `Audio reactive: ${audioMode} (click to turn off)` : 'Enable Synth Beat audio reactivity'}
          className={`hidden md:inline-flex items-center justify-center w-7 h-7 rounded border cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.97] ${
            audioOn
              ? 'bg-[#1e222b] text-[#f59e0b] border-[#f59e0b]/45'
              : 'bg-[#111318] text-[#8d95a5] border-[#252932] hover:border-[#373d4a] hover:text-[#f2f4f7]'
          }`}
          aria-label="Toggle audio reactivity"
        >
          <AudioLines className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={onToggleEditor}
          aria-pressed={editorOpen}
          title="Live GLSL Shader Editor (E)"
          className={`hidden md:inline-flex items-center justify-center w-7 h-7 rounded border cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.97] ${
            editorOpen
              ? 'bg-[#1e222b] text-[#f59e0b] border-[#f59e0b]/45'
              : 'bg-[#111318] text-[#8d95a5] border-[#252932] hover:border-[#373d4a] hover:text-[#f2f4f7]'
          }`}
          aria-label="Toggle live shader editor"
        >
          <Code2 className="w-3.5 h-3.5" strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={onCopyShare}
          title={shareCopied ? 'Preset URL copied!' : 'Copy shareable preset URL'}
          className="hidden sm:inline-flex items-center justify-center w-7 h-7 rounded border bg-[#111318] text-[#8d95a5] border-[#252932] hover:border-[#373d4a] hover:text-[#f2f4f7] cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.97]"
          aria-label="Copy shareable preset link"
        >
          {shareCopied ? (
            <Check className="w-3.5 h-3.5 text-[#22c55e]" strokeWidth={2} />
          ) : (
            <Link2 className="w-3.5 h-3.5" strokeWidth={1.75} />
          )}
        </button>

        <button
          type="button"
          onClick={onToggleMedia}
          aria-pressed={isMedia}
          title="Image, Video & Webcam Input"
          className={`inline-flex items-center gap-1.5 h-7 px-2 rounded text-xs font-medium border cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.97] ${
            isMedia
              ? 'bg-[#1e222b] text-[#f59e0b] border-[#f59e0b]/40'
              : 'bg-[#111318] text-[#c8ced8] border-[#252932] hover:border-[#373d4a] hover:text-[#f2f4f7]'
          }`}
        >
          <Film className="w-3.5 h-3.5 shrink-0" strokeWidth={1.6} />
          <span className="hidden lg:inline">Media</span>
        </button>

        <button
          type="button"
          onClick={onToggleInspector}
          aria-pressed={inspectorOpen}
          title="Toggle Controls Inspector"
          className={`inline-flex items-center gap-1.5 h-7 px-2 rounded text-xs font-medium border cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.97] ${
            inspectorOpen
              ? 'bg-[#1e222b] text-[#f2f4f7] border-[#373d4a]'
              : 'bg-[#111318] text-[#c8ced8] border-[#252932] hover:border-[#373d4a] hover:text-[#f2f4f7]'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" strokeWidth={1.6} />
          <span className="hidden lg:inline">Controls</span>
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-xs font-semibold bg-[#f2f4f7] text-[#08090b] hover:bg-white cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#f59e0b] active:scale-[0.97]"
        >
          <Download className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          <span className="hidden sm:inline">Export</span>
        </button>
      </div>
    </header>
  );
}
