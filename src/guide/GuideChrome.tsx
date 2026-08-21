import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { Credits } from '@/components/Credits';
import { GUIDE_SECTIONS } from './manifest';

const CREDITS_CLASS =
  'font-mono-display text-label text-text-muted tracking-wide flex flex-col items-start gap-1 [&_.credits-links]:flex [&_.credits-links]:flex-wrap [&_.credits-links]:gap-4 [&_.credits-links]:mt-1 [&_a]:text-text-secondary [&_a]:underline [&_a:hover]:text-accent [&_.credits-coffee]:order-first [&_.credits-coffee]:mb-3 [&_.credits-coffee]:rounded-full [&_.credits-coffee]:border [&_.credits-coffee]:border-accent [&_.credits-coffee]:px-4 [&_.credits-coffee]:py-2 [&_.credits-coffee]:text-[12px] [&_.credits-coffee]:font-bold [&_.credits-coffee]:!text-accent [&_.credits-coffee]:!no-underline';

/**
 * Header, sidebar and footer shared by /guide and every /guide/<slug> page.
 *
 * This renders under renderToStaticMarkup with no React on the client, so
 * everything here is plain markup and real <a href> links — no state, no
 * scrollspy, no event handlers. The sidebar's "current page" highlight is
 * decided at prerender time from `activeSlug`, which is more accurate than the
 * IntersectionObserver scrollspy it replaces and costs nothing to ship.
 */
export function GuideChrome({
  activeSlug,
  children,
}: {
  /** null on the /guide hub itself. */
  activeSlug: string | null;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <header className="sticky top-0 z-20 bg-bg-surface/95 backdrop-blur border-b border-border-subtle">
        <div className="px-6 py-3 flex items-center gap-3">
          <a href="/" aria-label="GP200 Studio home" className="flex items-center">
            <Logo size={36} />
          </a>
          <p className="font-mono-display text-base font-bold tracking-wide flex-1 m-0">
            <a href="/guide" className="no-underline text-text-primary">
              GP200 Studio: Guide
            </a>
          </p>
          <a
            href="/"
            className="font-mono-display text-label tracking-wide px-3 py-1.5 rounded border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors no-underline"
          >
            ← Open the app
          </a>
        </div>
      </header>

      <div className="flex items-start">
        <nav
          aria-label="Guide sections"
          className="hidden lg:block w-60 shrink-0 sticky top-[57px] self-start max-h-[calc(100vh-57px)] overflow-y-auto border-r border-border-subtle px-4 py-6"
        >
          <p className="font-mono-display text-micro font-bold tracking-widest uppercase text-text-muted px-3 mb-2">
            <a href="/guide" className="no-underline text-text-muted hover:text-text-primary">
              All sections
            </a>
          </p>
          <ul className="space-y-0.5">
            {GUIDE_SECTIONS.map((section) => {
              const active = section.slug === activeSlug;
              const activeClass = active
                ? 'text-text-primary bg-bg-hover font-bold'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover';
              return (
                <li key={section.slug}>
                  <a
                    href={`/guide/${section.slug}`}
                    aria-current={active ? 'page' : undefined}
                    className={`block px-3 py-1.5 rounded text-sm leading-snug transition-colors no-underline ${activeClass}`}
                  >
                    {section.navLabel}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="flex-1 min-w-0 px-6 sm:px-10 py-9 max-w-[1600px]">
          {children}

          <footer className="mt-14 pt-6 border-t border-border-subtle flex flex-col items-start gap-3">
            <a
              href="/"
              className="font-mono-display text-label tracking-wide text-text-secondary underline hover:text-accent"
            >
              ← Back to the app
            </a>
            <Credits className={CREDITS_CLASS} />
          </footer>
        </main>
      </div>
    </div>
  );
}
