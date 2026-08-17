import { GuideChrome } from './GuideChrome';
import { A } from './prose';
import { GUIDE_SECTIONS, allGuideFaqs } from './manifest';

/**
 * /guide — the hub. Deliberately more than a table of contents: the visible
 * FAQ below is the page's real content, and it is what the FAQPage JSON-LD
 * mirrors (Google requires the answers to be on the page).
 */
export function GuideHub() {
  const faqs = allGuideFaqs();
  return (
    <GuideChrome activeSlug={null}>
      <h1 className="font-mono-display text-2xl font-bold tracking-wide text-text-primary mb-4">
        GP200 Studio guide
      </h1>
      <div className="space-y-3 text-base leading-relaxed text-text-secondary max-w-4xl">
        <p>
          Everything GP200 Studio can do with a Valeton GP-200, in thirteen
          sections. GP200 Studio is a free, open-source browser editor and
          multi-layer loop station for the pedal , no install, no account and no
          backend, with your presets never leaving your machine.
        </p>
        <p>
          If you are starting from nothing, read{' '}
          <A href="/guide/overview">the overview</A>, then{' '}
          <A href="/guide/connect-gp-200">connecting your GP-200</A>. If you came
          here for the looper the pedal doesn't have, go straight to{' '}
          <A href="/guide/loop-station">the loop station</A>.
        </p>
      </div>

      <h2 className="font-mono-display text-xl font-bold tracking-wide text-text-primary mt-10 mb-3">
        All sections
      </h2>
      <ol className="grid gap-3 sm:grid-cols-2 list-none m-0 p-0">
        {GUIDE_SECTIONS.map((section, index) => (
          <li key={section.slug}>
            <a
              href={`/guide/${section.slug}`}
              className="block h-full rounded border border-border-subtle p-4 no-underline hover:bg-bg-hover transition-colors"
            >
              <span className="block font-mono-display text-micro tracking-widest uppercase text-text-muted mb-1">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="block text-text-primary font-bold mb-1">{section.title}</span>
              <span className="block text-sm leading-snug text-text-secondary">
                {section.blurb}
              </span>
            </a>
          </li>
        ))}
      </ol>

      <section className="mt-12" aria-labelledby="faq-heading">
        <h2
          id="faq-heading"
          className="font-mono-display text-xl font-bold tracking-wide text-text-primary mb-3"
        >
          Frequently asked questions
        </h2>
        <dl className="space-y-5 max-w-4xl m-0">
          {faqs.map((item) => (
            <div key={item.q}>
              <dt className="font-bold text-text-primary">{item.q}</dt>
              <dd className="m-0 mt-1 text-base leading-relaxed text-text-secondary">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </GuideChrome>
  );
}
