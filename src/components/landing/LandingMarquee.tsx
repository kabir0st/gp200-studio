import { MARQUEE_PEDALS } from './copy';

/**
 * A slow rail of the generated pedal artwork (public/pedals/*.svg).
 *
 * Purely decorative, so the whole thing is aria-hidden. The track is rendered
 * twice: useLandingMotion translates it by -50% on a loop, which reads as
 * endless because the second copy has already taken the first one's place.
 * With no JavaScript, or under reduced motion, it is simply a static row that
 * clips at the edge of the page.
 */
export function LandingMarquee() {
  const track = [...MARQUEE_PEDALS, ...MARQUEE_PEDALS];
  return (
    <div className="lp-band lp-marquee tint" aria-hidden="true">
      <div className="lp-marquee-track" data-lp-marquee>
        {track.map((pedal, index) => (
          <img
            key={`${pedal}-${index}`}
            className="lp-marquee-pedal"
            src={`${import.meta.env.BASE_URL}pedals/${pedal}.svg`}
            alt=""
            width={120}
            height={150}
            loading="lazy"
            decoding="async"
          />
        ))}
      </div>
    </div>
  );
}
