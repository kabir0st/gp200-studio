import { H3, List } from '../prose';

export function RemoteBody() {
  return (
    <>
      <p>
        <strong>REMOTE</strong> in the top bar is a virtual copy of the pedal's
        front panel over plain MIDI CC: tap the CTRL footswitches, step banks and
        patches, set the tempo directly, and reach the quick-access knobs ,
        useful when the unit is on the floor and you are not.
      </p>

      <H3>What it sends</H3>
      <p>
        These are ordinary three-byte control changes, not SysEx , the same
        messages listed in Valeton's own MIDI Control Information List, sent on
        the unit's global MIDI channel. That has two practical consequences.
      </p>
      <List>
        <li>
          <strong>The channel has to match.</strong> The GP-200 ships on channel
          1 and the app defaults to the same, so it usually just works; if you
          have changed the unit's global channel, change it in the drawer to
          match or nothing will respond.
        </li>
        <li>
          <strong>Anything that speaks MIDI can do the same.</strong> Bank up and
          down are CC 23 and CC 22, patch up and down are CC 25 and CC 24, the
          tuner is CC 58, and the module on/off switches occupy CC 48–57. If you
          would rather drive the pedal from a hardware controller than from this
          panel, those are the numbers to program into it.
        </li>
      </List>

      <H3>Device state</H3>
      <p>
        Underneath it, a read-only <strong>device state</strong> panel shows what
        the unit reported when it connected: tuner reference (A4), global EQ
        values and the drum kit names. It's a readout, not an editor , writing
        global settings back is still being reverse engineered.
      </p>
      <p>
        The honest reason it is read-only: the global-EQ <em>write</em> frame
        does not appear anywhere in the official editor's binary, and the raw EQ
        floats have not yet been mapped onto named bands, so the panel shows the
        values it can prove rather than guessing at labels. It is pulled once
        during the connect handshake, so if you change a global setting on the
        hardware you will need to reconnect to see it here.
      </p>
    </>
  );
}
