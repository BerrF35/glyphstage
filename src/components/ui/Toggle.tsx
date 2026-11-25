interface ToggleProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ id, label, checked, onChange }: ToggleProps) {
  return (
    <div className="flex items-center justify-between py-1">
      <label htmlFor={id} className="text-xs font-medium text-[#c8ced8] cursor-pointer select-none">
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f59e0b] active:scale-[0.97] ${
          checked
            ? 'bg-[#f59e0b] border-[#f59e0b]'
            : 'bg-[#1a1d24] border-[#2d323d]'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full transition-transform duration-150 ${
            checked ? 'translate-x-[18px] bg-[#08090b]' : 'translate-x-[2px] bg-[#98a0ae]'
          }`}
        />
      </button>
    </div>
  );
}
