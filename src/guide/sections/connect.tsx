import { H3, List } from '../prose';

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

      <H3>About the firmware warning</H3>
      <p>
        The preset format has only been verified against firmware{' '}
        <strong>1.8</strong>. If your unit reports anything else you will get a
        compatibility dialog before you can edit, because the byte layout of a
        patch is exactly the kind of thing a firmware update moves , and writing
        a misread layout back to the pedal is how presets get corrupted. You can
        dismiss the warning and continue at your own risk; export a full ZIP
        backup from the patch manager first if you do.
      </p>

      <H3>If the pedal isn't found</H3>
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
      </List>
    </>
  );
}
