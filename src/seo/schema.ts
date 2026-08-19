import { GUIDE_SECTIONS, allGuideFaqs, type GuideFaq, type GuideSection } from '@/guide/manifest';
import {
  APP_DESCRIPTION,
  APP_FEATURES,
  AUTHOR,
  ID,
  LICENSE,
  OG_IMAGE,
  ORIGIN,
  REPO,
  SITE_NAME,
  abs,
} from './site';

/**
 * JSON-LD builders. Every page emits one `@graph`, and the nodes reference
 * each other by `@id` rather than repeating themselves — so the Person node
 * that names Kabir Tamari as author is defined once on the home page and
 * merely referenced from all fourteen guide pages.
 *
 * Deliberately absent: aggregateRating and review. There are no ratings to
 * report, and inventing them is a manual-action risk, not a shortcut.
 */

type Node = Record<string, unknown>;

const personRef = { '@id': ID.author };
const appRef = { '@id': ID.app };
const websiteRef = { '@id': ID.website };

export function personNode(): Node {
  return {
    '@type': 'Person',
    '@id': ID.author,
    name: AUTHOR.name,
    url: AUTHOR.url,
    sameAs: [...AUTHOR.sameAs],
  };
}

export function websiteNode(): Node {
  return {
    '@type': 'WebSite',
    '@id': ID.website,
    url: `${ORIGIN}/`,
    name: SITE_NAME,
    inLanguage: 'en',
    publisher: personRef,
  };
}

export function appNode(): Node {
  return {
    '@type': ['SoftwareApplication', 'WebApplication'],
    '@id': ID.app,
    name: SITE_NAME,
    url: `${ORIGIN}/`,
    description: APP_DESCRIPTION,
    author: personRef,
    creator: personRef,
    applicationCategory: 'MultimediaApplication',
    applicationSubCategory: 'Music Production Software',
    operatingSystem: 'Windows, macOS, Linux, ChromeOS, Android',
    browserRequirements:
      'Requires a Web MIDI-capable browser (Chrome or Edge) for live device features.',
    softwareRequirements:
      'A Valeton GP-200 connected over USB for live sync; offline editing needs no device.',
    isAccessibleForFree: true,
    license: LICENSE,
    codeRepository: REPO,
    sameAs: [REPO],
    inLanguage: 'en',
    image: OG_IMAGE,
    screenshot: [abs('/guide/02-editor-board.png'), abs('/guide/08-deck-loop.png')],
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: [...APP_FEATURES],
  };
}

export function faqNode(faqs: readonly GuideFaq[], id: string): Node {
  return {
    '@type': 'FAQPage',
    '@id': id,
    mainEntity: faqs.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

export function breadcrumbNode(trail: { name: string; path?: string }[]): Node {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      // The final crumb is the current page and carries no `item`, per
      // Google's breadcrumb guidance.
      ...(crumb.path ? { item: abs(crumb.path) } : {}),
    })),
  };
}

/** `/` — the app itself. */
export function homeGraph(): Node[] {
  return [
    personNode(),
    websiteNode(),
    appNode(),
    {
      '@type': 'WebPage',
      '@id': `${ORIGIN}/#webpage`,
      url: `${ORIGIN}/`,
      isPartOf: websiteRef,
      about: appRef,
      primaryImageOfPage: OG_IMAGE,
      inLanguage: 'en',
    },
  ];
}

/** `/guide` — the hub, carrying every section's FAQ. */
export function guideHubGraph(): Node[] {
  return [
    {
      '@type': 'CollectionPage',
      '@id': abs('/guide') + '#webpage',
      url: abs('/guide'),
      name: 'GP200 Studio guide',
      isPartOf: websiteRef,
      about: appRef,
      inLanguage: 'en',
      hasPart: GUIDE_SECTIONS.map((section) => ({
        '@type': 'TechArticle',
        '@id': `${abs(`/guide/${section.slug}`)}#article`,
        headline: section.title,
        url: abs(`/guide/${section.slug}`),
      })),
    },
    breadcrumbNode([{ name: SITE_NAME, path: '/' }, { name: 'Guide' }]),
    faqNode(allGuideFaqs(), abs('/guide') + '#faq'),
  ];
}

/** `/guide/<slug>` — one section. */
export function guideSectionGraph(section: GuideSection): Node[] {
  const url = abs(`/guide/${section.slug}`);
  const nodes: Node[] = [
    {
      '@type': 'TechArticle',
      '@id': `${url}#article`,
      headline: section.title,
      description: section.metaDescription,
      url,
      ...(section.ogImage ? { image: abs(section.ogImage) } : {}),
      author: personRef,
      publisher: personRef,
      dateModified: section.lastmod,
      about: appRef,
      isPartOf: websiteRef,
      inLanguage: 'en',
      proficiencyLevel: 'Beginner',
    },
    breadcrumbNode([
      { name: SITE_NAME, path: '/' },
      { name: 'Guide', path: '/guide' },
      { name: section.navLabel },
    ]),
  ];
  if (section.faq?.length) {
    nodes.push(faqNode(section.faq, `${url}#faq`));
  }
  return nodes;
}
