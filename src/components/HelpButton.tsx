interface HelpButtonProps {
  section: string;
}

export function HelpButton({ section }: HelpButtonProps) {
  return (
    <a
      href={`/help#${section}`}
      className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-border-subtle text-text-muted font-mono-display text-label font-bold transition-all duration-150 hover:border-accent-amber hover:text-accent-amber"
      title="Help"
    >
      ?
    </a>
  );
}
