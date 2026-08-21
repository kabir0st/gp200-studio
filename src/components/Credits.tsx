interface CreditsProps {
  /** Extra classes on the wrapper (Landing uses `.lp-credits`; the guide
   *  passes Tailwind utilities). */
  className?: string;
}

/** One home for the support link: the credits block promotes it to its own
 *  element, and the board chrome links to it directly. */
export const COFFEE_URL = 'https://buymeacoffee.com/kabir0st';

const LINKS: { href: string; label: string }[] = [
  { href: 'https://kabirtamari.com', label: 'kabirtamari.com' },
  { href: 'https://github.com/kabir0st/gp200-studio', label: 'GitHub' },
  { href: 'https://www.linkedin.com/in/kabirtamari/', label: 'LinkedIn' },
];

/** Author credit block: one source shared by Landing and Guide so the byline
 *  and links stay identical. Styling comes from the passed className. */
export function Credits({ className = '' }: CreditsProps) {
  return (
    <div className={className}>
      <span>Built by Kabir Tamari · free &amp; open source (GPL-3.0)</span>
      <span className="credits-links">
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
            {link.label}
          </a>
        ))}
      </span>
      <a
        className="credits-coffee"
        href={COFFEE_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        ☕ Buy me a coffee
      </a>
    </div>
  );
}
