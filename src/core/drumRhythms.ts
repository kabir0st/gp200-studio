// GP-200 drum-machine rhythm table: CC 94 value → style name + time
// signature. Transcribed verbatim from the gp2-controller.xyz bundle
// (decompiled chunk-RQAPND4V.js, 2026-07); indices are the CC values the
// device expects. The same style names appear in the 0x4E state dump
// (docs/protocol-capture.md §5), which remains the only readback path.

export interface DrumRhythm {
  index: number;
  name: string;
  signature: string;
}

export const DRUM_RHYTHMS: readonly DrumRhythm[] = [
  { index: 0, name: 'Classic Rock 1', signature: '4/4' },
  { index: 1, name: 'Classic Rock 2', signature: '4/4' },
  { index: 2, name: 'Classic Rock 3', signature: '4/4' },
  { index: 3, name: 'Classic Rock 4', signature: '4/4' },
  { index: 4, name: 'Classic Rock 5', signature: '4/4' },
  { index: 5, name: 'Classic Rock 6', signature: '4/4' },
  { index: 6, name: 'Hard Rock 1', signature: '4/4' },
  { index: 7, name: 'Hard Rock 2', signature: '4/4' },
  { index: 8, name: 'Hard Rock 3', signature: '3/4' },
  { index: 9, name: 'Post Rock 1', signature: '5/4' },
  { index: 10, name: 'Post Rock 2', signature: '4/4' },
  { index: 11, name: 'Post Rock 3', signature: '4/4' },
  { index: 12, name: 'Garage Rock', signature: '4/4' },
  { index: 13, name: 'Prog Rock', signature: '4/4' },
  { index: 14, name: 'Surf Rock', signature: '4/4' },
  { index: 15, name: 'Punk 1', signature: '4/4' },
  { index: 16, name: 'Punk 2', signature: '4/4' },
  { index: 17, name: 'Punk 3', signature: '4/4' },
  { index: 18, name: 'Punk 4', signature: '4/4' },
  { index: 19, name: 'Post Punk 1', signature: '4/4' },
  { index: 20, name: 'Post Punk 2', signature: '4/4' },
  { index: 21, name: 'Heavy Metal 1', signature: '4/4' },
  { index: 22, name: 'Heavy Metal 2', signature: '4/4' },
  { index: 23, name: 'Nu-Metal 1', signature: '4/4' },
  { index: 24, name: 'Nu-Metal 2', signature: '4/4' },
  { index: 25, name: 'Hardcore', signature: '4/4' },
  { index: 26, name: 'EMO', signature: '4/4' },
  { index: 27, name: 'Grunge', signature: '4/4' },
  { index: 28, name: 'New Wave', signature: '4/4' },
  { index: 29, name: 'Rock 5/4', signature: '5/4' },
  { index: 30, name: 'Funk 1', signature: '4/4' },
  { index: 31, name: 'Funk 2', signature: '4/4' },
  { index: 32, name: 'Funk 3', signature: '4/4' },
  { index: 33, name: 'Funk 4', signature: '4/4' },
  { index: 34, name: 'Jazz Funk 1', signature: '4/4' },
  { index: 35, name: 'Jazz Funk 2', signature: '4/4' },
  { index: 36, name: 'Jazz Funk 3', signature: '4/4' },
  { index: 37, name: 'Blues 1', signature: '4/4' },
  { index: 38, name: 'Blues 2', signature: '4/4' },
  { index: 39, name: 'Blues 3', signature: '4/4' },
  { index: 40, name: 'Blues 4', signature: '4/4' },
  { index: 41, name: 'Swing', signature: '4/4' },
  { index: 42, name: 'Shuffle', signature: '3/4' },
  { index: 43, name: 'Shuffle 3/4', signature: '3/4' },
  { index: 44, name: 'Bluegrass', signature: '4/4' },
  { index: 45, name: 'Country', signature: '4/4' },
  { index: 46, name: 'Country Folk', signature: '4/4' },
  { index: 47, name: 'Pop 1', signature: '4/4' },
  { index: 48, name: 'Pop 2', signature: '4/4' },
  { index: 49, name: 'Pop 3', signature: '4/4' },
  { index: 50, name: 'Hip Hop 1', signature: '4/4' },
  { index: 51, name: 'Hip Hop 2', signature: '4/4' },
  { index: 52, name: 'Hip Hop 3', signature: '4/4' },
  { index: 53, name: 'Hip Hop Rock', signature: '4/4' },
  { index: 54, name: 'Pub', signature: '4/4' },
  { index: 55, name: 'Jazz 1', signature: '4/4' },
  { index: 56, name: 'Jazz 2', signature: '4/4' },
  { index: 57, name: 'Jazz 3', signature: '4/4' },
  { index: 58, name: 'Jazz 4', signature: '4/4' },
  { index: 59, name: 'Bossanova 1', signature: '4/4' },
  { index: 60, name: 'Bossanova 2', signature: '4/4' },
  { index: 61, name: 'Fusion', signature: '4/4' },
  { index: 62, name: 'Electro1', signature: '4/4' },
  { index: 63, name: 'Electro2', signature: '4/4' },
  { index: 64, name: 'Techno', signature: '4/4' },
  { index: 65, name: 'TripHop', signature: '4/4' },
  { index: 66, name: 'Electronic Pop', signature: '4/4' },
  { index: 67, name: 'Break Beat', signature: '4/4' },
  { index: 68, name: 'Drum&Bass', signature: '4/4' },
  { index: 69, name: 'Latin 1', signature: '4/4' },
  { index: 70, name: 'Latin 2', signature: '4/4' },
  { index: 71, name: 'Latin 3', signature: '4/4' },
  { index: 72, name: 'Latin Pop 1', signature: '4/4' },
  { index: 73, name: 'Latin Pop 2', signature: '4/4' },
  { index: 74, name: 'Samba', signature: '4/4' },
  { index: 75, name: 'Tango', signature: '4/4' },
  { index: 76, name: 'Beguine', signature: '4/4' },
  { index: 77, name: 'Ska', signature: '4/4' },
  { index: 78, name: 'Polka', signature: '2/4' },
  { index: 79, name: 'Waltz', signature: '3/4' },
  { index: 80, name: 'Reggae 1', signature: '4/4' },
  { index: 81, name: 'Reggae 2', signature: '4/4' },
  { index: 82, name: 'Mazuke', signature: '3/4' },
  { index: 83, name: 'Musette', signature: '4/4' },
  { index: 84, name: 'March 1', signature: '4/4' },
  { index: 85, name: 'March 2', signature: '4/4' },
  { index: 86, name: 'March 3', signature: '4/4' },
  { index: 87, name: 'New Age 1', signature: '4/4' },
  { index: 88, name: 'New Age 2', signature: '4/4' },
  { index: 89, name: 'World', signature: '4/4' },
  { index: 90, name: '1/4', signature: '1/4' },
  { index: 91, name: '2/4', signature: '2/4' },
  { index: 92, name: '3/4', signature: '3/4' },
  { index: 93, name: '4/4', signature: '4/4' },
  { index: 94, name: '5/4', signature: '5/4' },
  { index: 95, name: '6/4', signature: '6/4' },
  { index: 96, name: '7/4', signature: '7/4' },
  { index: 97, name: '6/8', signature: '6/8' },
  { index: 98, name: '7/8', signature: '7/8' },
  { index: 99, name: '8/9', signature: '8/9' },
];

export interface DrumRhythmGroup {
  label: string;
  rhythms: DrumRhythm[];
}

/** Family label: strip a trailing space-separated variant number
 *  ("Classic Rock 1" → "Classic Rock"). Names like "Rock 5/4" or the pure
 *  meters ("3/4") are left intact because the digits follow a slash, not a
 *  space. Computed live from DRUM_RHYTHMS (ampCategories convention). */
function rhythmFamily(name: string): string {
  return name.replace(/ \d+$/, '');
}

/** Group the table into select-friendly families, in table order. */
export function groupDrumRhythms(): DrumRhythmGroup[] {
  const groups: DrumRhythmGroup[] = [];
  const groupsByLabel = new Map<string, DrumRhythmGroup>();
  for (const rhythm of DRUM_RHYTHMS) {
    const label = rhythmFamily(rhythm.name);
    const existing = groupsByLabel.get(label);
    if (existing) {
      existing.rhythms.push(rhythm);
      continue;
    }
    const group: DrumRhythmGroup = { label, rhythms: [rhythm] };
    groupsByLabel.set(label, group);
    groups.push(group);
  }
  return groups;
}
