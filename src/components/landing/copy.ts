/**
 * Every word on the landing page, in one file.
 *
 * The page is prerendered (src/prerender/entry-server.tsx), so this text is
 * also the home page's crawlable body copy — the only prose on `/`. It is
 * lifted from the three places the product already describes itself, rather
 * than written fresh, so the pitch stays identical everywhere:
 *   - README.md              the long-form story
 *   - src/seo/site.ts        APP_FEATURES / APP_DESCRIPTION (also the JSON-LD)
 *   - src/guide/manifest.ts  the FAQ bank (also the guide hub's FAQPage)
 *
 * Keep this module free of JSX and of browser globals: it sits in the SSR
 * import closure that tests/unit/prerenderSafety.test.ts guards.
 */

export const HERO = {
  title: 'GP200 Studio',
  tagline: 'Your Valeton GP-200, on a big screen.',
  lede:
    'Build patches on a pedalboard you can actually see, manage all 256 of them, and stack loops over your own playing. It runs in your browser, so there is nothing to install and nothing to sign up for.',
  shotAlt:
    'The GP200 Studio pedalboard editor: a guitar signal chain drawn as physical stompboxes, wired together with patch cables.',
} as const;

/**
 * The rating plate, the way a piece of gear carries one: what the thing is,
 * in rows, rather than an adjective. It replaces the eyebrow pill the hero
 * used to open with — every fact it states is checkable, and between them they
 * answer "free?", "will it run here?" and "how big is this?" before the reader
 * has to ask.
 */
export const SPEC: readonly { key: string; value: string }[] = [
  { key: 'Blocks', value: '11' },
  { key: 'Effects', value: '305' },
  { key: 'Patches', value: '256' },
  { key: 'Link', value: 'USB-MIDI' },
  { key: 'Browser', value: 'Chrome / Edge' },
  { key: 'Licence', value: 'GPL-3.0' },
  { key: 'Price', value: 'Free' },
] as const;

export interface StorySection {
  /** Two-digit index, rendered as the section marker. */
  part: string;
  title: string;
  /** Lead paragraph; the sentence that has to land on its own. */
  lede: string;
  /** Supporting paragraph. */
  body: string;
  /** Short mono bullets under the prose. */
  points: readonly string[];
  /** Stems under public/guide/, without the `-dark` twin or the size suffix. */
  shots: readonly { name: string; alt: string }[];
  /**
   * The guide section this story block is the summary of.
   *
   * The landing page linked to /guide and nothing below it, so all thirteen
   * section URLs hung off a single hop from the strongest page on the site.
   * Each block already IS the short version of one section, so the deep link is
   * editorial rather than bolted on.
   */
  guide: { slug: string; label: string };
}

/** The three things worth scrolling for, in the order the README makes them. */
export const STORY: readonly StorySection[] = [
  {
    part: '01',
    title: 'Every block is a pedal',
    lede: 'Your whole chain, laid out like a board. Drag to reorder, turn a knob, and you hear it on the pedal straight away.',
    body: 'All 305 effects are matched to the real amps and stompboxes they model, so “MESS4 LD 3” reads as a Mesa/Boogie Mark IV instead of a code you have to look up.',
    points: [
      'Eleven blocks: PRE WAH DST AMP NR CAB EQ MOD DLY RVB VOL',
      'Browse effects by category, with the gear each one models',
      'Drag the FX loop send and return anywhere in the chain',
    ],
    shots: [
      {
        name: '03-effect-picker',
        alt: 'The effect browser open on the high-gain amp category, each effect showing the real amplifier it models.',
      },
    ],
    guide: { slug: 'pedalboard-editor', label: 'More on the pedalboard editor' },
  },
  {
    part: '02',
    title: 'A loop station the pedal doesn’t have',
    lede: 'The GP-200 records one loop. This records as many as you like.',
    body: 'Your first take sets the length, and every take after it locks to that timing. Best part: teach it your footswitches once and you never touch the laptop again while you play.',
    points: [
      'Unlimited takes over the pedal’s own USB audio',
      'MIDI-learn any footswitch to record, stop or add a take',
      'Loop-grid lock, fixed bar counts, note trigger and latency trim',
    ],
    shots: [
      {
        name: '08-deck-loop',
        alt: 'The multi-layer loop station with two recorded takes, each drawn as a waveform with its own controls.',
      },
    ],
    guide: { slug: 'loop-station', label: 'More on the loop station' },
  },
  {
    part: '03',
    title: 'Set your footswitches up once',
    lede: 'Bind the CTRL footswitches to any combination of blocks, and map an expression pedal to any knob with its own heel and toe values.',
    body: 'Then stamp that layout across a bank, or across all 256 patches, with Bulk Apply. It is the fix for the “I set this up 40 times by hand” problem.',
    points: [
      'Eight CTRL footswitches, any combination of blocks each',
      'EXP 1 (modes A and B) and EXP 2, mapped per patch',
      'Bulk Apply across a bank range or the whole device',
    ],
    shots: [
      {
        name: '07-deck-ctrl',
        alt: 'The CTRL footswitch panel, with each switch bound to a set of effect blocks.',
      },
      {
        name: '06-deck-exp',
        alt: 'The expression pedal panel, assigning a treadle to a single knob with heel and toe values.',
      },
    ],
    guide: { slug: 'patch-settings', label: 'More on footswitches and expression pedals' },
  },
] as const;

export interface Stat {
  value: number;
  /** Rendered after the number; the counter animates the number only. */
  suffix?: string;
  label: string;
}

export const STATS: readonly Stat[] = [
  { value: 305, label: 'effects modelled' },
  { value: 256, label: 'patches on the unit' },
  { value: 279, label: 'pedal artworks drawn' },
  { value: 0, label: 'servers involved' },
] as const;

export interface Feature {
  title: string;
  body: string;
}

/** Six cards. The first five track APP_FEATURES in src/seo/site.ts (which is
 *  also the SoftwareApplication featureList), rewritten for a reader rather
 *  than a crawler; the sixth is the drum machine, which the schema omits. */
export const FEATURES: readonly Feature[] = [
  {
    title: 'Visual pedalboard editor',
    body: 'Drag to reorder, tweak every knob, and see the whole signal chain at once instead of through a four-inch screen.',
  },
  {
    title: 'Live USB-MIDI sync',
    body: 'Every change streams to the pedal over SysEx the moment you make it. No apply step, no save-and-reload.',
  },
  {
    title: 'Multi-layer loop station',
    body: 'Stack unlimited takes over the GP-200’s USB audio, driven entirely from the footswitches you already have.',
  },
  {
    title: 'Practice drum machine',
    body: 'Kits, grooves, swing and odd time signatures, running in the browser next to your loops. It keeps playing when you close the drawer.',
  },
  {
    title: 'All 256 patches, in one list',
    body: 'Search, activate, rename and reorder every slot on the device, or back the whole unit up as a single zip.',
  },
  {
    title: 'Import & export .prst',
    body: 'Native Valeton preset files in and out, one at a time or in bulk, so your patches are yours to keep.',
  },
] as const;

/** The section that answers “why not just use the official editor”. */
export const WORKS = {
  part: '04',
  title: 'Works where the official editor doesn’t',
  lede: 'The GP-200 sounds great. Setting it up does not. The official editor skips Linux entirely, and building a patch on a four-inch screen with two footswitches takes longer than it should.',
  body: 'Plug the pedal into a laptop, a tablet or an Android phone with the USB cable you already own, open a browser tab, and everything is in front of you at once.',
  points: [
    'Linux, macOS, Windows, ChromeOS and Android',
    'Chrome or Edge for live device features (Web MIDI)',
    'Works offline for editing and .prst files, with no pedal attached',
    'Your presets stay with you: no account, no upload, no server',
  ],
  photoAlt: 'A Valeton GP-200 multi-effects floor unit, out of its box.',
} as const;

/**
 * Which of the guide's FAQs to surface here, keyed by question text rather
 * than by index so reordering src/guide/manifest.ts cannot silently swap them.
 * A question that no longer exists is dropped, not rendered blank.
 */
export const FAQ_PICKS: readonly string[] = [
  'Is GP200 Studio free?',
  'Do I need a GP-200 plugged in to use it?',
  'Can GP200 Studio record loops?',
  'Which browsers work with the Valeton GP-200?',
  'Does it work on Linux?',
  'Do my presets get uploaded anywhere?',
] as const;

/**
 * Decorative rail of pedal artwork, hand-picked from the 279 SVGs in
 * public/pedals/. Hardcoded rather than read from pedalManifest.ts: this is an
 * art-direction choice, and it keeps the landing page's import closure small
 * (see the SSR note at the top of this file).
 */
export const MARQUEE_PEDALS: readonly string[] = [
  'ac-boost',
  '999-echo',
  'a-chorus',
  'ampg-2',
  'ambience-1',
  'analog',
  'arena',
  'b-boost',
  'ac-pre-2',
  'adm-2',
  '14-boost',
  'a-wah',
  'ac-dream',
  'amp-spring',
  'auto-swell',
  'ace',
] as const;

/**
 * The two half-stacks standing on the hero stage.
 *
 * Both are dressed as the amps they are: the GP-200 models a Marshall® JCM800
 * as "UK 800" and a Soldano® SLO100 as "Solo100", and the cabinets are painted
 * in each one's own livery — gold panel, white piping and salt-and-pepper
 * cloth for the first; a brushed steel faceplate and black cloth for the
 * second. What is written on the badge is the *Valeton* name, because that is
 * what the pedal itself calls the model; the real amp behind it is named in
 * AMP_MODELS below, the way EFFECT_DESCRIPTIONS names it in the app.
 */
export interface AmpLivery {
  /** The pedal's own display name for the model, silk-screened on the badge. */
  badge: string;
  /** Cabinet vinyl. */
  tolex: string;
  /** Cabinet edge and seams. */
  edge: string;
  /** Control-panel face and the ink on it. */
  panel: string;
  panelInk: string;
  /** Grille cloth: the two threads it is woven from. */
  clothWarp: string;
  clothWeft: string;
  /** Piping around the grille, and the metal corner protectors. */
  piping: string;
  corner: string;
}

export const AMP_STACKS: Record<'left' | 'right', AmpLivery> = {
  // Marshall® JCM800 livery: gold plexi panel, white piping, salt-and-pepper.
  left: {
    badge: 'UK 800',
    tolex: '#17150f',
    edge: '#4a4436',
    panel: '#c9a63f',
    panelInk: '#2a2118',
    clothWarp: '#171512',
    clothWeft: '#5d564a',
    piping: '#ded9cc',
    corner: '#b09246',
  },
  // Soldano® SLO100 livery: brushed steel faceplate, black cloth, chrome.
  right: {
    badge: 'SOLO100',
    tolex: '#131315',
    edge: '#3b3d42',
    panel: '#b4b8be',
    panelInk: '#191a1c',
    clothWarp: '#0f0f10',
    clothWeft: '#2f3136',
    piping: '#5f636a',
    corner: '#9aa0a8',
  },
};

/**
 * What the GP-200's amp models actually are.
 *
 * Every pair is taken from EFFECT_DESCRIPTIONS in src/core/effectDescriptions.ts
 * — the same table the effect picker reads — so this section cannot claim an
 * amp the app does not name. It is here because it is the single most
 * convincing thing about the editor: "MESS4 LD 3" is unreadable on the pedal's
 * own screen, and "Mesa/Boogie® Mark IV (Lead 3)" is not.
 */
export const AMP_MODELS: readonly { valeton: string; real: string }[] = [
  { valeton: 'UK 800', real: 'Marshall® JCM800' },
  { valeton: 'Solo100 LD', real: 'Soldano® SLO100 (Overdrive)' },
  { valeton: 'Dark Twin', real: "Fender® '65 Twin Reverb" },
  { valeton: 'Foxy 30TB', real: 'VOX® AC30HW (Drive)' },
  { valeton: 'Mess4 LD 3', real: 'Mesa/Boogie® Mark IV (Lead 3)' },
  { valeton: 'Mess DualM', real: 'Mesa/Boogie® Dual Rectifier® (Modern)' },
  { valeton: 'Bog RedM', real: 'Bogner® XTC red channel' },
  { valeton: 'Flagman+ 2', real: 'Friedman BE100 Brown Eye' },
  { valeton: 'Dizz VH+', real: 'Diezel® VH4 (Distortion)' },
  { valeton: 'EV 51', real: 'Peavey® 5150® (Lead)' },
  { valeton: 'Juice R100', real: 'Orange® Rockerverb 100' },
  { valeton: 'J-120 CL', real: 'Roland JC-120 Jazz Chorus' },
] as const;

/** Roughly how many amp models the pedal ships, beyond the twelve listed. */
export const AMP_MODELS_MORE = 'and about seventy more, cabinets included';
