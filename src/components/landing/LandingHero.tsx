import type { CSSProperties } from 'react';
import type { UseMidiDeviceReturn } from '@/hooks/useMidiDevice';
import { SLOT_MODULES } from '@/core/effectNames';
import { getBodySpec } from '@/components/board/boardPalette';
import { Logo } from '@/components/Logo';
import { AUTHOR, REPO } from '@/seo/site';
import { COFFEE_URL } from '@/components/Credits';
import { LandingConnect } from './LandingConnect';
import { LandingShot } from './LandingShot';
import { LandingCables } from './LandingCables';
import { LandingStack } from './LandingStack';
import { HERO } from './copy';

interface LandingHeroProps {
  midiDevice: UseMidiDeviceReturn;
  onOpenBlank: () => void;
  onOpenCurrent: () => void;
  loadError: string | null;
  onDismissError: () => void;
}

/**
 * The whole landing page is a dark stage (`.theme-dark`, set on the root in
 * Landing.tsx), so the hero inherits it rather than declaring it.
 *
 * It is built as a stage rather than a hero band: a half-stack standing at
 * each side, a deck under them, the editor sitting on that deck with patch
 * cables running into it. Nothing is boxed inside a centred container — the
 * cabinets run off both edges of the viewport, which is what puts the reader
 * on the stage instead of in front of a poster of one.
 *
 * Two refusals hold the look together:
 *
 * - No decorative gradients. Not on the headline, not behind it. Every
 *   gradient here belongs to an object — a cable's rubber sheath, a plug's
 *   chrome, a speaker cone catching the light — plus the marquee's edge mask,
 *   which is a mask rather than an ornament.
 * - No eyebrow pill over a centred headline on a flat field.
 *
 * The entrance animation is CSS keyframes, not GSAP: GSAP is dynamic-imported
 * and lands after first paint, so anything it hid here would flash visible
 * first. Everything below the fold is GSAP's — see useLandingMotion.
 */
export function LandingHero({
  midiDevice,
  onOpenBlank,
  onOpenCurrent,
  loadError,
  onDismissError,
}: LandingHeroProps) {
  return (
    <header className="lp-hero">
      <nav className="lp-nav" aria-label="Primary">
        <span className="lp-brand">
          <Logo size={38} />
          <span className="lp-brand-name">GP200 Studio</span>
        </span>
        <span className="lp-nav-links">
          <a href="/guide">Guide</a>
          <a href={REPO} target="_blank" rel="noopener noreferrer">GitHub</a>
          <span className="lp-nav-by">
            developed by{' '}
            <a href={AUTHOR.url} target="_blank" rel="noopener noreferrer">
              kabirtamari.com
            </a>
          </span>
          {/* Same URL the credits block uses, promoted to the top of the page:
              this is the only thing the project asks anyone for. */}
          <a
            className="lp-nav-coffee"
            href={COFFEE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            ☕ Buy me a coffee
          </a>
        </span>
      </nav>

      <div className="lp-stage">
        <LandingStack side="left" />

        <div className="lp-stage-copy">
          <div className="lp-chips lp-anim" aria-hidden="true">
            {SLOT_MODULES.map((mod) => {
              const spec = getBodySpec(mod);
              const vars = { '--body': spec.body, '--ink': spec.ink } as CSSProperties;
              return (
                <span key={mod} className="lp-chip" style={vars}>
                  {mod}
                </span>
              );
            })}
          </div>

          <h1 className="lp-h1 lp-anim">
            <span className="lp-h1-brand">{HERO.title}</span>
            <span className="lp-h1-line">{HERO.tagline}</span>
          </h1>

          <p className="lp-lede lp-anim">{HERO.lede}</p>

          <div className="lp-anim">
            <LandingConnect
              midiDevice={midiDevice}
              onOpenBlank={onOpenBlank}
              onOpenCurrent={onOpenCurrent}
              loadError={loadError}
              onDismissError={onDismissError}
            />
          </div>

          {/* A real anchor in the prerendered markup: this is the only crawlable
              edge from the home page into the guide's fourteen indexable URLs,
              so a crawler that runs no JavaScript still follows it. */}
          <a className="lp-guide-link lp-anim" href="/guide">
            Read the guide →
          </a>
        </div>

        <LandingStack side="right" />

        {/* the deck the stacks stand on, and the editor sits on */}
        <div className="lp-deck" aria-hidden="true" />
      </div>

      <div className="lp-cable-band" aria-hidden="true">
        <LandingCables />
      </div>

      <div className="lp-hero-shot lp-anim">
        <div className="lp-hero-frame" data-lp-hero-shot>
          <LandingShot
            name="02-editor-board"
            alt={HERO.shotAlt}
            priority
            sizes="(min-width: 1240px) 1180px, 100vw"
            className="lp-shot-img"
          />
        </div>
      </div>
    </header>
  );
}
