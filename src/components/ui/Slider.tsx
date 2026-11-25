import type { CSSProperties } from 'react';

interface SliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
}

export function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: SliderProps) {
  const vars = {
    '--attr-min': String(min),
    '--attr-max': String(max),
    '--control-value': String(value),
  } as CSSProperties;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs leading-none">
        <label htmlFor={id} className="text-[#c8ced8] font-medium">
          {label}
        </label>
        <span className="font-mono-num text-[11px] text-[#8d95a5]">{displayValue}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={displayValue}
        style={vars}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="studio-range"
      />
    </div>
  );
}
