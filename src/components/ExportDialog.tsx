import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  FileCode2,
  FileImage,
  FileText,
  Shapes,
  Square,
  Terminal,
  Video,
  X,
} from 'lucide-react';
import { downloadBlob, downloadDataUrl, recordCanvasLoop } from '@/engine/export/exporters';
import {
  frameToAnsiTerminal,
  frameToColoredHtml,
  frameToEmbedSnippet,
  frameToPlainText,
  frameToSvg,
  type SampledAsciiFrame,
} from '@/engine/export/textSampler';
import type { PlotterSvgMode, StageHandle } from './StageCanvas';

interface ExportDialogProps {
  open: boolean;
  stageRef: React.RefObject<StageHandle | null>;
  onClose: () => void;
}

type CopyKey = 'text' | 'ansi' | 'embed' | null;

export function ExportDialog({ open, stageRef, onClose }: ExportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stopRecRef = useRef<(() => void) | null>(null);
  const sampledRef = useRef<SampledAsciiFrame | null>(null);

  const [previewText, setPreviewText] = useState('');
  const [copiedKey, setCopiedKey] = useState<CopyKey>(null);
  const [durationMs, setDurationMs] = useState<number>(4000);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      setRecordError(null);
      const sampled = stageRef.current?.sampleTextFrame(88) ?? null;
      sampledRef.current = sampled;
      setPreviewText(sampled ? frameToPlainText(sampled) : '');
      if (!dialog.open) dialog.showModal();
    } else {
      stopRecRef.current?.();
      stopRecRef.current = null;
      if (dialog.open) dialog.close();
    }
  }, [open, stageRef]);

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
      if (pressedOutside && isOutside(e) && dialog.open) {
        dialog.close();
      }
    };

    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('pointerup', onUp);
    return () => {
      dialog.removeEventListener('pointerdown', onDown);
      dialog.removeEventListener('pointerup', onUp);
    };
  }, []);

  const flashCopied = (key: CopyKey) => {
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1600);
  };

  const getFrame = () => {
    const fresh = stageRef.current?.sampleTextFrame(116) ?? sampledRef.current;
    sampledRef.current = fresh;
    return fresh;
  };

  const handlePng = (scale: 1 | 2) => {
    const url = stageRef.current?.capturePng(scale);
    if (url) downloadDataUrl(url, `glyphstage-${scale === 2 ? 'hi-' : ''}${Date.now()}.png`);
  };

  const handleVideo = () => {
    const canvas = stageRef.current?.getCanvas();
    if (!canvas) return;
    if (recording) {
      stopRecRef.current?.();
      stopRecRef.current = null;
      return;
    }

    setRecordError(null);
    setRecording(true);
    setRecordProgress(0);
    stopRecRef.current = recordCanvasLoop(canvas, {
      durationMs,
      onProgress: setRecordProgress,
      onError: setRecordError,
      onDone: () => {
        setRecording(false);
        setRecordProgress(0);
        stopRecRef.current = null;
      },
    });
  };

  const handleCopyText = async () => {
    const frame = getFrame();
    if (!frame) return;
    await navigator.clipboard.writeText(frameToPlainText(frame));
    flashCopied('text');
  };

  const handleCopyAnsi = async () => {
    const frame = getFrame();
    if (!frame) return;
    await navigator.clipboard.writeText(frameToAnsiTerminal(frame));
    flashCopied('ansi');
  };

  const handleAnsiFile = () => {
    const frame = getFrame();
    if (!frame) return;
    downloadBlob(
      new Blob([frameToAnsiTerminal(frame)], { type: 'text/plain;charset=utf-8' }),
      `glyphstage-${Date.now()}.ans`
    );
  };

  const handleCopyEmbed = async () => {
    const frame = getFrame();
    if (!frame) return;
    await navigator.clipboard.writeText(frameToEmbedSnippet(frame));
    flashCopied('embed');
  };

  const handleTxt = () => {
    const frame = getFrame();
    if (!frame) return;
    downloadBlob(
      new Blob([frameToPlainText(frame)], { type: 'text/plain;charset=utf-8' }),
      `glyphstage-${Date.now()}.txt`
    );
  };

  const handleHtml = () => {
    const frame = getFrame();
    if (!frame) return;
    downloadBlob(
      new Blob([frameToColoredHtml(frame)], { type: 'text/html;charset=utf-8' }),
      `glyphstage-${Date.now()}.html`
    );
  };

  const handleSvg = () => {
    const frame = getFrame();
    if (!frame) return;
    downloadBlob(
      new Blob([frameToSvg(frame)], { type: 'image/svg+xml;charset=utf-8' }),
      `glyphstage-${Date.now()}.svg`
    );
  };

  const handlePlotterSvg = (mode: PlotterSvgMode) => {
    const svg = stageRef.current?.exportPlotterSvg(mode);
    if (!svg) return;
    downloadBlob(
      new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
      `glyphstage-plotter-${mode}-${Date.now()}.svg`
    );
  };

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as Record<string, string>)}
      aria-labelledby="export-dialog-title"
      onClose={() => {
        stopRecRef.current?.();
        stopRecRef.current = null;
        if (dialogRef.current) dialogRef.current.returnValue = '';
        onClose();
      }}
      className="studio-dialog"
    >
      <div className="p-4 space-y-3.5">
        <div className="flex items-center justify-between border-b border-[#1e2128] pb-3">
          <h1 id="export-dialog-title" className="text-sm font-semibold text-[#f2f4f7] m-0">
            Export Studio Frame
          </h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export dialog"
            className="inline-flex items-center justify-center w-7 h-7 rounded text-[#8d95a5] hover:text-[#f2f4f7] hover:bg-[#1a1e26] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {previewText && (
          <div className="max-h-36 overflow-hidden rounded bg-[#08090b] border border-[#1e2128] p-2.5 flex justify-center">
            <pre className="m-0 font-mono-num text-[7px] leading-[1.08] text-[#c8ced8] select-all">
              {previewText}
            </pre>
          </div>
        )}

        {/* Motion video capture bar */}
        <div className="rounded bg-[#12151c] border border-[#222733] p-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-[#f59e0b]" />
              <span className="text-xs font-medium text-[#f2f4f7]">Motion Video (WebM / MP4)</span>
            </div>
            <div className="flex items-center gap-1">
              {([
                [4000, '4s'],
                [8000, '8s'],
                [15000, '15s'],
                [0, 'Manual'],
              ] as Array<[number, string]>).map(([ms, label]) => (
                <button
                  key={label}
                  type="button"
                  disabled={recording}
                  onClick={() => setDurationMs(ms)}
                  className={`h-6 px-2 rounded text-[11px] font-mono-num cursor-pointer disabled:opacity-50 ${
                    durationMs === ms
                      ? 'bg-[#1f2430] text-[#f59e0b] border border-[#f59e0b]/45'
                      : 'text-[#8d95a5] hover:text-[#f2f4f7] border border-transparent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleVideo}
              className={`inline-flex items-center justify-center gap-1.5 h-7 px-3 rounded text-xs font-semibold cursor-pointer active:scale-[0.97] ${
                recording
                  ? 'bg-[#7f1d1d] text-[#fecaca] hover:bg-[#991b1b]'
                  : 'bg-[#f2f4f7] text-[#08090b] hover:bg-white'
              }`}
            >
              {recording ? (
                <>
                  <Square className="w-3 h-3 fill-current" />
                  <span>Stop &amp; Save</span>
                </>
              ) : (
                <>
                  <Video className="w-3.5 h-3.5" />
                  <span>{durationMs === 0 ? 'Start Recording' : `Record ${durationMs / 1000}s`}</span>
                </>
              )}
            </button>

            <div className="flex-1 h-1.5 rounded bg-[#1a1e28] overflow-hidden">
              <div
                className="h-full bg-[#f59e0b] transition-[width] duration-100"
                style={{
                  width: recording
                    ? durationMs > 0
                      ? `${Math.round(recordProgress * 100)}%`
                      : '100%'
                    : '0%',
                }}
              />
            </div>
          </div>

          {recordError && (
            <p role="alert" className="text-[11px] text-[#fda4af] m-0">
              {recordError}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => handlePng(1)}
            className="flex items-center gap-2.5 p-2.5 rounded bg-[#14171e] hover:bg-[#1c202a] border border-[#242934] text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.98]"
          >
            <FileImage className="w-4 h-4 text-[#f59e0b] shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-medium text-[#f2f4f7]">PNG Snapshot</div>
              <div className="text-[11px] text-[#7b8494]">Live viewport res</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handlePng(2)}
            className="flex items-center gap-2.5 p-2.5 rounded bg-[#14171e] hover:bg-[#1c202a] border border-[#242934] text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.98]"
          >
            <FileImage className="w-4 h-4 text-[#f59e0b] shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-medium text-[#f2f4f7]">2x Hi-Res PNG</div>
              <div className="text-[11px] text-[#7b8494]">Crisp poster render</div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleCopyAnsi}
            className="flex items-center gap-2.5 p-2.5 rounded bg-[#14171e] hover:bg-[#1c202a] border border-[#242934] text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.98]"
          >
            {copiedKey === 'ansi' ? (
              <Check className="w-4 h-4 text-[#22c55e] shrink-0" />
            ) : (
              <Terminal className="w-4 h-4 text-[#c8ced8] shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-xs font-medium text-[#f2f4f7]">
                {copiedKey === 'ansi' ? 'Copied ANSI' : 'Copy 24-bit ANSI'}
              </div>
              <div className="text-[11px] text-[#7b8494]">TrueColor terminal</div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleAnsiFile}
            className="flex items-center gap-2.5 p-2.5 rounded bg-[#14171e] hover:bg-[#1c202a] border border-[#242934] text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.98]"
          >
            <Terminal className="w-4 h-4 text-[#c8ced8] shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-medium text-[#f2f4f7]">Terminal .ans</div>
              <div className="text-[11px] text-[#7b8494]">cat in iTerm / WT</div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleCopyText}
            className="flex items-center gap-2.5 p-2.5 rounded bg-[#14171e] hover:bg-[#1c202a] border border-[#242934] text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.98]"
          >
            {copiedKey === 'text' ? (
              <Check className="w-4 h-4 text-[#22c55e] shrink-0" />
            ) : (
              <Copy className="w-4 h-4 text-[#c8ced8] shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-xs font-medium text-[#f2f4f7]">
                {copiedKey === 'text' ? 'Copied Text' : 'Copy Plain Text'}
              </div>
              <div className="text-[11px] text-[#7b8494]">Clipboard grid</div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleTxt}
            className="flex items-center gap-2.5 p-2.5 rounded bg-[#14171e] hover:bg-[#1c202a] border border-[#242934] text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.98]"
          >
            <FileText className="w-4 h-4 text-[#c8ced8] shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-medium text-[#f2f4f7]">Plain Text</div>
              <div className="text-[11px] text-[#7b8494]">Download .txt</div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleHtml}
            className="flex items-center gap-2.5 p-2.5 rounded bg-[#14171e] hover:bg-[#1c202a] border border-[#242934] text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.98]"
          >
            <FileCode2 className="w-4 h-4 text-[#c8ced8] shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-medium text-[#f2f4f7]">Colored HTML</div>
              <div className="text-[11px] text-[#7b8494]">Standalone page</div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleCopyEmbed}
            className="flex items-center gap-2.5 p-2.5 rounded bg-[#14171e] hover:bg-[#1c202a] border border-[#242934] text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.98]"
          >
            {copiedKey === 'embed' ? (
              <Check className="w-4 h-4 text-[#22c55e] shrink-0" />
            ) : (
              <Code2 className="w-4 h-4 text-[#c8ced8] shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-xs font-medium text-[#f2f4f7]">
                {copiedKey === 'embed' ? 'Copied Embed' : 'Copy HTML Embed'}
              </div>
              <div className="text-[11px] text-[#7b8494]">Responsive snippet</div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleSvg}
            className="col-span-2 flex items-center justify-center gap-2 p-2 rounded bg-[#14171e] hover:bg-[#1c202a] border border-[#242934] text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#f59e0b] active:scale-[0.98]"
          >
            <Shapes className="w-4 h-4 text-[#c8ced8] shrink-0" />
            <span className="text-xs font-medium text-[#f2f4f7]">Download ASCII Grid SVG</span>
            <span className="text-[11px] text-[#7b8494]">(Scalable text &amp; ANSI grid)</span>
          </button>
        </div>

        {/* True AxiDraw Pen-Plotter Vector Exports */}
        <div className="rounded bg-[#12151c] border border-[#222733] p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#f2f4f7]">Pen-Plotter Vector SVG (AxiDraw)</span>
            <span className="font-mono-num text-[10px] text-[#8d95a5]">True vector paths</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              ['squiggle', 'FM Squiggle Waves'],
              ['tsp', 'TSP Single-Line (2-Opt)'],
              ['stipple', 'Voronoi Stipple Dots'],
              ['contour', 'Topographic Isolines'],
            ] as Array<[PlotterSvgMode, string]>).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => handlePlotterSvg(mode)}
                className="h-7 px-2 rounded bg-[#171b24] hover:bg-[#1f2430] border border-[#282e3b] text-[11px] font-medium text-[#e4e8f0] hover:text-[#f59e0b] cursor-pointer transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </dialog>
  );
}
