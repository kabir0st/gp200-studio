import { Shot } from '../Shot';
import { A, Note } from '../prose';
import { SHOT_H, SHOT_W, type GuideShot } from '../manifest';

const LANDING: GuideShot = {
  src: '/guide/01-landing.png',
  width: SHOT_W,
  height: SHOT_H,
  alt: 'GP200 Studio landing screen with the connect button and the open-without-connecting link',
  caption:
    "The landing screen: plug in your GP-200 and click the big button , or open without connecting to try the editor on a blank preset.",
};

export function OverviewBody() {
  return (
    <>
      <p>
        GP200 Studio is a browser-based editor and loop station for the Valeton
        GP-200 multi-effects floor unit. Load, build, and edit presets entirely
        in your browser, then push changes live to a connected GP-200 over
        USB-MIDI. It's free and open source (GPL-3.0); the code lives on{' '}
        <A href="https://github.com/kabir0st/gp200-studio">GitHub</A>.
      </p>
      <Note title="Note">
        <p>
          Device features (live sync, patch management, saving to the unit) need
          a GP-200 connected over USB in <strong>Chrome or Edge</strong>. Web
          MIDI isn't available in Firefox or Safari. Offline, you can still edit
          patches and import/export files.
        </p>
      </Note>
      <Shot shot={LANDING} priority />
    </>
  );
}
