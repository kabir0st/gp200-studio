import { WORKS } from './copy';

/**
 * The "why not just use the official editor" section, and the privacy line.
 *
 * The hardware photo lives in public/photos/, not public/guide/ — the guide
 * folder's PNGs are stripped from the build by scripts/prerender.mjs, and its
 * dead-asset guard only walks `/guide/` references.
 */
export function LandingWorks() {
  return (
    <section className="lp-band lp-story lp-works tint" aria-labelledby="lp-works-title">
      <div className="lp-story-inner">
      <div className="lp-story-text lp-reveal">
        <span className="lp-part" aria-hidden="true">{WORKS.part}</span>
        <h2 id="lp-works-title" className="lp-h2">{WORKS.title}</h2>
        <p className="lp-story-lede">{WORKS.lede}</p>
        <p className="lp-story-body">{WORKS.body}</p>
        <ul className="lp-points">
          {WORKS.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>

      <div className="lp-story-shots lp-reveal">
        <figure className="lp-shot lp-photo" data-lp-parallax>
          <img
            src={`${import.meta.env.BASE_URL}photos/gp200-hardware.jpg`}
            alt={WORKS.photoAlt}
            loading="lazy"
            decoding="async"
            className="lp-shot-img"
          />
        </figure>
      </div>
      </div>
    </section>
  );
}
