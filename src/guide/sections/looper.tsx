import { Shot } from '../Shot';
import { H2 } from '../prose';
import { SHOT_H, SHOT_W, type GuideShot } from '../manifest';

const SIMPLE: GuideShot = {
  src: '/guide/08-deck-loop.png',
  width: SHOT_W,
  height: SHOT_H,
  alt: "The loop station's simple face with two recorded takes",
  caption:
    'SIMPLE: one record button that says what it will do next, volume, the timeline and your footswitches.',
};

const ADVANCED: GuideShot = {
  src: '/guide/12-loop-advanced.png',
  width: SHOT_W,
  height: SHOT_H,
  alt: "The loop station's advanced face with the record setup panel open",
  caption:
    'ADVANCED: the same loop, plus the capture edges , loop grid, take length, note trigger, loop join and timing trim.',
};

export function LooperBody() {
  return (
    <>
      <p>
        A <strong>multi-layer loop station</strong> that records the GP-200's USB
        audio right in the browser , a capability the pedal doesn't ship with
        (its built-in looper is a single loop). Open it with{' '}
        <strong>LOOP</strong> in the top bar; you'll be asked to enable audio
        capture the first time, and you pick the GP-200 as the input.
      </p>

      <H2>Simple and Advanced</H2>
      <p>
        The drawer has two faces, and the toggle at the top right remembers which
        one you used last. <strong>SIMPLE</strong> is the default: one big record
        button, play / undo / import / clear, a volume knob, the timeline, your
        tracks and your footswitches. Nothing has to be set up before it works.
      </p>
      <p>
        The record button always says what pressing it will do next ,{' '}
        <strong>RECORD</strong>, then <strong>LISTENING</strong> while it waits
        for your first note, <strong>ARMED</strong> while it waits for the
        downbeat, <strong>STOP</strong> while it runs, and{' '}
        <strong>ADD A TAKE</strong> once a loop exists , with a line underneath
        saying why. That gap between pressing record and hearing anything is the
        only genuinely confusing moment in any looper, so it is spelled out
        rather than left to a blinking light.
      </p>
      <p>
        <strong>ADVANCED</strong> adds everything below: the capture-edge
        settings under RECORD SETUP, fixed take lengths, the trigger threshold,
        per-track play/pause and the expression-pedal routing. Both faces drive
        the same looper , switching is only about how much is on screen.
      </p>

      <H2>Stacking layers</H2>
      <p>
        Every record pass adds a new layer, quantized and phase-locked to the
        loop, with no limit on the number of layers , so the tenth overdub is
        still exactly in time with the first. Each track has its own{' '}
        <strong>Play / Mute / level / delete</strong>, and there's a master
        progress bar and <strong>Clear All</strong>. You can also import an audio
        file as a layer to jam over.
      </p>
      <p>
        <strong>VOLUME</strong> is the loop station's own output level, and it is
        worth knowing why it sits on the main surface: tracks <em>sum</em>. Three
        takes stacked at full level is three times full scale, so the loop starts
        out below unity and you take it wherever you want from there. A soft
        clipper on the output keeps a heavy stack from breaking up if you push it
        , it does nothing at all until the mix is genuinely running out of
        headroom.
      </p>

      <H2>Starting and stopping in time</H2>
      <p>
        Everything that decides where a take begins and ends lives under{' '}
        <strong>RECORD SETUP</strong>, on the <strong>ADVANCED</strong> face. The
        defaults are chosen to be right for a first loop, but these four are
        worth two minutes before a serious one , and SIMPLE puts the most
        valuable of them, locking the bar to the drum machine, one tap from the
        loop readout:
      </p>
      <ul>
        <li>
          <strong>Loop grid.</strong> Hit <strong>LOCK BAR TO DRUMS</strong> and
          the looper's bar becomes one bar of the practice drum machine's tempo ,
          an exact length, rather than one measured between two of your own
          button presses.
        </li>
        <li>
          <strong>Take length.</strong> Pick a bar count and recording{' '}
          <em>stops itself</em> at exactly that length. Nothing to press in time,
          so no reaction time ends up in the loop. Leave it on FREE to stop by
          hand.
        </li>
        <li>
          <strong>Start on first note.</strong> With this on, your first take
          doesn't begin when you press REC , it begins when you <em>play</em>.
          The recorder keeps a rolling pre-roll, so the pick attack that
          triggered it is still there rather than clipped off, and the loop
          starts at a zero crossing. Set the trigger level against the meter
          beside it: above your rig's hiss, below your quietest intended note.
          Once a loop is running, later takes drop in on the downbeat instead,
          which is always the better reference.
        </li>
        <li>
          <strong>Timing trim.</strong> The app already compensates for the round
          trip your interface reports (shown in ms). If takes still land
          consistently late, raise the trim; if they land early, lower it. It is
          remembered per browser.
        </li>
      </ul>

      <H2>How the loop point is joined</H2>
      <p>
        The downbeat is usually the loudest thing in a take, so fading it in ,
        which is what a plain crossfade does , is exactly what makes a loop sound
        like it is breathing. This looper never touches the head. Instead it
        keeps recording <em>past</em> the end of the loop and mixes that ring-out
        back over the downbeat, so the last chord carries across the wrap the way
        it would if you had kept playing. <strong>LOOP JOIN</strong> sets how
        much: raise it if the wrap sounds cut off, lower it if the last chord
        smears over the top of the loop.
      </p>

      <H2>Keyboard</H2>
      <p>
        <strong>R</strong> records and stops, <strong>SPACE</strong> plays and
        stops everything, <strong>Ctrl/⌘ Z</strong> undoes , and mid-take it
        throws away the pass in progress, which is the one thing you always want
        in a hurry. <strong>Ctrl/⌘ ⇧ Z</strong> redoes, <strong>M</strong> mutes
        the selected track, <strong>[</strong> and <strong>]</strong> step
        through tracks, and <strong>DEL</strong> deletes the selected one
        (undoable). They work anywhere in the app while capture is on, even with
        the drawer closed, and stand down while you're typing in a field.
      </p>

      <H2>Hands-free from the pedal</H2>
      <p>
        Playing guitar and clicking a mouse don't mix, so the looper can be
        driven from the GP-200's own footswitches , and because that is the only
        way to work a looper with both hands on the guitar, the row of them is on{' '}
        <em>both</em> faces. There is one button per action (REC / STOP, PLAY,
        MUTE, TRACK +, TRACK −): click the action you want, stomp any switch, and
        it's bound. You never pick a switch by number. An assigned action turns
        amber with a tick and grows a small ✕ to forget just that one. A{' '}
        <strong>takeover</strong> mode makes a learned stomp control the looper
        instead of its normal patch function while the loop station is open, so
        you don't change your sound every time you punch in. Bindings are
        remembered between sessions. Mapping the expression pedal to loop levels
        is experimental (its wire format is still being captured).
      </p>
      <p>
        The pedal's own single-track looper and its transport are in the same
        drawer, folded under the loop station, so the two never compete for the
        same button.
      </p>

      <Shot shot={SIMPLE} />
      <Shot shot={ADVANCED} />
    </>
  );
}
