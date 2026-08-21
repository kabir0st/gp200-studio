/**
 * A compact bar that fades in once the hero's connect button has scrolled out
 * of view, so the way into the editor is never more than one click away down
 * a long page.
 *
 * It starts hidden in CSS *unconditionally* rather than behind the
 * `data-anim` gate: with no JavaScript there is no scrolling trigger to reveal
 * it, and a bar pinned over a static page would just cover the content. Every
 * link it offers exists in the hero and the footer too, so nothing is lost.
 */
export function LandingStickyCta({
  label,
  onActivate,
}: {
  label: string;
  onActivate: () => void;
}) {
  return (
    <div className="lp-sticky" data-lp-sticky>
      <span className="lp-sticky-name">GP200 Studio</span>
      <span className="lp-sticky-actions">
        <a className="lp-sticky-link" href="/guide">Guide</a>
        <button type="button" className="lp-btn primary compact" onClick={onActivate}>
          {label}
        </button>
      </span>
    </div>
  );
}
