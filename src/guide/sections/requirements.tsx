import { A, H3, List } from '../prose';

export function RequirementsBody() {
  return (
    <>
      <H3>What you need</H3>
      <List>
        <li>
          Live device features need a GP-200 over USB in Chrome or Edge (Web
          MIDI).
        </li>
        <li>
          Offline, you can edit patches and import/export files, but not sync or
          save to the unit.
        </li>
        <li>
          Any desktop OS , Windows, macOS or Linux , plus ChromeOS and Android.
          Linux is worth calling out: the official Valeton editor does not
          support it at all, which is a large part of why this exists. It does
          need one piece of local setup the other platforms don't; see{' '}
          <A href="/guide/connect-gp-200">Connecting your GP-200</A>.
        </li>
      </List>

      <H3>Browser support, precisely</H3>
      <p>
        The dividing line is <strong>Web MIDI</strong>, and it is not a
        preference , Firefox and Safari have not shipped it, so there is no
        setting or extension that makes device sync work in them. What they{' '}
        <em>can</em> do is everything that doesn't touch the pedal: build and
        edit a patch, run the browser drum machine, and import or export{' '}
        <code>.prst</code> files. The loop station additionally needs Web Audio
        capture of the GP-200's USB audio, which means a connected device and a
        one-time microphone permission for the input.
      </p>

      <H3>Privacy</H3>
      <p>
        Your patches never leave your machine , there is no account and no
        server storing them. Every byte of decoding, editing and encoding happens
        in the browser tab.
      </p>
      <p>
        The site does record anonymous usage analytics (Google Analytics) to see
        which features get used: no patch names, file names or device details are
        ever sent, ad personalisation and Google Signals are switched off, and
        the browser's Global Privacy Control signal turns it off entirely.
      </p>

      <H3>Licence &amp; limits</H3>
      <p>
        GP200 Studio is free software under the{' '}
        <A href="https://www.gnu.org/licenses/gpl-3.0.html">GPL-3.0</A>, and the
        full source is on{' '}
        <A href="https://github.com/kabir0st/gp200-studio">GitHub</A> , which
        also means you can audit every claim on this page rather than take it on
        trust. It is an independent project and is not affiliated with, endorsed
        by, or supported by Valeton.
      </p>
      <p>
        Two things are known to be incomplete: writing global settings (tuner
        reference, global EQ) back to the unit, and mapping the expression pedal
        to loop-station levels. Both are blocked on protocol capture rather than
        on effort, and both are read-only or experimental in the UI rather than
        quietly unreliable.
      </p>
    </>
  );
}
