import { useEffect, useState } from 'react';
import { AlertCircle, Check, Code2, Play, RotateCcw, Sparkles, X } from 'lucide-react';
import { SCENE_MAP } from '@/engine/presets/scenes';
import { WORLD_SHADERS } from '@/engine/shaders/worldRegistry';
import type { SceneId } from '@/types/studio';

const STARTER_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uCamera;
uniform float uZoom;
uniform vec3 uFlyOffset;
uniform vec4 uAudio;
uniform vec2 uPointer;

void main() {
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / max(1.0, uResolution.y), 1.0) * 2.2 / max(0.35, uZoom);
  float r = length(p);
  float a = atan(p.y, p.x);
  float beat = 1.0 + uAudio.x * 0.45;
  float rings = sin(r * 14.0 - uTime * 3.4 + sin(a * 6.0 + uTime)) * 0.5 + 0.5;
  float mask = smoothstep(1.35, 0.15, r) * beat;
  vec3 col = mix(vec3(0.08, 0.28, 0.55), vec3(1.0, 0.72, 0.25), rings) * mask;
  fragColor = vec4(col, clamp(mask, 0.0, 1.0));
}
`;

interface ShaderEditorProps {
  open: boolean;
  activeScene: SceneId;
  customActive: boolean;
  onApply: (source: string) => string | null;
  onReset: () => void;
  onClose: () => void;
}

export function ShaderEditor({
  open,
  activeScene,
  customActive,
  onApply,
  onReset,
  onClose,
}: ShaderEditorProps) {
  const [code, setCode] = useState(() => WORLD_SHADERS[activeScene] ?? STARTER_SHADER);
  const [error, setError] = useState<string | null>(null);
  const [justCompiled, setJustCompiled] = useState(false);

  // Sync editor source whenever user switches world (unless custom override is active)
  useEffect(() => {
    if (!customActive) {
      setCode(WORLD_SHADERS[activeScene] ?? STARTER_SHADER);
      setError(null);
    }
  }, [activeScene, customActive]);

  if (!open) return null;

  const sceneName = activeScene === 'media' ? 'Media Relief' : SCENE_MAP[activeScene]?.name ?? activeScene;

  const compileNow = () => {
    const err = onApply(code);
    setError(err);
    if (!err) {
      setJustCompiled(true);
      window.setTimeout(() => setJustCompiled(false), 1200);
    }
  };

  const handleReset = () => {
    onReset();
    setCode(WORLD_SHADERS[activeScene] ?? STARTER_SHADER);
    setError(null);
  };

  const handleTemplate = () => {
    setCode(STARTER_SHADER);
    const err = onApply(STARTER_SHADER);
    setError(err);
  };

  return (
    <section
      aria-label="Live GLSL shader editor"
      className="w-full lg:w-[400px] h-[44dvh] lg:h-full shrink-0 bg-[#0c0e12] border-t lg:border-t-0 lg:border-l border-[#1e2128] flex flex-col min-h-0"
    >
      <div className="h-10 shrink-0 px-3 border-b border-[#1e2128] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Code2 className="w-3.5 h-3.5 text-[#f59e0b] shrink-0" />
          <span className="text-xs font-semibold text-[#f2f4f7] truncate">GLSL · {sceneName}</span>
          {customActive && (
            <span className="px-1.5 py-0.5 rounded bg-[#f59e0b]/15 text-[#f59e0b] font-mono-num text-[10px] shrink-0">
              LIVE
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleTemplate}
            title="Load minimal audio-reactive starter shader"
            className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] font-medium text-[#c8ced8] hover:text-[#f2f4f7] hover:bg-[#181c24] cursor-pointer"
          >
            <Sparkles className="w-3 h-3 text-[#f59e0b]" />
            <span>Starter</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            title="Restore built-in world shader"
            className="inline-flex items-center justify-center w-7 h-7 rounded text-[#8d95a5] hover:text-[#f2f4f7] hover:bg-[#181c24] cursor-pointer"
            aria-label="Reset shader to world default"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={compileNow}
            title="Compile shader (Ctrl+Enter)"
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded text-xs font-semibold bg-[#f2f4f7] text-[#08090b] hover:bg-white cursor-pointer active:scale-[0.97]"
          >
            {justCompiled ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#15803d]" />
                <span>Applied</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" />
                <span>Apply</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close shader editor"
            className="inline-flex items-center justify-center w-7 h-7 rounded text-[#8d95a5] hover:text-[#f2f4f7] hover:bg-[#181c24] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="px-3 py-1.5 border-b border-[#181b22] bg-[#090b0e] flex items-center justify-between text-[10px] font-mono-num text-[#7b8494]">
        <span>WebGL2 GLSL 300 es · fragColor.rgb + alpha depth</span>
        <span>Ctrl+Enter to compile</span>
      </div>

      <textarea
        value={code}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="Fragment shader source code"
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            compileNow();
          }
        }}
        className="flex-1 w-full min-h-0 resize-none bg-[#08090b] text-[#d9e0ec] font-mono-num text-[11px] leading-[1.45] p-3 focus:outline-none studio-scroll"
      />

      {error && (
        <div
          role="alert"
          className="shrink-0 max-h-28 overflow-y-auto studio-scroll border-t border-[#7f1d1d] bg-[#241114] px-3 py-2 text-[11px] font-mono-num text-[#fda4af] flex items-start gap-2"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#f87171]" />
          <pre className="m-0 whitespace-pre-wrap break-words flex-1">{error}</pre>
        </div>
      )}
    </section>
  );
}
