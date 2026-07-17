interface CreditsProps {
  /** Extra classes on the wrapper (Landing uses `.landing-credits`; the guide
   *  passes Tailwind utilities). */
  className?: string;
}

const LINKS: { href: string; label: string }[] = [
  { href: 'https://kabirtamari.com', label: 'kabirtamari.com' },
  { href: 'https://github.com/kabir0st', label: 'GitHub' },
  { href: 'https://www.linkedin.com/in/kabirtamari/', label: 'LinkedIn' },
];

/** Author credit block — one source shared by Landing and Guide so the byline
 *  and links stay identical. Styling comes from the passed className. */
export function Credits({ className = '' }: CreditsProps) {
  return (
    <div className={className}>
      <span>Built by Kabir Tamari</span>
      <span className="credits-links">
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
            {link.label}
          </a>
        ))}
      </span>
    </div>
  );
}
