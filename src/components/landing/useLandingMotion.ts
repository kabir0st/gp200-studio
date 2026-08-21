import { useEffect, type RefObject } from 'react';
import { motionDurations, motionEase, prefersReducedMotion } from '@/lib/motion';

/**
 * Scroll motion for the landing page.
 *
 * ── Why gsap is behind a dynamic import ──────────────────────────────────
 * src/prerender/entry-server.tsx renders <Landing> under bare Node with no
 * DOM, and tests/unit/prerenderSafety.test.ts enforces that its whole static
 * import closure stays free of browser globals. gsap reads `window.matchMedia`
 * as soon as it is evaluated, so it may only be reached through `import()`
 * inside an effect — never at module scope, and never via
 * src/hooks/useGsapTimeline.ts or useFlipReorder.ts, both of which call
 * gsap.registerPlugin() while loading.
 *
 * ── Why nothing here owns the "hidden" state ─────────────────────────────
 * That import resolves after first paint, so anything gsap hid would flash
 * visible first. Instead the pre-paint script in index.html stamps
 * `data-anim="on"` on <html> (only when motion is welcome), landing.css hides
 * `.lp-reveal` behind exactly that attribute, and this hook takes over from
 * there. The same script arms a timeout that un-hides everything if the bundle
 * never boots; a successful start clears it, and every failure path drops the
 * attribute. Net effect: the page is readable with JavaScript off, with a dead
 * bundle, and under reduced motion — and animates otherwise.
 *
 * The hero's own entrance is CSS keyframes (landing.css / `lp-rise`) for the
 * same reason: it has to be right on the very first frame.
 */

interface AnimWindow extends Window {
  __gp200AnimFallback?: ReturnType<typeof setTimeout>;
}

/** Stop the pre-paint safety timer; the animation is now in charge. */
function disarmFallback() {
  const w = window as AnimWindow;
  if (w.__gp200AnimFallback !== undefined) {
    clearTimeout(w.__gp200AnimFallback);
    w.__gp200AnimFallback = undefined;
  }
}

/** Give up on animating and show everything: the CSS gate is the only thing
 *  holding `.lp-reveal` down until gsap has set an inline opacity. */
function openGate() {
  disarmFallback();
  document.documentElement.removeAttribute('data-anim');
}

export function useLandingMotion(scope: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = scope.current;
    if (!root) return;

    // CSS's `prefers-reduced-motion` block (src/index.css) cannot reach
    // gsap-driven properties, so the gate is checked here by hand.
    if (prefersReducedMotion()) {
      openGate();
      return;
    }

    let cancelled = false;
    let ctx: gsap.Context | undefined;

    void (async () => {
      const [gsapMod, stMod] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (cancelled) return;

      const { gsap } = gsapMod;
      const { ScrollTrigger } = stMod;
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        const q = <T extends Element>(sel: string) => Array.from(root.querySelectorAll<T>(sel));

        /* ── Section reveals ──────────────────────────────────────────────
         * `once` because this is an entrance, not a state: re-hiding a
         * section the reader has already passed is the kind of motion that
         * makes a long page feel busy. Elements already on screen when the
         * batch is created fire onEnter on the first refresh, which is what
         * covers the fold. */
        const reveals = q<HTMLElement>('.lp-reveal');
        gsap.set(reveals, { opacity: 0, y: 20 });
        ScrollTrigger.batch(reveals, {
          start: 'top 85%',
          once: true,
          onEnter: (batch) =>
            gsap.to(batch, {
              opacity: 1,
              y: 0,
              duration: motionDurations.slow * 2,
              ease: motionEase.emphasized,
              stagger: 0.08,
              overwrite: true,
              // Hand `transform` back to CSS once the entrance is over. gsap
              // leaves `transform: translate(0px, 0px)` inline, and an inline
              // transform beats any stylesheet rule — so `.lp-card`, which is
              // both a reveal target and a hover target, would refuse to grow
              // on hover for the rest of the session.
              //
              // `transform` ONLY. Clearing opacity as well would re-expose
              // `:root[data-anim='on'] .lp-reveal { opacity: 0 }` and make the
              // section vanish the instant it finished appearing.
              onComplete: () => gsap.set(batch, { clearProps: 'transform' }),
            }),
        });

        /* ── The hero frame tilts back as it leaves ───────────────────── */
        const heroShot = root.querySelector<HTMLElement>('[data-lp-hero-shot]');
        const hero = root.querySelector<HTMLElement>('.lp-hero');
        if (heroShot && hero) {
          gsap.to(heroShot, {
            rotateX: 7,
            yPercent: 5,
            scale: 0.95,
            opacity: 0.55,
            ease: 'none',
            scrollTrigger: {
              trigger: hero,
              start: 'bottom bottom',
              end: 'bottom top',
              scrub: 0.6,
            },
          });
        }

        /* ── Screenshots drift against the scroll ─────────────────────── */
        for (const shot of q<HTMLElement>('[data-lp-parallax]')) {
          gsap.fromTo(
            shot,
            { yPercent: 5 },
            {
              yPercent: -5,
              ease: 'none',
              scrollTrigger: {
                trigger: shot,
                start: 'top bottom',
                end: 'bottom top',
                scrub: 0.6,
              },
            },
          );
        }

        /* ── Counters ─────────────────────────────────────────────────────
         * The markup already holds the final figure, so this only ever
         * rewrites a number the reader would otherwise have seen instantly. */
        for (const el of q<HTMLElement>('[data-lp-count]')) {
          const target = Number(el.dataset.lpCount ?? '0');
          if (!Number.isFinite(target) || target === 0) continue;
          const proxy = { v: 0 };
          gsap.to(proxy, {
            v: target,
            duration: 1.4,
            ease: motionEase.out,
            snap: { v: 1 },
            onUpdate: () => {
              el.textContent = String(Math.round(proxy.v));
            },
            scrollTrigger: { trigger: el, start: 'top 90%', once: true },
          });
        }

        /* ── The stacks push air ──────────────────────────────────────────
         * One bar at 120 BPM, which is the tempo the drum machine defaults
         * to, so the cabinets are moving to the same count the app counts in.
         * Beats 1 and 3 are the kick — a deep cone excursion and a bump
         * through the cabinet itself; 2 and 4 are lighter. `elastic` on the
         * way back is what makes it read as a cone settling rather than a
         * shape being scaled.
         *
         * This is the one tween on the page that never ends, so it is paused
         * whenever the stage is off screen: an infinite timeline ticking in a
         * background tab is a battery cost with nobody watching it. */
        const cones = q<SVGGElement>('[data-lp-cone]');
        const cabs = q<SVGElement>('[data-lp-cab]');
        const jewels = q<SVGElement>('[data-lp-jewel]');
        if (cones.length) {
          const bar = gsap.timeline({ repeat: -1 });
          const BEAT = 0.5;
          for (let beat = 0; beat < 4; beat += 1) {
            const at = beat * BEAT;
            const kick = beat % 2 === 0;
            bar
              .to(cones, {
                scale: kick ? 1.055 : 1.022,
                duration: 0.055,
                ease: 'power3.out',
              }, at)
              .to(cones, {
                scale: 1,
                duration: kick ? 0.42 : 0.3,
                ease: 'elastic.out(1, 0.42)',
              }, at + 0.055);
            if (kick) {
              bar
                .to(cabs, { y: 2, duration: 0.05, ease: 'power3.out' }, at)
                .to(cabs, { y: 0, duration: 0.38, ease: 'elastic.out(1, 0.5)' }, at + 0.05)
                .to(jewels, { opacity: 1, duration: 0.05 }, at)
                .to(jewels, { opacity: 0.62, duration: 0.42, ease: 'sine.out' }, at + 0.05);
            }
          }
          const stage = root.querySelector<HTMLElement>('.lp-stage');
          if (stage) {
            ScrollTrigger.create({
              trigger: stage,
              start: 'top bottom',
              end: 'bottom top',
              onToggle: (self) => (self.isActive ? bar.play() : bar.pause()),
            });
          }
        }

        /* ── Pedal rail ───────────────────────────────────────────────────
         * The track holds two copies of the list, so -50% lands the second
         * copy exactly where the first started and the loop is invisible.
         * Paused off-screen: an endless tween is the one thing on this page
         * that would otherwise run forever in a background tab. */
        const marquee = root.querySelector<HTMLElement>('[data-lp-marquee]');
        if (marquee) {
          const drift = gsap.to(marquee, {
            xPercent: -50,
            duration: 48,
            ease: 'none',
            repeat: -1,
          });
          ScrollTrigger.create({
            trigger: marquee,
            start: 'top bottom',
            end: 'bottom top',
            onToggle: (self) => (self.isActive ? drift.play() : drift.pause()),
          });
        }

        /* ── Sticky bar ───────────────────────────────────────────────────
         * Visible in the middle of the page and nowhere else: it appears once
         * the hero's CTA has scrolled away, and disappears again as the
         * footer arrives. The second half matters — the bar is pinned over
         * the bottom of the viewport, and at the end of the page that is
         * exactly where the credits and their links sit. The footer carries
         * its own button anyway, so the bar has nothing left to offer there. */
        const sticky = root.querySelector<HTMLElement>('[data-lp-sticky]');
        const cta = root.querySelector<HTMLElement>('[data-lp-cta]');
        const footer = root.querySelector<HTMLElement>('.lp-footer');
        if (sticky && cta) {
          let pastHero = false;
          let atFooter = false;
          gsap.set(sticky, { autoAlpha: 0, y: 14 });
          const apply = () => {
            const show = pastHero && !atFooter;
            gsap.to(sticky, {
              autoAlpha: show ? 1 : 0,
              y: show ? 0 : 14,
              duration: show ? motionDurations.slow : motionDurations.base,
              ease: motionEase.out,
              overwrite: true,
            });
          };
          ScrollTrigger.create({
            trigger: cta,
            start: 'bottom top+=8',
            onEnter: () => { pastHero = true; apply(); },
            onLeaveBack: () => { pastHero = false; apply(); },
          });
          if (footer) {
            ScrollTrigger.create({
              trigger: footer,
              start: 'top bottom-=90',
              onEnter: () => { atFooter = true; apply(); },
              onLeaveBack: () => { atFooter = false; apply(); },
            });
          }
        }

        // Screenshots carry intrinsic width/height so the layout is reserved
        // before they load, but fonts and the marquee SVGs still settle after
        // the first measure. One refresh at load costs nothing and stops every
        // trigger further down the page from being a viewport out of date.
        const onLoad = () => ScrollTrigger.refresh();
        window.addEventListener('load', onLoad);
        return () => window.removeEventListener('load', onLoad);
      }, root);

      disarmFallback();
    })().catch(openGate);

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, [scope]);
}
