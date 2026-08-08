import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/Logo';
import { Credits } from '@/components/Credits';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { track } from '@/core/analytics';
import { msBucket } from '@/core/analyticsEvents';

interface GuideProps {
  /** Return to whatever was showing before (Landing or the board). */
  onBack: () => void;
}

/** Sidebar nav entries: id matches each <Section id>. */
const NAV: { id: string; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'editor', label: 'The pedalboard editor' },
  { id: 'pedals', label: 'Changing & managing pedals' },
  { id: 'deck', label: 'The control deck' },
  { id: 'drawers', label: 'Deck drawers' },
  { id: 'patches', label: 'Managing patches' },
  { id: 'connect', label: 'Connecting your GP-200' },
  { id: 'files', label: 'Importing & exporting' },
  { id: 'requirements', label: 'Requirements & limits' },
];

interface ShotProps {
  src: string;
  alt: string;
  caption: string;
}

/** A screenshot figure, full-width within the content column. */
function Shot({ src, alt, caption }: ShotProps) {
  // Resolve root-relative `/guide/*` paths against the Vite base URL so the
  // images load under the app's subfolder deploy (kabirtamari.com/gp200studio/).
  const resolvedSrc = `${import.meta.env.BASE_URL}${src.replace(/^\//, '')}`;
  return (
    <Card className="p-2 mt-5">
      <figure className="m-0">
        <img
          src={resolvedSrc}
          alt={alt}
          loading="lazy"
          className="w-full h-auto rounded border border-border-subtle"
        />
        <figcaption className="font-mono-display text-caption text-text-muted tracking-wide mt-2 px-1">
          {caption}
        </figcaption>
      </figure>
    </Card>
  );
}

interface SectionProps {
  id: string;
  title: string;
  children: React.ReactNode;
}

function Section({ id, title, children }: SectionProps) {
  // Prose (p/ul/h3) is capped to a readable measure; figures (Card) are left
  // full-width so screenshots fill the wide content column.
  return (
    <section id={id} className="mt-12 scroll-mt-24 first:mt-0">
      <h2 className="font-mono-display text-xl font-bold tracking-wide text-text-primary mb-3">
        {title}
      </h2>
      <div className="space-y-3 text-base leading-relaxed text-text-secondary [&>p]:max-w-4xl [&>ul]:max-w-4xl [&>h3]:max-w-4xl">
        {children}
      </div>
    </section>
  );
}

/**
 * Full-page help/guide, a sibling of Landing (no router; App gates on a
 * `view` flag). Two-column: a sticky left nav (scrollspy) + a wide content
 * column with large screenshots. Built on Tailwind + shared primitives so it
 * doesn't depend on PedalBoard's static stylesheet import.
 */
export function Guide({ onBack }: GuideProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [activeId, setActiveId] = useState<string>(NAV[0].id);

  // Land keyboard focus at the top on open, and let Escape back out.
  useEffect(() => {
    headingRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onBack();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onBack]);

  // How far the reader actually got. The scrollspy below already computes the
  // section nearest the top, so reading depth is free: collect the distinct ids
  // it reports and emit one rollup on unmount rather than an event per section.
  // One object with a stable identity rather than two refs: the unmount handler
  // can then capture it once and read the mutated fields, instead of touching
  // `.current` after the component is gone.
  const readProgress = useRef({ seen: new Set<string>([NAV[0].id]), deepest: NAV[0].id });

  // Scrollspy: highlight the nav link for the section nearest the top.
  useEffect(() => {
    const sections = NAV.map((entry) => document.getElementById(entry.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = visible[0].target.id;
          setActiveId(id);
          readProgress.current.seen.add(id);
          readProgress.current.deepest = id;
        }
      },
      { rootMargin: '-72px 0px -60% 0px', threshold: 0 },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  // One guide_read per visit, on unmount. `deepest` is one of the nine fixed
  // NAV ids, so it stays a bounded dimension.
  useEffect(() => {
    const openedAt = Date.now();
    const progress = readProgress.current;
    return () => {
      track('guide_read', {
        sections_seen: progress.seen.size,
        deepest: progress.deepest,
        dwell_bucket: msBucket(Date.now() - openedAt),
      });
    };
  }, []);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <header className="sticky top-0 z-20 bg-bg-surface/95 backdrop-blur border-b border-border-subtle">
        <div className="px-6 py-3 flex items-center gap-3">
          <Logo size={36} />
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-mono-display text-base font-bold tracking-wide flex-1 focus:outline-none"
          >
            GP200 Studio: Guide
          </h1>
          <Button variant="secondary" size="sm" onClick={onBack}>
            ← Back
          </Button>
        </div>
      </header>

      <div className="flex items-start">
        {/* Left nav: fills the left gutter; sticky under the header */}
        <nav
          aria-label="Guide sections"
          className="hidden lg:block w-60 shrink-0 sticky top-[57px] self-start max-h-[calc(100vh-57px)] overflow-y-auto border-r border-border-subtle px-4 py-6"
        >
          <p className="font-mono-display text-micro font-bold tracking-widest uppercase text-text-muted px-3 mb-2">
            On this page
          </p>
          <ul className="space-y-0.5">
            {NAV.map((entry) => {
              const active = entry.id === activeId;
              const activeClass = active
                ? 'text-text-primary bg-bg-hover font-bold'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover';
              return (
                <li key={entry.id}>
                  <a
                    href={`#${entry.id}`}
                    aria-current={active ? 'true' : undefined}
                    className={`block px-3 py-1.5 rounded text-sm leading-snug transition-colors ${activeClass}`}
                  >
                    {entry.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Content: wide, large screenshots, no wasted centering */}
        <main className="flex-1 min-w-0 px-6 sm:px-10 py-9 max-w-[1600px]">
          <Section id="overview" title="Overview">
            <p>
              GP200 Studio is a browser-based editor and loop station for the
              Valeton GP-200 multi-effects floor unit. Load, build, and edit
              presets entirely in your browser, then push changes live to a
              connected GP-200 over USB-MIDI. It's free and open source
              (GPL-3.0); the code lives on{' '}
              <a
                href="https://github.com/kabir0st/gp200-studio"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-text-secondary hover:text-accent-amber"
              >
                GitHub
              </a>
              .
            </p>
            <Card className="p-4 mt-4 max-w-4xl">
              <p className="font-mono-display text-micro font-bold tracking-widest uppercase text-text-muted mb-1.5">
                Note
              </p>
              <p className="font-mono-display text-caption tracking-wide text-text-secondary m-0">
                Device features (live sync, patch management, saving to the unit)
                need a GP-200 connected over USB in{' '}
                <strong>Chrome or Edge</strong>. Web MIDI isn't available in
                Firefox or Safari. Offline, you can still edit patches and
                import/export files.
              </p>
            </Card>
            <Shot
              src="/guide/01-landing.png"
              alt="GP200 Studio landing screen with the connect button and the open-without-connecting link"
              caption="The landing screen: plug in your GP-200 and click the big button — or open without connecting to try the editor on a blank preset."
            />
          </Section>

          <Section id="editor" title="The pedalboard editor">
            <p>
              The editor lays your signal chain out as physical stompboxes across
              two rows, with patch cables showing the flow from input to output.
              The chain strip at the top is a compact overview of the whole chain;
              hovering a pedal (or clicking its <strong>i</strong>) shows its
              details in the info bar. The rows are visual only; the real order is
              the chain order shown in the strip.
            </p>
            <Shot
              src="/guide/02-editor-board.png"
              alt="The pedalboard editor with two rows of effect pedals and signal cables"
              caption="The pedalboard: two rows of effect blocks wired together, with the control deck below."
            />
            <Shot
              src="/guide/04-info-bar-chain.png"
              alt="The chain strip and info bar showing effect details"
              caption="The chain strip (top) and info bar reflect the true signal order and the focused pedal."
            />
          </Section>

          <Section id="pedals" title="Changing & managing pedals">
            <p>
              The GP-200 has a fixed set of effect blocks. You don't add or remove
              blocks; you change what each block holds and how it sounds:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Bypass on/off</strong>: click a pedal's footswitch. A
                bypassed pedal dims and shows a <em>BYPASSED</em> tag.
              </li>
              <li>
                <strong>Replace the effect</strong>: click the pedal's name to
                open the effect browser, then pick a new effect for that block.
                The browser is scoped to that block's module (drive, mod, delay…)
                with categories and search.
              </li>
              <li>
                <strong>Edit parameters</strong>: turn the pedal's knobs, move its
                faders, or flip its switches. EQ blocks show faders.
              </li>
              <li>
                <strong>Reorder</strong>: drag a pedal into another bay, or focus
                its <strong>#n</strong> chain number and use the Left/Right arrow
                keys.
              </li>
            </ul>
            <Shot
              src="/guide/03-effect-picker.png"
              alt="The effect browser showing categories, search, and effect tiles"
              caption="Click a pedal's name to open the effect browser and swap what's loaded in that block."
            />
          </Section>

          <Section id="deck" title="The control deck">
            <p>
              The deck at the bottom of the board is the patch cockpit. It holds
              the patch <strong>name and author</strong>, a patch{' '}
              <strong>VOL</strong> slider, a <strong>PAN / TEMPO</strong> popover,
              live treadle readouts (volume, wah, and whammy positions moving in
              real time), and audio meters. Four buttons open the deck drawers
              below. When a device is connected, a <strong>SAVE TO [slot]</strong>{' '}
              button writes the current patch to the active slot.
            </p>
          </Section>

          <Section id="drawers" title="Deck drawers">
            <h3 className="font-mono-display text-base font-bold tracking-wide text-text-primary mt-5">
              FX Loop
            </h3>
            <p>
              Drag the <strong>↗ SEND</strong> and <strong>↘ RETURN</strong>{' '}
              arrows between blocks to place your external effects loop anywhere in
              the chain. Setting Send equal to Return bypasses the loop. Arrow keys
              work too.
            </p>
            <Shot
              src="/guide/05-deck-fxloop.png"
              alt="The FX loop drawer with draggable send and return arrows"
              caption="FX LOOP drawer: drag SEND and RETURN to route the external loop."
            />

            <h3 className="font-mono-display text-base font-bold tracking-wide text-text-primary mt-6">
              EXP: expression pedals
            </h3>
            <p>
              Assign the expression pedals across three pages (EXP1 Mode A, EXP1
              Mode B, EXP2), each with three assignment slots. For each slot, pick
              a pedal, pick one of its knobs, then set the <strong>Heel</strong>{' '}
              (pedal up) and <strong>Toe</strong> (pedal down) sweep values.
            </p>
            <Shot
              src="/guide/06-deck-exp.png"
              alt="The expression pedal assignment drawer"
              caption="EXP drawer: map an expression pedal to a knob with Heel/Toe sweep values."
            />

            <h3 className="font-mono-display text-base font-bold tracking-wide text-text-primary mt-6">
              CTRL: footswitches
            </h3>
            <p>
              Assign the eight CTRL footswitches. Pick a footswitch, then tap the
              effect blocks it should toggle; one switch can stomp several pedals
              at once. Colored dots show what each switch controls; Clear resets a
              switch.
            </p>
            <Shot
              src="/guide/07-deck-ctrl.png"
              alt="The CTRL footswitch assignment drawer"
              caption="CTRL drawer: bind each footswitch to a set of effect blocks."
            />

            <h3 className="font-mono-display text-base font-bold tracking-wide text-text-primary mt-6">
              LOOP: loop station
            </h3>
            <p>
              A multi-layer loop station that records the GP-200's USB audio
              (you'll be asked to enable audio capture first) — a capability the
              pedal doesn't ship with. Your first recording sets the master loop
              length; every record pass after that adds a new layer, quantized
              and phase-locked to the first, with no limit on the number of
              layers. Each track has Play / Mute / level / delete, with a master
              progress bar and Clear All.
            </p>
            <p>
              You can drive it hands-free from the pedal itself: use MIDI-learn
              to bind the GP-200's physical footswitches to Record, Play, and
              track selection, with an optional takeover mode so a stomp
              controls the looper instead of its normal patch function while the
              drawer is open. Mapping the expression pedal to loop levels is
              experimental (its wire format is still being captured).
            </p>
            <Shot
              src="/guide/08-deck-loop.png"
              alt="The loop station drawer with multi-track controls"
              caption="LOOP drawer: a multi-track looper over the GP-200's USB audio."
            />
          </Section>

          <Section id="patches" title="Managing patches">
            <p>
              The <strong>PATCHES</strong> button in the top bar opens the patch
              manager, a side sheet listing all 256 device slots (64 banks ×
              A–D) with names and search. It also hosts the <strong>FILE</strong>{' '}
              row for importing/exporting <code>.prst</code> files, which works
              without a device. With a GP-200 connected, per slot you can:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Activate</strong>: switch the unit to that slot.</li>
              <li><strong>Open</strong>: pull the slot into the editor.</li>
              <li><strong>Export</strong>: download the slot as a <code>.prst</code> file.</li>
              <li><strong>Import</strong>: write a <code>.prst</code> into the slot (with an overwrite prompt).</li>
              <li><strong>Rename</strong>: rename the slot (16 characters).</li>
            </ul>
            <p>
              You can also bulk-export the selected bank, or all 256 patches, to a
              single <code>.zip</code>. The top bar's <strong>LOAD</strong> and{' '}
              <strong>SAVE AS</strong> use a slot picker to pull a patch into the
              editor or write the current patch to a chosen slot.
            </p>
            <p className="text-text-muted text-caption">
              Slot management is a device-connected feature, so it isn't pictured
              here; connect a GP-200 to see your slots.
            </p>
          </Section>

          <Section id="connect" title="Connecting your GP-200">
            <p>
              Click <strong>CONNECT</strong> on the landing screen or in the top
              bar (Chrome/Edge only). A short handshake reports your firmware; an
              unsupported firmware raises a compatibility warning. On connect, the
              unit's current preset loads into the editor automatically.
            </p>
            <p>
              From then on, every edit (toggles, effect swaps, knob turns,
              reorders) streams to the device live, so the board is a real-time
              remote for the pedal. The top bar shows a connection dot, the current
              slot, firmware, and a SYNC counter while pushing. Changes you make on
              the hardware flow back into the editor too.
            </p>
          </Section>

          <Section id="files" title="Importing & exporting files">
            <p>
              The <strong>FILE</strong> row inside the <strong>PATCHES</strong>{' '}
              sheet handles files: <strong>IMPORT .PRST</strong> accepts native
              GP-200 <code>.prst</code> presets, and <strong>EXPORT .PRST</strong>{' '}
              names the current patch and downloads it as a <code>.prst</code>.
              Importing while connected also previews the patch live on the
              device.
            </p>
            <Shot
              src="/guide/09-export-dialog.png"
              alt="The export dialog naming the patch before download"
              caption="EXPORT: name the patch and author, then download a .prst file."
            />
          </Section>

          <Section id="requirements" title="Requirements & limits">
            <ul className="list-disc pl-5 space-y-1.5 text-base leading-relaxed text-text-secondary max-w-4xl">
              <li>Live device features need a GP-200 over USB in Chrome or Edge (Web MIDI).</li>
              <li>Offline, you can edit patches and import/export files, but not sync or save to the unit.</li>
              <li>
                Your patches never leave your machine — there is no account and no server storing
                them. The site does record anonymous usage analytics (Google Analytics) to see which
                features get used: no patch names, file names or device details are ever sent, ad
                personalisation and Google Signals are switched off, and the browser&rsquo;s Global
                Privacy Control signal turns it off entirely.
              </li>
            </ul>
          </Section>

          <footer className="mt-14 pt-6 border-t border-border-subtle flex flex-col items-start gap-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              ← Back to the app
            </Button>
            <Credits className="font-mono-display text-label text-text-muted tracking-wide flex flex-col gap-1 [&_.credits-links]:flex [&_.credits-links]:flex-wrap [&_.credits-links]:gap-4 [&_.credits-links]:mt-1 [&_a]:text-text-secondary [&_a]:underline [&_a:hover]:text-accent-amber" />
          </footer>
        </main>
      </div>
    </div>
  );
}
