import { GuideChrome } from './GuideChrome';
import { GUIDE_SECTIONS } from './manifest';

/**
 * Source for dist/404.html, which Workers Assets serves (with a real 404
 * status) for any unmatched path. It replaces the old SPA fallback, which
 * answered every typo with 200 + the landing page — a soft 404, and a way for
 * junk URLs to enter the index.
 *
 * The noindex robots tag is applied by scripts/prerender.mjs, not here.
 */
export function NotFound() {
  return (
    <GuideChrome activeSlug={null}>
      <h1 className="font-mono-display text-2xl font-bold tracking-wide text-text-primary mb-4">
        Page not found
      </h1>
      <div className="space-y-3 text-base leading-relaxed text-text-secondary max-w-4xl">
        <p>
          There's nothing at this address. It may have moved when the guide was
          split into separate pages, or the link may simply be wrong.
        </p>
        <p>
          <a href="/" className="underline text-text-secondary hover:text-accent">
            Open the editor
          </a>{' '}
          or{' '}
          <a href="/guide" className="underline text-text-secondary hover:text-accent">
            start at the top of the guide
          </a>
          .
        </p>
      </div>

      <h2 className="font-mono-display text-xl font-bold tracking-wide text-text-primary mt-10 mb-3">
        Guide sections
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 list-none m-0 p-0">
        {GUIDE_SECTIONS.map((section) => (
          <li key={section.slug}>
            <a
              href={`/guide/${section.slug}`}
              className="text-text-secondary underline hover:text-accent"
            >
              {section.title}
            </a>
          </li>
        ))}
      </ul>
    </GuideChrome>
  );
}
