import { Shot } from '../Shot';
import { SHOT_H, SHOT_W, type GuideShot } from '../manifest';

const BOARD: GuideShot = {
  src: '/guide/02-editor-board.png',
  width: SHOT_W,
  height: SHOT_H,
  alt: 'The pedalboard editor with two rows of effect pedals and signal cables',
  caption:
    'The pedalboard: two rows of effect blocks wired together, with the control deck below.',
};

// A wide, short strip rather than a full board capture, so it has no 1200 variant.
const CHAIN: GuideShot = {
  src: '/guide/04-info-bar-chain.png',
  width: 2400,
  height: 98,
  alt: 'The chain strip and info bar showing effect details',
  caption:
    'On a narrow window the chain strip (top) joins the info bar, both reflecting the true signal order and the focused pedal.',
};

export function EditorBody() {
  return (
    <>
      <p>
        The editor lays your signal chain out as physical stompboxes, with patch
        cables showing the flow from input to output. The chain reads left to
        right and <strong>wraps onto as many rows as it needs</strong>, so it
        stacks downward instead of running off the side of the screen; a short
        labeled stub marks where one row hands over to the next. Narrow the
        window far enough and the rows fold into one swipeable line; a chain
        strip then appears at the top as a compact overview, so you can click a
        block to jump to a pedal that has scrolled out of view. Hovering a pedal
        , or clicking its <strong>i</strong> , shows its details in the info bar.
      </p>
      <p>
        The board also <strong>scales itself to fit your window</strong>: on a
        smaller screen the pedals shrink just enough to keep the whole chain and
        the control deck visible at once, down to a floor where the knobs are
        still comfortable to turn. Below that the stage scrolls.
      </p>
      <p>
        The red rocker switch in the top bar is the <strong>stage lights</strong>.
        Lit means the light stage; flip it off for <strong>dark mode</strong>,
        which dims the room (chassis, chrome, dialogs) while leaving the pedals
        their own colours , with a suitably unreliable mains flicker on the way.
        Your choice is remembered on this device. On a phone the same toggle
        lives at the top of the <strong>DEVICE</strong> tab.
      </p>
      <Shot shot={BOARD} priority />
      <Shot shot={CHAIN} />
    </>
  );
}
