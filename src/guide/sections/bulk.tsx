import { H2, List, Note } from '../prose';

export function BulkBody() {
  return (
    <>
      <p>
        Setting up footswitches once per patch, 256 times, is exactly the chore
        the pedal's own screen makes you do. <strong>Bulk Apply</strong> (the
        third tab of the SETTINGS drawer) copies the current patch's setup into a
        whole range of patches in one pass.
      </p>

      <H2>What it can write</H2>
      <List>
        <li>
          <strong>CTRL footswitch assignments</strong> , the eight footswitch →
          effect-block mappings from the Footswitches tab. Build your live
          footswitch layout once and stamp it onto every patch you gig with.
          (Available once the current patch actually has assignments to copy.)
        </li>
        <li>
          <strong>Patch volume</strong> , one level, written into every patch in
          range. The fastest way to even out a set where some patches jump out
          louder than others.
        </li>
      </List>

      <H2>Choosing the range</H2>
      <p>
        Pick <strong>all 256 patches</strong>, or a <strong>bank range</strong>{' '}
        (for example banks 1–8, which is 32 patches). A progress readout counts
        through the slots as it goes and there's a <strong>Cancel</strong>{' '}
        button; cancelling stops before the next slot rather than half-writing
        one.
      </p>

      <Note title="How it works, and why it takes a moment">
        <p>
          There is no "write to many patches" message in the GP-200's protocol.
          For each slot the app switches the unit to it, writes the values, and
          commits the save , the same three steps you'd do by hand, just
          automatically and in order. So it needs a connected device, it takes a
          few seconds per dozen patches, and{' '}
          <strong>it overwrites the target patches' existing settings</strong>.
          Back up first with the patch manager's bulk ZIP export if you aren't
          sure.
        </p>
      </Note>
    </>
  );
}
