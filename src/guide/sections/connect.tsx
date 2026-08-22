import { H2, List, Note } from '../prose';

export function ConnectBody() {
  return (
    <>
      <p>
        Click <strong>CONNECT</strong> on the landing screen or in the top bar
        (Chrome/Edge only). A short handshake reports your firmware; an
        unsupported firmware raises a compatibility warning. On connect, the
        unit's current preset loads into the editor automatically.
      </p>
      <p>
        From then on, every edit (toggles, effect swaps, knob turns, reorders)
        streams to the device live, so the board is a real-time remote for the
        pedal. The top bar shows a connection dot, the current slot, firmware,
        and a SYNC counter while pushing. Changes you make on the hardware flow
        back into the editor too.
      </p>

      <H2>About the firmware warning</H2>
      <p>
        The preset format has only been verified against firmware{' '}
        <strong>1.8</strong>. If your unit reports anything else you will get a
        compatibility dialog before you can edit, because the byte layout of a
        patch is exactly the kind of thing a firmware update moves , and writing
        a misread layout back to the pedal is how presets get corrupted. You can
        dismiss the warning and continue at your own risk; export a full ZIP
        backup from the patch manager first if you do.
      </p>

      <H2>If the pedal isn't found</H2>
      <List>
        <li>
          <strong>Check the browser.</strong> Firefox and Safari do not implement
          Web MIDI at all, so there is nothing to fix there , use Chrome or
          Edge, on any of Windows, macOS, Linux, ChromeOS or Android.
        </li>
        <li>
          <strong>Check the cable.</strong> A surprising number of USB cables
          sold with pedals are charge-only and carry no data lines.
        </li>
        <li>
          <strong>Close the official editor.</strong> Most systems give one
          application exclusive access to a USB-MIDI port, so the unit will not
          appear here while Valeton's editor holds it open.
        </li>
        <li>
          <strong>Grant the permission prompt.</strong> Web MIDI asks once per
          site; if you dismissed it, clear the site permission and reload.
        </li>
        <li>
          <strong>On Linux, check for a sandboxed browser.</strong> A Flatpak or
          Snap Chrome, Chromium, Brave or Edge cannot see USB MIDI at all
          without one extra grant; the first note below has the fix.
        </li>
        <li>
          <strong>On Linux, load the ALSA sequencer bridge.</strong> This one
          looks like a broken app rather than a missing driver, so it is worth
          knowing about; the second note below has the one-line fix.
        </li>
      </List>

      <Note title="Linux: a Flatpak or Snap browser cannot see USB devices">
        <p>
          Chromium binds ALSA cards to sequencer clients through{' '}
          <strong>udev</strong>. A sandboxed browser is handed{' '}
          <code>/dev/snd</code> but not <code>/run/udev</code>, so it drops
          every card-backed port and keeps only the card-less ones. The tell is
          a CONNECT message listing <code>Midi Through Port-0</code> and nothing
          else: the sequencer is reachable, and the pedal is being filtered out
          before it gets there. Everything else on the machine —{' '}
          <code>lsusb</code>, <code>aconnect -l</code>, any native app — sees
          the GP-200 perfectly, which is what makes this one so confusing.
        </p>
        <p>
          Grant the sandbox read-only udev access:{' '}
          <code>flatpak override --user --filesystem=/run/udev:ro com.brave.Browser</code>.
          Substitute your own app id — <code>com.google.Chrome</code>,{' '}
          <code>org.chromium.Chromium</code> or <code>com.microsoft.Edge</code>.
          Then quit the browser <em>completely</em> and reopen it: closing the
          window is not enough, because the old sandbox stays alive. Force it
          with <code>flatpak kill com.brave.Browser</code>. To undo the grant,{' '}
          <code>flatpak override --user --nofilesystem=/run/udev com.brave.Browser</code>.
        </p>
        <p>
          Snap builds have the same shape of problem; connect the relevant
          interface with <code>snap connect</code>, or install the browser
          natively. A natively packaged Chrome or Chromium has no sandbox in
          front of udev and needs none of this.
        </p>
      </Note>

      <Note title="Linux: the ALSA sequencer bridge is not loaded">
        <p>
          Chrome reads Web MIDI from the ALSA <em>sequencer</em>, never from
          rawmidi directly. Your GP-200 can be listed by <code>lsusb</code>, own
          a card in <code>/proc/asound/cards</code> and expose a{' '}
          <code>/dev/snd/midiC*D*</code> node while still appearing in no
          browser at all, because the kernel module that publishes rawmidi
          devices as sequencer clients (<code>snd-seq-midi</code>) has not been
          loaded. CONNECT then reports the ports it can see, and the pedal
          is not among them.
        </p>
        <p>
          Fix it for this session with{' '}
          <code>sudo modprobe snd-seq-midi</code>, then reload the page (no
          replug needed). Confirm with{' '}
          <code>grep '^Client' /proc/asound/seq/clients</code>, which should now
          list a GP-200 client. To survive reboots:{' '}
          <code>echo snd-seq-midi | sudo tee /etc/modules-load.d/snd-seq-midi.conf</code>.
        </p>
      </Note>
    </>
  );
}
