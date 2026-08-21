import { LandingShot } from './LandingShot';
import { STORY } from './copy';

/**
 * The three numbered story sections, alternating the screenshot from side to
 * side. Each `.lp-reveal` is picked up by ScrollTrigger.batch in
 * useLandingMotion; the shots additionally carry `data-lp-parallax`.
 *
 * Nothing here is hidden by default — the reveal state is applied only under
 * `:root[data-anim='on']`, which the pre-paint script in index.html sets, so
 * the prerendered page reads in full with JavaScript off.
 */
export function LandingStory() {
  return (
    <>
      {STORY.map((section, index) => (
        <section
          key={section.part}
          className={`lp-band lp-story${index % 2 === 1 ? ' flip tint' : ''}`}
          aria-labelledby={`lp-story-${section.part}`}
        >
          <div className="lp-story-inner">
          <div className="lp-story-text lp-reveal">
            <span className="lp-part" aria-hidden="true">{section.part}</span>
            <h2 id={`lp-story-${section.part}`} className="lp-h2">{section.title}</h2>
            <p className="lp-story-lede">{section.lede}</p>
            <p className="lp-story-body">{section.body}</p>
            <ul className="lp-points">
              {section.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>

          <div className="lp-story-shots lp-reveal">
            {section.shots.map((shot) => (
              <figure key={shot.name} className="lp-shot" data-lp-parallax>
                <LandingShot
                  name={shot.name}
                  alt={shot.alt}
                  sizes="(min-width: 1100px) 560px, 100vw"
                />
              </figure>
            ))}
          </div>
          </div>
        </section>
      ))}
    </>
  );
}
