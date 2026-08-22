/**
 * The guide's table of contents, and the single source of truth for every
 * guide URL. It is consumed by the section pages, the hub's TOC, the sidebar
 * nav, scripts/prerender.mjs, the sitemap generator and the tests — so nothing
 * else in the codebase may hardcode a slug.
 *
 * `id` is the original in-page anchor from the pre-split guide. Those ids are
 * kept verbatim so old `#anchor` deep links still resolve, and so the
 * `guide_read` analytics dimension stays comparable across the restructure.
 *
 * `lastmod` is an explicit, reviewable date rather than the build timestamp.
 * A sitemap that claims every page changed on every deploy teaches Google to
 * ignore lastmod entirely; bump these by hand when the copy actually changes.
 */

export interface GuideShot {
  /** Path under public/, light variant. The `-dark` twin is derived. */
  src: string;
  /** Intrinsic pixel size, needed on the <img> to reserve space and kill CLS. */
  width: number;
  height: number;
  alt: string;
  caption: string;
}

export interface GuideFaq {
  q: string;
  a: string;
}

export interface GuideSection {
  /** Original in-page anchor id. Stable; do not rename. */
  id: string;
  /** URL segment under /guide/. Stable; renaming one needs a redirect. */
  slug: string;
  /** Sidebar text. */
  navLabel: string;
  /** On-page <h1>. */
  title: string;
  /** Full <title>. Keep at or under 60 characters. */
  metaTitle: string;
  /** Meta description. Keep between 110 and 160 characters. */
  metaDescription: string;
  /** One-line summary for the hub's table of contents. */
  blurb: string;
  /** ISO date, bumped by hand when this section's copy changes. */
  lastmod: string;
  /** Rendered visibly on the page, and mirrored into FAQPage JSON-LD. */
  faq?: GuideFaq[];
}

/** Standard full-bleed screenshot geometry from scripts/capture-guide-shots.mjs. */
export const SHOT_W = 2400;
export const SHOT_H = 1250;

export const GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    id: 'overview',
    slug: 'overview',
    navLabel: 'Overview',
    title: 'What GP200 Studio does',
    metaTitle: 'Overview: Editing a Valeton GP-200 — GP200 Studio',
    metaDescription:
      'GP200 Studio is a free, open-source browser editor and loop station for the Valeton GP-200. Edit presets and push them live over USB-MIDI.',
    blurb: 'What the app is, what it needs, and what it can do without a pedal plugged in.',
    lastmod: '2026-08-17',
    faq: [
      {
        q: 'Is GP200 Studio free?',
        a: 'Yes. It is free and open source under the GPL-3.0 licence. There is no account, no install and no backend — the code is on GitHub.',
      },
      {
        q: 'Do I need a GP-200 plugged in to use it?',
        a: 'No. Without a device you can still build and edit patches and import or export .prst files. Live sync and saving to the unit need a connected GP-200.',
      },
    ],
  },
  {
    id: 'editor',
    slug: 'pedalboard-editor',
    navLabel: 'The pedalboard editor',
    title: 'The pedalboard editor',
    metaTitle: 'The Pedalboard Editor — GP200 Studio',
    metaDescription:
      'Your GP-200 signal chain drawn as real stompboxes with patch cables. How the board wraps, scales to your window, and switches stage themes.',
    blurb: 'Your signal chain as physical pedals, with cables, a chain strip and stage lighting.',
    lastmod: '2026-08-18',
  },
  {
    id: 'pedals',
    slug: 'changing-effects',
    navLabel: 'Changing & managing pedals',
    title: 'Changing & managing pedals',
    metaTitle: 'Changing Effect Blocks — GP200 Studio',
    metaDescription:
      'Bypass, replace, retune and reorder the GP-200 effect blocks. All 305 effects in a searchable browser, scoped to each block’s module.',
    blurb: 'Bypass, swap, edit and reorder the effect blocks in the chain.',
    lastmod: '2026-08-17',
  },
  {
    id: 'deck',
    slug: 'control-deck',
    navLabel: 'The control deck',
    title: 'The control deck',
    metaTitle: 'The Control Deck: Volume, Pan & Tempo — GP200 Studio',
    metaDescription:
      'The patch cockpit: name and author, patch volume, pan and tempo, live treadle readouts, audio meters, the tuner and the session top bar.',
    blurb: 'Patch volume, pan, tempo, live treadle readouts, meters and the session top bar.',
    lastmod: '2026-08-17',
  },
  {
    id: 'drawers',
    slug: 'patch-settings',
    navLabel: 'Patch settings',
    title: 'Patch settings: FX loop, expression & footswitches',
    metaTitle: 'FX Loop, EXP Pedals & CTRL Footswitches — GP200 Studio',
    metaDescription:
      'Route the external FX loop anywhere in the chain, map expression pedals with heel and toe values, and bind the eight CTRL footswitches.',
    blurb: 'The FX loop, expression pedal mapping and the eight CTRL footswitch assignments.',
    lastmod: '2026-08-17',
  },
  {
    id: 'bulk',
    slug: 'bulk-apply',
    navLabel: 'Bulk apply',
    title: 'Bulk apply: one patch’s settings across many',
    metaTitle: 'Bulk Apply Footswitch Layouts to 256 Patches — GP200 Studio',
    metaDescription:
      'Copy one patch’s CTRL footswitch layout and patch volume into a bank range or all 256 patches at once, instead of setting each one by hand.',
    blurb: 'Stamp one patch’s footswitch layout and volume onto a bank range, or all 256 slots.',
    lastmod: '2026-08-17',
  },
  {
    id: 'looper',
    slug: 'loop-station',
    navLabel: 'The loop station',
    title: 'The loop station',
    metaTitle: 'The Multi-Layer Loop Station — GP200 Studio',
    metaDescription:
      'A multi-layer looper the GP-200 does not ship with: unlimited phase-locked takes over USB audio, driven hands-free from the pedal’s footswitches.',
    blurb: 'Unlimited phase-locked layers over USB audio, driven from your own footswitches.',
    lastmod: '2026-08-17',
    faq: [
      {
        q: 'Can GP200 Studio record loops?',
        a: 'Yes. It records the GP-200’s USB audio as a multi-layer loop station with unlimited phase-locked takes, which the pedal’s own single-track looper cannot do.',
      },
      {
        q: 'Can I control the looper without touching the laptop?',
        a: 'Yes. Click the action you want, stomp any GP-200 footswitch, and it is bound. Takeover mode stops that switch changing your sound while the loop station is open.',
      },
    ],
  },
  {
    id: 'drums',
    slug: 'drum-machine',
    navLabel: 'Drums',
    title: 'Drums',
    metaTitle: 'Browser Drums & GP-200 Drum Remote — GP200 Studio',
    metaDescription:
      'A step-sequenced browser drum machine with kits, grooves, swing and 4/4, 3/4, 2/4 and 6/8 time — plus a MIDI remote for the GP-200’s own drums.',
    blurb: 'A browser drum machine that needs no pedal, plus a remote for the GP-200’s own drums.',
    lastmod: '2026-08-18',
  },
  {
    id: 'remote',
    slug: 'midi-remote',
    navLabel: 'MIDI remote & device state',
    title: 'MIDI remote & device state',
    metaTitle: 'MIDI Remote & Device State Readout — GP200 Studio',
    metaDescription:
      'A virtual GP-200 front panel over MIDI CC: footswitches, bank and patch stepping, tempo and quick knobs, plus a read-only device state panel.',
    blurb: 'A virtual front panel over MIDI CC, and a readout of what the unit reported.',
    lastmod: '2026-08-17',
  },
  {
    id: 'patches',
    slug: 'managing-patches',
    navLabel: 'Managing patches',
    title: 'Managing patches',
    metaTitle: 'Managing All 256 Patches & ZIP Backup — GP200 Studio',
    metaDescription:
      'Browse, search, rename, open and export all 256 GP-200 slots, and back the whole device up to a single .zip file before you change anything.',
    blurb: 'All 256 slots in one searchable list, with per-slot actions and a full ZIP backup.',
    lastmod: '2026-08-17',
    faq: [
      {
        q: 'Can I back up all my GP-200 patches?',
        a: 'Yes. The patch manager bulk-exports the selected bank, or all 256 patches, to a single .zip file. Do this before running Bulk Apply.',
      },
    ],
  },
  {
    id: 'connect',
    slug: 'connect-gp-200',
    navLabel: 'Connecting your GP-200',
    title: 'Connecting your GP-200',
    metaTitle: 'Connect a Valeton GP-200 over USB-MIDI — GP200 Studio',
    metaDescription:
      'Connect a Valeton GP-200 over USB in Chrome or Edge: the firmware handshake, live two-way sync, the MIDI channel, and what to do if it is not found.',
    blurb: 'The USB handshake, the firmware check, and how live two-way sync behaves.',
    lastmod: '2026-08-21',
    faq: [
      {
        q: 'Which browsers work with the Valeton GP-200?',
        a: 'Chrome or Edge on any desktop OS, and Chrome on Android. Firefox and Safari do not implement Web MIDI, so they can edit and export files but cannot talk to the pedal.',
      },
      {
        q: 'Does it work on Linux?',
        a: 'Yes — anywhere Chrome or Edge runs, including Linux, which the official Valeton editor does not support at all.',
      },
      {
        q: 'Why can\'t Chrome see my GP-200 on Linux?',
        a: 'Two causes look identical from the browser, and in both the CONNECT message lists only "Midi Through Port-0". Either your browser is a Flatpak or Snap build, which gets /dev/snd but no /run/udev and so drops every USB device, or the ALSA sequencer bridge is not loaded. Fix the first with "flatpak override --user --filesystem=/run/udev:ro <app-id>" and a full browser restart; fix the second with "sudo modprobe snd-seq-midi".',
      },
      {
        q: 'Why does my Flatpak or Snap browser not see any USB MIDI device?',
        a: 'Chromium binds ALSA cards to sequencer clients through udev, and a sandboxed browser is given the /dev/snd device nodes but not /run/udev. Every card-backed port is dropped and only card-less ones like Midi Through survive. Run "flatpak override --user --filesystem=/run/udev:ro com.brave.Browser" with your own app id, then quit the browser completely and reopen it — closing the window is not enough. A natively installed Chrome or Chromium needs none of this.',
      },
    ],
  },
  {
    id: 'files',
    slug: 'prst-files',
    navLabel: 'Importing & exporting',
    title: 'Importing & exporting .prst files',
    metaTitle: 'Importing & Exporting .prst Files — GP200 Studio',
    metaDescription:
      'Import and export native GP-200 .prst preset files — the same format the official editor uses — with or without a device connected.',
    blurb: 'Native .prst import and export, the same files the official editor writes.',
    lastmod: '2026-08-17',
    faq: [
      {
        q: 'What preset file format does GP200 Studio use?',
        a: 'Native .prst files, byte-for-byte the same format the official Valeton editor reads and writes, so presets move between the two freely.',
      },
    ],
  },
  {
    id: 'requirements',
    slug: 'requirements',
    navLabel: 'Requirements & limits',
    title: 'Requirements, browser support & privacy',
    metaTitle: 'Requirements, Browser Support & Privacy — GP200 Studio',
    metaDescription:
      'What GP200 Studio needs to run, what works offline, which browsers support Web MIDI, and exactly what data does and does not leave your machine.',
    blurb: 'What it needs, what works offline, and what data never leaves your machine.',
    lastmod: '2026-08-21',
    faq: [
      {
        q: 'Do my presets get uploaded anywhere?',
        a: 'No. Everything runs inside the browser tab — there is no account and no server storing your patches. Only anonymous feature-usage analytics are recorded, and Global Privacy Control disables even those.',
      },
    ],
  },
];

export const GUIDE_BY_SLUG: ReadonlyMap<string, GuideSection> = new Map(
  GUIDE_SECTIONS.map((section) => [section.slug, section]),
);

/** Previous/next neighbours for a section, for the in-page pager. */
export function guideNeighbours(slug: string): {
  prev: GuideSection | null;
  next: GuideSection | null;
} {
  const index = GUIDE_SECTIONS.findIndex((section) => section.slug === slug);
  if (index === -1) return { prev: null, next: null };
  return {
    prev: index > 0 ? GUIDE_SECTIONS[index - 1] : null,
    next: index < GUIDE_SECTIONS.length - 1 ? GUIDE_SECTIONS[index + 1] : null,
  };
}

/** Every FAQ across the guide, in section order. Rendered on the hub page. */
export function allGuideFaqs(): GuideFaq[] {
  return GUIDE_SECTIONS.flatMap((section) => section.faq ?? []);
}
