import { FEATURES } from './copy';

/** The six-card grid: what you get, at a glance, for a reader who scrolled
 *  past the long sections. Copy tracks APP_FEATURES in src/seo/site.ts. */
export function LandingFeatures() {
  return (
    <section className="lp-band lp-section" aria-labelledby="lp-features-title">
      <div className="lp-section-head lp-reveal">
        <h2 id="lp-features-title" className="lp-h2">Everything in one tab</h2>
        <p className="lp-section-sub">
          No install, no account, no backend. Open a browser and the whole pedal is in front of you.
        </p>
      </div>
      <ul className="lp-grid">
        {FEATURES.map((feature) => (
          <li key={feature.title} className="lp-card lp-reveal">
            <h3 className="lp-card-title">{feature.title}</h3>
            <p className="lp-card-body">{feature.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
