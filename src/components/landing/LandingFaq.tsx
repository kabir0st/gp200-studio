import { allGuideFaqs } from '@/guide/manifest';
import { FAQ_PICKS } from './copy';

/**
 * A short FAQ, pulled from the guide's own bank so there is one set of answers
 * rather than two that drift.
 *
 * Deliberately NOT mirrored into FAQPage JSON-LD. The guide hub already emits
 * that schema over the full bank (src/seo/), and a second FAQPage on the home
 * page would compete with it for the same questions.
 *
 * <details>/<summary> rather than a JS accordion: the prerendered page has no
 * React on it until the bundle boots, and every answer must still be openable
 * (and findable by in-page search) before then.
 */
export function LandingFaq() {
  const bank = allGuideFaqs();
  // Keyed by question text, so reordering the manifest cannot silently swap
  // which six appear here; one that no longer exists is dropped, not blank.
  const picks = FAQ_PICKS.map((q) => bank.find((faq) => faq.q === q)).filter(
    (faq): faq is NonNullable<typeof faq> => faq !== undefined,
  );

  return (
    <section className="lp-band lp-section lp-faq" aria-labelledby="lp-faq-title">
      <div className="lp-section-head lp-reveal">
        <h2 id="lp-faq-title" className="lp-h2">Questions</h2>
        <p className="lp-section-sub">
          The rest are answered across the <a href="/guide">thirteen guide sections</a>.
        </p>
      </div>
      <div className="lp-faq-list">
        {picks.map((faq) => (
          <details key={faq.q} className="lp-faq-item lp-reveal">
            <summary>{faq.q}</summary>
            <p>{faq.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
