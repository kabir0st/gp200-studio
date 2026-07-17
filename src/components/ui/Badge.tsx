import type { HTMLAttributes } from 'react';

interface ModuleColor {
  accent: string;
  accentDim: string;
  glow: string;
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  moduleColor: ModuleColor;
}

/** Module badge (see docs/design-system.md "Components > Badge"). */
export function Badge({ moduleColor, className = '', style, children, ...props }: BadgeProps) {
  return (
    <span
      className={`font-mono-display text-label font-bold tracking-widest px-2 py-0.5 rounded uppercase ${className}`}
      style={{
        color: moduleColor.accent,
        backgroundColor: moduleColor.glow,
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}

/** LED status dot: pulses via the .led-active CSS keyframe (see src/index.css), not GSAP. */
export function Led({ active, className = '' }: { active: boolean; className?: string }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${active ? 'led-active bg-accent-green' : 'bg-border-active'} ${className}`}
      aria-hidden="true"
    />
  );
}
