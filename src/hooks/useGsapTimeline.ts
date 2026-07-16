import { useRef, type RefObject, type DependencyList } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { motionDurations, motionEase } from '@/lib/motion';

gsap.registerPlugin(useGSAP);

type TimelineBuilder = (tl: gsap.core.Timeline, ctx: { reduced: boolean }) => void;

/**
 * Scoped GSAP timeline with automatic revert-on-cleanup (React 19 safe) and
 * its own prefers-reduced-motion handling — CSS's
 * `@media (prefers-reduced-motion: reduce)` block (src/index.css) doesn't
 * apply to GSAP-driven properties, since GSAP bypasses `animation-duration`.
 *
 * No component uses this yet — this is infrastructure only. See
 * docs/design-system.md "Motion" for when to reach for GSAP vs. plain CSS.
 */
export function useGsapTimeline(
  scope: RefObject<HTMLElement | null>,
  build: TimelineBuilder,
  deps: DependencyList = []
) {
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        { reduced: '(prefers-reduced-motion: reduce)', full: '(prefers-reduced-motion: no-preference)' },
        (context) => {
          const reduced = !!(context.conditions as { reduced?: boolean } | undefined)?.reduced;
          const tl = gsap.timeline({
            defaults: { ease: motionEase.out, duration: reduced ? 0.01 : motionDurations.base },
          });
          tlRef.current = tl;
          build(tl, { reduced });
          return () => {
            tl.kill();
          };
        }
      );
      return () => mm.revert();
    },
    { scope, dependencies: [...deps] }
  );

  return tlRef;
}
