import { Shot } from '../Shot';
import { List } from '../prose';
import { SHOT_H, SHOT_W, type GuideShot } from '../manifest';

const PICKER: GuideShot = {
  src: '/guide/03-effect-picker.png',
  width: SHOT_W,
  height: SHOT_H,
  alt: 'The effect browser showing categories, search, and effect tiles',
  caption:
    "Click a pedal's name to open the effect browser and swap what's loaded in that block.",
};

export function PedalsBody() {
  return (
    <>
      <p>
        The GP-200 has a fixed set of effect blocks. You don't add or remove
        blocks; you change what each block holds and how it sounds:
      </p>
      <List>
        <li>
          <strong>Bypass on/off</strong>: click a pedal's footswitch. A bypassed
          pedal dims and shows a <em>BYPASSED</em> tag.
        </li>
        <li>
          <strong>Replace the effect</strong>: click the pedal's name to open the
          effect browser, then pick a new effect for that block. The browser is
          scoped to that block's module (drive, mod, delay…) with categories and
          search.
        </li>
        <li>
          <strong>Edit parameters</strong>: turn the pedal's knobs, move its
          faders, or flip its switches. EQ blocks show faders.
        </li>
        <li>
          <strong>Reorder</strong>: drag a pedal into another bay, or focus its{' '}
          <strong>#n</strong> chain number and use the Left/Right arrow keys.
          Blocks animate to their new places, including across a row break.
        </li>
      </List>
      <Shot shot={PICKER} priority />
    </>
  );
}
