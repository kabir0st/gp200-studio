import { Shot } from '../Shot';
import { A, H2 } from '../prose';
import { SHOT_H, SHOT_W, type GuideShot } from '../manifest';

const EXPORT: GuideShot = {
  src: '/guide/09-export-dialog.png',
  width: SHOT_W,
  height: SHOT_H,
  alt: 'The export dialog naming the patch before download',
  caption: 'EXPORT: name the patch and author, then download a .prst file.',
};

export function FilesBody() {
  return (
    <>
      <p>
        The <strong>FILE</strong> row inside the <strong>PATCHES</strong> sheet
        handles files: <strong>IMPORT .PRST</strong> accepts native GP-200{' '}
        <code>.prst</code> presets, and <strong>EXPORT .PRST</strong> names the
        current patch and downloads it as a <code>.prst</code>. Importing while
        connected also previews the patch live on the device.
      </p>

      <H2>Why the format matters</H2>
      <p>
        <code>.prst</code> is the GP-200's own preset format , the same files
        Valeton's official editor reads and writes, not a conversion or an
        export. Presets move between the two applications in both directions,
        and patches you download from other players work here unchanged. Nothing
        is uploaded to do it: the decoding happens in your browser, so importing
        a preset works with the pedal unplugged and with no network connection
        at all.
      </p>
      <p>
        The initial reverse engineering of the <code>.prst</code> and SysEx
        layout came from{' '}
        <A href="https://github.com/phash/gp200editor">phash/gp200editor</A>,
        which is credited in the project README.
      </p>

      <H2>Backing up more than one patch</H2>
      <p>
        The FILE row is a single-patch tool. For everything at once, use the
        bulk ZIP export in{' '}
        <A href="/guide/managing-patches">the patch manager</A> , the selected
        bank, or all 256 slots, in one archive. That is the backup to take before{' '}
        <A href="/guide/bulk-apply">Bulk Apply</A> overwrites anything.
      </p>

      <Shot shot={EXPORT} />
    </>
  );
}
