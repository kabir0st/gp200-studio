import { Shot } from '../Shot';
import { A, List } from '../prose';
import { SHOT_H, SHOT_W, type GuideShot } from '../manifest';

const MANAGER: GuideShot = {
  src: '/guide/10-patch-manager.png',
  width: SHOT_W,
  height: SHOT_H,
  alt: 'The patch manager side sheet listing device slots with the FILE row',
  caption:
    'The patch manager: all 256 slots with search, plus the FILE row for .prst import and export.',
};

export function PatchesBody() {
  return (
    <>
      <p>
        The <strong>PATCHES</strong> button in the top bar opens the patch
        manager, a side sheet listing all 256 device slots (64 banks × A–D) with
        names and search. It also hosts the <strong>FILE</strong> row for
        importing/exporting <code>.prst</code> files, which works without a
        device. With a GP-200 connected, per slot you can:
      </p>
      <List>
        <li>
          <strong>Activate</strong>: switch the unit to that slot.
        </li>
        <li>
          <strong>Open</strong>: pull the slot into the editor.
        </li>
        <li>
          <strong>Export</strong>: download the slot as a <code>.prst</code>{' '}
          file.
        </li>
        <li>
          <strong>Import</strong>: write a <code>.prst</code> into the slot (with
          an overwrite prompt).
        </li>
        <li>
          <strong>Rename</strong>: rename the slot (16 characters).
        </li>
      </List>
      <p>
        You can also bulk-export the selected bank, or all 256 patches, to a
        single <code>.zip</code> , a full backup of your pedal in one file, and
        the thing to do before running{' '}
        <A href="/guide/bulk-apply">Bulk Apply</A>. The top bar's{' '}
        <strong>LOAD</strong> and <strong>SAVE AS</strong> use a slot picker to
        pull a patch into the editor or write the current patch to a chosen slot.
      </p>
      <Shot shot={MANAGER} priority />
    </>
  );
}
