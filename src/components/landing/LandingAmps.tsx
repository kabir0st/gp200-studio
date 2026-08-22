import { AMP_MODELS, AMP_MODELS_MORE } from './copy';

/**
 * The amps, under their real names.
 *
 * This is the editor's single most convincing claim made concrete: on the
 * pedal's own four-inch screen an amp is "MESS4 LD 3", and there is no way to
 * find out what that is without the manual. The pairs come from
 * src/core/effectDescriptions.ts — the same table the app's effect picker
 * reads — so the page cannot advertise a model the app does not name.
 *
 * A <dl>, because that is what it is: each pedal-side term paired with its
 * definition.
 */
export function LandingAmps() {
  return (
    <section className="lp-band lp-amps" aria-labelledby="lp-amps-title">
      <div className="lp-section-head lp-reveal">
        <h2 id="lp-amps-title" className="lp-h2">The amps, by their real names</h2>
        <p className="lp-section-sub">
          The GP-200 shows you a code. GP200 Studio shows you the amplifier, for every
          model on the unit — and the same goes for the stompboxes and the cabinets.
        </p>
      </div>

      <dl className="lp-amp-list">
        {AMP_MODELS.map((amp) => (
          <div key={amp.valeton} className="lp-amp lp-reveal">
            <dt>{amp.valeton}</dt>
            <dd>{amp.real}</dd>
          </div>
        ))}
      </dl>

      <p className="lp-amp-more lp-reveal">{AMP_MODELS_MORE}</p>

      <a className="lp-guide-link lp-reveal" href="/guide/changing-effects">
        How the effect browser works &rarr;
      </a>
    </section>
  );
}
