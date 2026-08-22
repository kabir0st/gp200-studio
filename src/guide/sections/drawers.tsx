import { Shot } from '../Shot';
import { H2 } from '../prose';
import { SHOT_H, SHOT_W, type GuideShot } from '../manifest';

const FXLOOP: GuideShot = {
  src: '/guide/05-deck-fxloop.png',
  width: SHOT_W,
  height: SHOT_H,
  alt: 'The FX loop drawer with draggable send and return arrows',
  caption: 'FX LOOP drawer: drag SEND and RETURN to route the external loop.',
};

const EXP: GuideShot = {
  src: '/guide/06-deck-exp.png',
  width: SHOT_W,
  height: SHOT_H,
  alt: 'The expression pedal assignment drawer',
  caption: 'EXP drawer: map an expression pedal to a knob with Heel/Toe sweep values.',
};

const CTRL: GuideShot = {
  src: '/guide/07-deck-ctrl.png',
  width: SHOT_W,
  height: SHOT_H,
  alt: 'The CTRL footswitch assignment drawer',
  caption: 'CTRL drawer: bind each footswitch to a set of effect blocks.',
};

export function DrawersBody() {
  return (
    <>
      <p>
        Everything that belongs to <em>this patch</em> but isn't a pedal lives in
        two deck drawers: <strong>FX LOOP</strong>, and <strong>SETTINGS</strong>{' '}
        , which is tabbed into <strong>Expression</strong>,{' '}
        <strong>Footswitches</strong> and <strong>Bulk Apply</strong>. On a phone
        they are the FX Loop and Patch Settings sheets on the DEVICE tab.
      </p>

      <H2>FX Loop</H2>
      <p>
        Drag the <strong>↗ SEND</strong> and <strong>↘ RETURN</strong> arrows
        between blocks to place your external effects loop anywhere in the
        chain. Setting Send equal to Return bypasses the loop. Arrow keys work
        too.
      </p>
      <Shot shot={FXLOOP} priority />

      <H2>Expression pedals</H2>
      <p>
        Assign the expression pedals across three pages (EXP1 Mode A, EXP1 Mode
        B, EXP2), each with three assignment slots. For each slot, pick a pedal,
        pick one of its knobs, then set the <strong>Heel</strong> (pedal up) and{' '}
        <strong>Toe</strong> (pedal down) sweep values.
      </p>
      <Shot shot={EXP} />

      <H2>Footswitches (CTRL 1–8)</H2>
      <p>
        Assign the eight CTRL footswitches. Pick a footswitch, then tap the
        effect blocks it should toggle; one switch can stomp several pedals at
        once. Colored dots show what each switch controls; Clear resets a switch.
        With a device connected the assignment is written live, and it is stored
        with the patch, so it survives an export and a save to the unit.
      </p>
      <Shot shot={CTRL} />
    </>
  );
}
