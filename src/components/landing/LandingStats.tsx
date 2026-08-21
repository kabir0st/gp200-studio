import { SPEC, STATS } from './copy';

/**
 * The strip directly under the stage: four counted figures, then the rating
 * plate's rows as a silk-screened line beneath them.
 *
 * The plate used to sit in the hero, but a stage has no room for a card
 * floating beside the band — so it moved here, where the same facts read as
 * the panel stencilled along the front of the deck.
 *
 * Every final value is in the static markup, so the prerendered page and a
 * reduced-motion visitor both read the real figure. useLandingMotion counts up
 * to it from zero by rewriting `textContent` — an enhancement over correct
 * markup, never the source of it.
 */
export function LandingStats() {
  return (
    <section className="lp-band lp-stats-band" aria-label="GP200 Studio by the numbers">
      <div className="lp-stats lp-reveal">
        {STATS.map((stat) => (
          <div key={stat.label} className="lp-stat">
            <span className="lp-stat-value" data-lp-count={stat.value}>
              {stat.value}
            </span>
            <span className="lp-stat-label">{stat.label}</span>
          </div>
        ))}
      </div>

      <dl className="lp-spec-strip lp-reveal">
        {SPEC.map((row) => (
          <div key={row.key} className="lp-spec-pair">
            <dt>{row.key}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
