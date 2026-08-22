import { H2, List } from '../prose';

export function DeckBody() {
  return (
    <>
      <p>
        The deck at the bottom of the board is the patch cockpit. It holds the
        patch <strong>name and author</strong>, a patch <strong>VOL</strong>{' '}
        slider, <strong>PAN</strong> and <strong>TEMPO</strong> popovers, live
        treadle readouts (volume, wah and whammy positions moving in real time),
        and audio meters. Its two buttons open the <strong>FX LOOP</strong> and{' '}
        <strong>SETTINGS</strong> drawers. When a device is connected, a{' '}
        <strong>SAVE TO [slot]</strong> button writes the current patch to the
        active slot.
      </p>
      <H2>What each control covers</H2>
      <List>
        <li>
          <strong>VOL</strong> runs 0–100 and is the patch's own output level ,
          the value Bulk Apply can stamp across a whole bank when one patch
          jumps out louder than the rest of your set.
        </li>
        <li>
          <strong>PAN</strong> runs −50 to +50, centre at 0.
        </li>
        <li>
          <strong>TEMPO</strong> runs 40–250 BPM and can be typed as a number
          rather than dragged, which is faster when you already know the tempo
          of the song. It is stored with the patch, so tempo-synced delays land
          correctly the moment the patch loads.
        </li>
        <li>
          <strong>Live treadle readouts</strong> only move when a device is
          connected: they mirror the hardware expression pedal, so you can see
          exactly where a sweep is without looking down at the floor.
        </li>
      </List>
      <H2>The session bar</H2>
      <p>
        The sticky bar at the top of the screen is the session: connection
        status, the current slot and firmware, a patch stepper, the stage lights
        switch, and the buttons for <strong>LOOP</strong>, <strong>DRUMS</strong>,{' '}
        <strong>TUNER</strong>, <strong>REMOTE</strong> and{' '}
        <strong>PATCHES</strong>, plus LOAD / SAVE AS / CONNECT and this guide.
      </p>
      <p>
        The distinction worth internalising is that the deck is{' '}
        <em>per patch</em> and the top bar is <em>per session</em>. Everything on
        the deck travels with the patch when you export it or save it to a slot;
        nothing in the top bar does. That is also why the stage lights toggle
        sits up there rather than on the deck , it is a property of your
        screen, not of your tone.
      </p>
    </>
  );
}
