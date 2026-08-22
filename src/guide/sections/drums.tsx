import { Shot } from '../Shot';
import { H2, List } from '../prose';
import { SHOT_H, SHOT_W, type GuideShot } from '../manifest';

const DRUMS: GuideShot = {
  src: '/guide/11-drums.png',
  width: SHOT_W,
  height: SHOT_H,
  alt: 'The drums drawer with the step sequencer grid, kit and groove pickers',
  caption:
    'The practice drum machine: pick a kit and groove, set BPM and swing, then toggle steps on the grid.',
};

export function DrumsBody() {
  return (
    <>
      <p>
        The <strong>DRUMS</strong> button in the top bar opens two drum machines
        stacked in one drawer: a practice kit that plays in your browser, and a
        remote for the GP-200's own drums.
      </p>

      <H2>Practice drum machine (browser audio)</H2>
      <p>
        A step-sequenced kit that runs entirely in the browser , no GP-200
        needed, so it works offline and while you're editing on the train. Pick a{' '}
        <strong>kit</strong> and a <strong>groove</strong>, set{' '}
        <strong>BPM</strong>, <strong>swing</strong> and volume, and click
        individual steps on the grid to make it yours. Each click steps a pad
        through <strong>hit</strong>, <strong>accent</strong> and{' '}
        <strong>ghost</strong> before clearing it again, so the softer notes the
        preset grooves use are yours to place too; mute a lane to drop the hats
        or the kick.
      </p>
      <List>
        <li>
          <strong>Time signatures</strong>: 4/4, 3/4, 2/4 and 6/8 , the grid, the
          bar length and the backbeat move with the signature.
        </li>
        <li>
          <strong>Swing</strong>: MPC-style, from straight to heavily shuffled.
        </li>
        <li>
          <strong>RANDOM</strong>: rolls a new pattern in the chosen style that
          still fits the signature , a fast way out of writer's block.
        </li>
        <li>
          <strong>It keeps playing</strong> when you close the drawer, so you can
          dial in a tone over the beat; the DRUMS button glows while it runs.
        </li>
      </List>
      <Shot shot={DRUMS} priority />

      <H2>GP-200 hardware drums (MIDI remote)</H2>
      <p>
        Below it, the same drawer remote-controls the pedal's built-in drum
        machine over MIDI: start/stop, rhythm selection and drum volume, plus the{' '}
        <strong>TUNER</strong> and a tap-tempo. These need a connected GP-200,
        and the MIDI channel must match the unit's global channel (default 1) ,
        there's a selector right there if you've changed it.
      </p>
    </>
  );
}
