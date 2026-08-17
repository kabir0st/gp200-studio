import { GuideChrome } from './GuideChrome';
import { SECTION_BODIES } from './sections';
import { GUIDE_BY_SLUG, guideNeighbours, type GuideSection as Section } from './manifest';

const PROSE =
  'space-y-3 text-base leading-relaxed text-text-secondary [&>p]:max-w-4xl [&>ul]:max-w-4xl [&>h3]:max-w-4xl';

function Breadcrumbs({ section }: { section: Section }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-2 m-0 p-0 list-none font-mono-display text-micro tracking-widest uppercase text-text-muted">
        <li>
          <a href="/" className="no-underline hover:text-text-primary">
            GP200 Studio
          </a>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <a href="/guide" className="no-underline hover:text-text-primary">
            Guide
          </a>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="text-text-secondary">
          {section.navLabel}
        </li>
      </ol>
    </nav>
  );
}

/** Previous/next pager. Also the internal linking that keeps the shorter
 *  sections reachable by crawlers from more than one place. */
function Pager({ slug }: { slug: string }) {
  const { prev, next } = guideNeighbours(slug);
  if (!prev && !next) return null;
  return (
    <nav
      aria-label="Guide pagination"
      className="mt-12 pt-6 border-t border-border-subtle grid gap-4 sm:grid-cols-2"
    >
      {prev ? (
        <a
          href={`/guide/${prev.slug}`}
          className="block rounded border border-border-subtle p-4 no-underline hover:bg-bg-hover transition-colors"
        >
          <span className="block font-mono-display text-micro tracking-widest uppercase text-text-muted mb-1">
            ← Previous
          </span>
          <span className="block text-text-primary font-bold">{prev.title}</span>
        </a>
      ) : (
        <span />
      )}
      {next && (
        <a
          href={`/guide/${next.slug}`}
          className="block rounded border border-border-subtle p-4 no-underline hover:bg-bg-hover transition-colors sm:text-right"
        >
          <span className="block font-mono-display text-micro tracking-widest uppercase text-text-muted mb-1">
            Next →
          </span>
          <span className="block text-text-primary font-bold">{next.title}</span>
        </a>
      )}
    </nav>
  );
}

/** The visible Q&A block. FAQPage JSON-LD mirrors exactly this markup —
 *  Google requires the answers to be on the page, not only in the schema. */
function Faq({ section }: { section: Section }) {
  if (!section.faq?.length) return null;
  return (
    <section className="mt-12" aria-labelledby="faq-heading">
      <h2
        id="faq-heading"
        className="font-mono-display text-xl font-bold tracking-wide text-text-primary mb-3"
      >
        Frequently asked questions
      </h2>
      <dl className="space-y-4 max-w-4xl m-0">
        {section.faq.map((item) => (
          <div key={item.q}>
            <dt className="font-bold text-text-primary">{item.q}</dt>
            <dd className="m-0 mt-1 text-base leading-relaxed text-text-secondary">{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function GuideSectionPage({ slug }: { slug: string }) {
  const section = GUIDE_BY_SLUG.get(slug);
  const Body = SECTION_BODIES[slug];
  if (!section || !Body) {
    throw new Error(`Unknown guide section: ${slug}`);
  }
  return (
    <GuideChrome activeSlug={slug}>
      <Breadcrumbs section={section} />
      {/* The anchor id is the pre-split guide's, kept so old #deep links land. */}
      <h1
        id={section.id}
        className="font-mono-display text-2xl font-bold tracking-wide text-text-primary mb-4 scroll-mt-24"
      >
        {section.title}
      </h1>
      <div className={PROSE}>
        <Body />
      </div>
      <Faq section={section} />
      <Pager slug={slug} />
    </GuideChrome>
  );
}
