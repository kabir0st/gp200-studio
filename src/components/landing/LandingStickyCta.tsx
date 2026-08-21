import type { UseMidiDeviceReturn } from '@/hooks/useMidiDevice';
import { useConnectCta } from './useConnectCta';

interface LandingStickyCtaProps {
  midiDevice: UseMidiDeviceReturn;
  /** open the editor with a blank INIT preset */
  onOpenBlank: () => void;
  /** open the editor with the connected device's current preset */
  onOpenCurrent: () => void;
}

/**
 * A compact bar that fades in once the hero's connect button has scrolled out
 * of view, so the way into the editor is never more than one click away down
 * a long page.
 *
 * Its button is the hero's *primary* action, not the ghost escape hatch: with
 * the connect card off-screen this is the only call to action visible, and
 * someone who clicks it wants their pedal, not a blank INIT preset. So it runs
 * the same handshake, wearing the same label, and App drops them into the
 * editor with the device's own preset as soon as the connect succeeds.
 *
 * The one exception is a browser without Web MIDI (Firefox, Safari), where the
 * handshake can never succeed. There the button keeps the old behaviour — open
 * a blank preset — rather than greying out and stranding those visitors at the
 * bottom of the page. The hero explains why in prose; there is no room here.
 *
 * It starts hidden in CSS *unconditionally* rather than behind the
 * `data-anim` gate: with no JavaScript there is no scrolling trigger to reveal
 * it, and a bar pinned over a static page would just cover the content. Every
 * route it offers exists in the hero and the footer too, so nothing is lost.
 */
export function LandingStickyCta({
  midiDevice,
  onOpenBlank,
  onOpenCurrent,
}: LandingStickyCtaProps) {
  const { busy, connected, webMidiSupported, label } = useConnectCta(midiDevice);

  let ctaLabel = label;
  let onActivate: () => void = () => void midiDevice.connect();
  let led: string | null = busy ? 'lp-led busy' : 'lp-led';

  if (connected) {
    ctaLabel = 'OPEN CURRENT PRESET';
    onActivate = onOpenCurrent;
    led = 'lp-led on';
  } else if (!webMidiSupported) {
    ctaLabel = 'OPEN THE EDITOR';
    onActivate = onOpenBlank;
    led = null;
  }

  return (
    <div className="lp-sticky" data-lp-sticky>
      <span className="lp-sticky-name">GP200 Studio</span>
      <span className="lp-sticky-actions">
        <a className="lp-sticky-link" href="/guide">Guide</a>
        <button
          type="button"
          className="lp-btn primary compact"
          disabled={busy}
          onClick={onActivate}
        >
          {led && <span className={led} aria-hidden="true" />}
          <span className="lp-sticky-label">{ctaLabel}</span>
        </button>
      </span>
    </div>
  );
}
