/** Controls shared by the MIDI-CC remote panels; helpers live in ccUi.ts. */

interface SectionHeadingProps {
  children: React.ReactNode;
}

export function SectionHeading({ children }: SectionHeadingProps) {
  return (
    <p className="font-mono-display text-label text-text-muted uppercase tracking-widest">
      {children}
    </p>
  );
}

interface CcSliderProps {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

export function CcSlider({ label, value, disabled, onChange }: CcSliderProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono-display text-label text-text-secondary w-20">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="flex-1 min-w-16 accent-accent"
        aria-label={label}
      />
      <b className="font-mono-display text-caption text-text-secondary w-8 text-right tabular-nums">
        {value}
      </b>
    </div>
  );
}
