import { Logo } from '@/components/Logo';
import { REPO } from '@/seo/site';

/**
 * The static body for `/editor`.
 *
 * The editor itself cannot be prerendered — it is PedalBoard, which needs a
 * DOM, an AudioContext and gsap, and which entry-server.tsx must never import
 * (tests/unit/prerenderSafety.test.ts enforces exactly that). **Do not import
 * App or anything under components/board from this file.**
 *
 * So what ships at that URL is this: the page a visitor sees for the moment
 * before the bundle boots and replaces it, and the page they keep if it never
 * does — JavaScript switched off, a blocked script, a failed chunk. That is
 * the whole reason it is real markup with real links rather than an empty
 * div: a dead end with a spinner is worse than a paragraph and a way out.
 */
export function EditorShell() {
  return (
    <div className="lp theme-dark">
      <div className="lp-shell">
        <Logo size={56} />
        <h1 className="lp-shell-title">GP200 Studio editor</h1>
        <p className="lp-shell-body">
          The editor is loading. It builds Valeton GP-200 patches on a visual pedalboard,
          pushes them live to the pedal over USB-MIDI, and stacks loops over your playing —
          all in this tab, with nothing installed and nothing signed up for.
        </p>
        <p className="lp-shell-body">
          If it does not appear, JavaScript is switched off or a script was blocked. The
          editor needs it to run. Everything it can do is written up in the guide, which
          reads without any.
        </p>
        <p className="lp-shell-links">
          <a href="/">GP200 Studio home</a>
          <a href="/guide">Read the guide</a>
          <a href={REPO} target="_blank" rel="noopener noreferrer">
            Source on GitHub
          </a>
        </p>
      </div>
    </div>
  );
}
