import type { HTMLAttributes, Ref } from 'react';

interface ModuleColor {
  accent: string;
  accentDim: string;
  glow: string;
}

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Pass a MODULE_COLORS[module] entry to tint the border/glow per effect module. */
  moduleColor?: ModuleColor;
  ref?: Ref<HTMLDivElement>;
}

/** Shared card/panel primitive — see docs/design-system.md "Components > Card". */
export function Card({ moduleColor, className = '', style, children, ref, ...props }: CardProps) {
  const moduleStyle = moduleColor
    ? {
        borderColor: moduleColor.accentDim,
        boxShadow: `0 0 12px ${moduleColor.glow}`,
        ...style,
      }
    : style;

  return (
    <div
      ref={ref}
      className={`bg-bg-surface border border-border-subtle rounded-lg shadow-card ${className}`}
      style={moduleStyle}
      {...props}
    >
      {children}
    </div>
  );
}
