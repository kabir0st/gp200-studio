import { Credits } from '@/components/Credits';
import { Logo } from '@/components/Logo';
import { REPO } from '@/seo/site';

/** Closing block: one last way into the editor, then the byline. `Credits` is
 *  shared with the guide footer so the links and the support pill stay
 *  identical everywhere; only the wrapper class differs. */
export function LandingFooter({ onOpenBlank }: { onOpenBlank: () => void }) {
  return (
    <footer className="lp-band lp-footer">
      <div className="lp-footer-cta lp-reveal">
        <Logo size={44} />
        <h2 className="lp-h2">Open it and have a look</h2>
        <p className="lp-section-sub">
          The editor works with no pedal attached. Plug the GP-200 in whenever you are ready.
        </p>
        <button type="button" className="lp-btn primary" onClick={onOpenBlank}>
          OPEN THE EDITOR
          <span className="lp-btn-sub">no pedal needed · blank preset</span>
        </button>
        <span className="lp-footer-links">
          <a href="/guide">Read the guide</a>
          <a href={REPO} target="_blank" rel="noopener noreferrer">Source on GitHub</a>
        </span>
      </div>

      <Credits className="lp-credits lp-reveal" />
    </footer>
  );
}
