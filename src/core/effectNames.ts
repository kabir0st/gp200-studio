/**
 * GP-200 Effect ID → Name lookup table.
 *
 * Extracted from the official Valeton GP-200 algorithm.xml.
 * The effect code is a 32-bit value stored as LE uint32 at offset +8 in each
 * 72-byte effect block. The high byte loosely encodes the module category:
 *
 *   0x00 = PRE/NR (low codes)   0x01 = PRE/EQ/MOD   0x03 = DST
 *   0x04 = MOD                  0x05 = WAH           0x06 = VOL
 *   0x07 = AMP                  0x08 = AMP (extra)   0x0A = CAB
 *   0x0B = DLY                  0x0C = RVB           0x0F = SnapTone
 */

export interface EffectInfo {
  /** Display name as shown in the GP-200 editor software */
  name: string;
  /** Module category: PRE, DST, WAH, EQ, MOD, AMP, NR, CAB, DLY, RVB, VOL */
  module: string;
}

/**
 * Maps a 32-bit effect code to its display name and module category.
 * Codes come from the `Code` attribute in the GP-200 algorithm.xml.
 * When a code appears in multiple Catalogs (e.g. boost pedals in both PRE
 * and DST), the first occurrence determines the module stored here.
 */
export const EFFECT_MAP: Record<number, EffectInfo> = {
  // ── PRE (0x00) ─────────────────────────────────────────────────────
  0: { name: 'COMP', module: 'PRE' },
  1: { name: 'COMP4', module: 'PRE' },
  3: { name: 'S-Comp', module: 'PRE' },
  10: { name: 'AC Boost', module: 'PRE' },
  11: { name: 'B-Boost', module: 'PRE' },
  12: { name: 'P-Boost', module: 'PRE' },
  14: { name: '14 Boost', module: 'PRE' },
  20: { name: 'Micro Boost', module: 'PRE' },
  25: { name: 'FAT BB', module: 'PRE' },
  26: { name: 'Boost', module: 'PRE' },

  // ── NR (0x00) ──────────────────────────────────────────────────────
  27: { name: 'Gate 1', module: 'NR' },
  29: { name: 'Gate 2', module: 'NR' },
  33: { name: 'Gate 3', module: 'NR' },

  // ── PRE / EQ / MOD (0x01) ──────────────────────────────────────────
  16777216: { name: 'AC Refiner', module: 'PRE' },   // 0x01000000
  16777217: { name: 'AC Sim', module: 'PRE' },        // 0x01000001
  16777231: { name: 'T-Wah', module: 'PRE' },         // 0x0100000F
  16777237: { name: 'A-WAH', module: 'PRE' },         // 0x01000015
  16777241: { name: 'Step Filter', module: 'PRE' },   // 0x01000019
  16777249: { name: 'OCTA', module: 'PRE' },           // 0x01000021
  16777251: { name: 'Pitch', module: 'PRE' },          // 0x01000023
  16777252: { name: 'P-Bend', module: 'PRE' },         // 0x01000024
  16777257: { name: 'Detune', module: 'MOD' },         // 0x01000029
  16777262: { name: 'Bit Smash', module: 'MOD' },      // 0x0100002E
  16777263: { name: 'Ring Mod', module: 'PRE' },       // 0x0100002F
  16777267: { name: 'Saturate', module: 'PRE' },       // 0x01000033
  16777269: { name: 'Guitar EQ 1', module: 'EQ' },    // 0x01000035
  16777270: { name: 'Guitar EQ 2', module: 'EQ' },    // 0x01000036
  16777273: { name: 'Bass EQ 1', module: 'EQ' },      // 0x01000039
  16777274: { name: 'Bass EQ 2', module: 'EQ' },      // 0x0100003A
  16777276: { name: 'Mess EQ', module: 'EQ' },        // 0x0100003C
  16777283: { name: 'Hyper EQ', module: 'EQ' },       // 0x01000043
  16777289: { name: 'Hammy', module: 'PRE' },          // 0x01000049
  16777293: { name: 'Harmonizer 1', module: 'PRE' },  // 0x0100004D
  16777294: { name: 'Harmonizer 2', module: 'PRE' },  // 0x0100004E

  // ── DST (0x03) ─────────────────────────────────────────────────────
  50331648: { name: 'Green OD', module: 'DST' },       // 0x03000000
  50331649: { name: 'OD 9', module: 'PRE' },           // 0x03000001
  50331650: { name: 'Yellow OD', module: 'PRE' },      // 0x03000002
  50331652: { name: 'Swarm', module: 'DST' },          // 0x03000004
  50331654: { name: 'Super OD', module: 'PRE' },       // 0x03000006
  50331656: { name: 'Scream OD', module: 'DST' },      // 0x03000008
  50331657: { name: 'Blues OD', module: 'PRE' },        // 0x03000009
  50331658: { name: 'Force', module: 'DST' },           // 0x0300000A
  50331659: { name: 'Tube', module: 'DST' },            // 0x0300000B
  50331662: { name: 'Blues Master', module: 'DST' },    // 0x0300000E
  50331663: { name: 'Master OD', module: 'DST' },      // 0x0300000F
  50331664: { name: 'TaiChi OD', module: 'DST' },      // 0x03000010
  50331668: { name: 'Penesas', module: 'PRE' },         // 0x03000014
  50331676: { name: 'Precise OD', module: 'DST' },     // 0x0300001C
  50331678: { name: 'Timmy OD', module: 'DST' },       // 0x0300001E
  50331682: { name: 'Lazaro', module: 'DST' },          // 0x03000022
  50331684: { name: 'Red Haze', module: 'DST' },        // 0x03000024
  50331686: { name: 'Sora Fuzz', module: 'DST' },       // 0x03000026
  50331689: { name: 'Plustortion', module: 'DST' },     // 0x03000029
  50331690: { name: 'SM Dist', module: 'DST' },         // 0x0300002A
  50331691: { name: 'Darktale', module: 'DST' },        // 0x0300002B
  50331693: { name: 'Chief', module: 'DST' },           // 0x0300002D
  50331694: { name: 'Master Dist', module: 'DST' },     // 0x0300002E
  50331696: { name: 'La Charger', module: 'DST' },      // 0x03000030
  50331698: { name: 'Revolt', module: 'DST' },          // 0x03000032
  50331711: { name: 'Flex OD', module: 'DST' },         // 0x0300003F
  50331712: { name: 'Bass OD', module: 'DST' },         // 0x03000040
  50331716: { name: 'Black Bass', module: 'DST' },      // 0x03000044
  50331728: { name: 'Empire OD', module: 'DST' },       // 0x03000050
  50331729: { name: 'Bass Hammer', module: 'DST' },     // 0x03000051
  50331730: { name: 'Flagman Dist', module: 'DST' },    // 0x03000052

  // ── MOD (0x04) ─────────────────────────────────────────────────────
  67108864: { name: 'A-Chorus', module: 'MOD' },       // 0x04000000
  67108865: { name: 'G-Chorus', module: 'MOD' },       // 0x04000001
  67108866: { name: 'C-Chorus', module: 'MOD' },       // 0x04000002
  67108872: { name: 'B-Chorus', module: 'MOD' },       // 0x04000008
  67108879: { name: 'M-Chorus', module: 'MOD' },       // 0x0400000F
  67108881: { name: 'Jet', module: 'MOD' },             // 0x04000011
  67108882: { name: 'B-Jet', module: 'MOD' },           // 0x04000012
  67108883: { name: 'N-Jet', module: 'MOD' },           // 0x04000013
  67108884: { name: 'Trem Jet', module: 'MOD' },        // 0x04000014
  67108885: { name: 'V-Roto', module: 'MOD' },          // 0x04000015
  67108886: { name: 'G-Roto', module: 'MOD' },          // 0x04000016
  67108887: { name: 'Vibrato', module: 'MOD' },         // 0x04000017
  67108888: { name: 'Vibrato T', module: 'MOD' },       // 0x04000018
  67108889: { name: 'O-Phase', module: 'MOD' },         // 0x04000019
  67108890: { name: 'G-Phase', module: 'MOD' },         // 0x0400001A
  67108891: { name: 'S-Phase', module: 'MOD' },         // 0x0400001B
  67108894: { name: 'Pan Phase', module: 'MOD' },       // 0x0400001E
  67108895: { name: 'M-Vibe', module: 'MOD' },          // 0x0400001F
  67108896: { name: 'Vibe', module: 'MOD' },             // 0x04000020
  67108897: { name: 'O-Trem', module: 'MOD' },           // 0x04000021
  67108902: { name: 'Sine Trem', module: 'MOD' },        // 0x04000026
  67108903: { name: 'Triangle Trem', module: 'MOD' },    // 0x04000027
  67108904: { name: 'Bias Trem', module: 'MOD' },        // 0x04000028
  67108909: { name: 'Auto Swell', module: 'PRE' },       // 0x0400002D
  67108911: { name: 'Hold', module: 'PRE' },              // 0x0400002F
  67108912: { name: 'Freeze', module: 'PRE' },            // 0x04000030

  // ── WAH (0x05) ─────────────────────────────────────────────────────
  83886081: { name: 'V-Wah', module: 'WAH' },           // 0x05000001
  83886086: { name: 'S-Wah', module: 'WAH' },           // 0x05000006
  83886087: { name: 'B-Wah', module: 'WAH' },           // 0x05000007
  83886088: { name: 'C-Wah', module: 'WAH' },           // 0x05000008
  83886090: { name: 'P-Wah', module: 'WAH' },           // 0x0500000A

  // ── VOL (0x06) ─────────────────────────────────────────────────────
  100663299: { name: 'Volume', module: 'VOL' },         // 0x06000003

  // ── AMP (0x07) ─────────────────────────────────────────────────────
  117440513: { name: 'Tweedy', module: 'AMP' },          // 0x07000001
  117440515: { name: 'Bellman 59N', module: 'AMP' },     // 0x07000003
  117440516: { name: 'Dark Twin', module: 'AMP' },       // 0x07000004
  117440517: { name: 'Dark DLX', module: 'AMP' },        // 0x07000005
  117440521: { name: 'Dark Vibra', module: 'AMP' },      // 0x07000009
  117440525: { name: 'Silver Twin', module: 'AMP' },     // 0x0700000D
  117440527: { name: 'SUPDual CL', module: 'AMP' },     // 0x0700000F
  117440528: { name: 'Foxy 15TB', module: 'AMP' },       // 0x07000010
  117440529: { name: 'Foxy 30N', module: 'AMP' },        // 0x07000011
  117440532: { name: 'J-120 CL', module: 'AMP' },        // 0x07000014
  117440533: { name: 'Match CL', module: 'AMP' },        // 0x07000015
  117440537: { name: 'L-Star CL', module: 'AMP' },       // 0x07000019
  117440538: { name: 'BogSV CL', module: 'AMP' },        // 0x0700001A
  117440539: { name: 'Z38 CL', module: 'AMP' },          // 0x0700001B
  117440543: { name: 'Knights CL', module: 'AMP' },      // 0x0700001F
  117440546: { name: 'Bad-KT CL', module: 'AMP' },       // 0x07000022
  117440547: { name: 'Solo100 CL', module: 'AMP' },      // 0x07000023
  117440548: { name: 'Bellman 59B', module: 'AMP' },     // 0x07000024
  117440551: { name: 'Foxy 30TB', module: 'AMP' },       // 0x07000027
  117440552: { name: 'SUPDual OD', module: 'AMP' },      // 0x07000028
  117440554: { name: 'UK 45', module: 'AMP' },            // 0x0700002A
  117440555: { name: 'UK 45+', module: 'AMP' },           // 0x0700002B
  117440556: { name: 'UK 45JP', module: 'AMP' },          // 0x0700002C
  117440557: { name: 'UK 50', module: 'AMP' },            // 0x0700002D
  117440558: { name: 'UK 50+', module: 'AMP' },           // 0x0700002E
  117440559: { name: 'UK 50JP', module: 'AMP' },          // 0x0700002F
  117440560: { name: 'UK SLP', module: 'AMP' },           // 0x07000030
  117440565: { name: 'UK 800', module: 'AMP' },           // 0x07000035
  117440569: { name: 'Mess2C+ 1', module: 'AMP' },       // 0x07000039
  117440570: { name: 'Mess2C+ 2', module: 'AMP' },       // 0x0700003A
  117440571: { name: 'Mess2C+ 3', module: 'AMP' },       // 0x0700003B
  117440573: { name: 'BogSV OD', module: 'AMP' },        // 0x0700003D
  117440574: { name: 'Juice30 OD', module: 'AMP' },      // 0x0700003E
  117440576: { name: 'Flagman 1', module: 'AMP' },       // 0x07000040
  117440577: { name: 'Flagman 2', module: 'AMP' },       // 0x07000041
  117440579: { name: 'Bog BlueV', module: 'AMP' },       // 0x07000043
  117440580: { name: 'Bog BlueM', module: 'AMP' },       // 0x07000044
  117440583: { name: 'Solo100 OD', module: 'AMP' },      // 0x07000047
  117440584: { name: 'Match OD', module: 'AMP' },        // 0x07000048
  117440585: { name: 'Z38 OD', module: 'AMP' },          // 0x07000049
  117440586: { name: 'L-Star OD', module: 'AMP' },       // 0x0700004A
  117440587: { name: 'Bad-KT OD', module: 'AMP' },       // 0x0700004B
  117440590: { name: 'UK 900', module: 'AMP' },           // 0x0700004E
  117440595: { name: 'Juice R100', module: 'AMP' },      // 0x07000053
  117440597: { name: 'Mess4 LD', module: 'AMP' },        // 0x07000055
  117440598: { name: 'Mess4 LD 2', module: 'AMP' },      // 0x07000056
  117440599: { name: 'Mess4 LD 3', module: 'AMP' },      // 0x07000057
  117440601: { name: 'Solo100 LD', module: 'AMP' },      // 0x07000059
  117440602: { name: 'EV 51', module: 'AMP' },            // 0x0700005A
  117440605: { name: 'Flagman+ 1', module: 'AMP' },      // 0x0700005D
  117440606: { name: 'Flagman+ 2', module: 'AMP' },      // 0x0700005E
  117440607: { name: 'Eagle 120', module: 'AMP' },        // 0x0700005F
  117440608: { name: 'Eagle 120+', module: 'AMP' },       // 0x07000060
  117440611: { name: 'Power LD', module: 'AMP' },         // 0x07000063
  117440613: { name: 'Dizz VH', module: 'AMP' },          // 0x07000065
  117440614: { name: 'Dizz VH S', module: 'AMP' },        // 0x07000066
  117440616: { name: 'Mess DualV', module: 'AMP' },       // 0x07000068
  117440617: { name: 'Mess DualM', module: 'AMP' },       // 0x07000069
  117440618: { name: 'Dizz VH+', module: 'AMP' },         // 0x0700006A
  117440619: { name: 'Dizz VH+ S', module: 'AMP' },       // 0x0700006B
  117440621: { name: 'Bog RedV', module: 'AMP' },         // 0x0700006D
  117440622: { name: 'Bog RedM', module: 'AMP' },         // 0x0700006E
  117440627: { name: 'Classic Bass', module: 'AMP' },     // 0x07000073
  117440629: { name: 'Foxy Bass', module: 'AMP' },        // 0x07000075
  117440631: { name: 'Mess Bass', module: 'AMP' },        // 0x07000077
  117440635: { name: 'Knights CL+', module: 'AMP' },     // 0x0700007B
  117440636: { name: 'Knights OD', module: 'AMP' },       // 0x0700007C

  // ── AMP extra (0x08) ───────────────────────────────────────────────
  134217845: { name: 'Mini Bass', module: 'AMP' },       // 0x08000075
  134217846: { name: 'Bass Pre', module: 'AMP' },         // 0x08000076
  134217850: { name: 'AC Pre', module: 'AMP' },           // 0x0800007A
  134217851: { name: 'AC Pre 2', module: 'AMP' },         // 0x0800007B

  // ── CAB (0x0A) ─────────────────────────────────────────────────────
  167772160: { name: 'SUP ZEP', module: 'CAB' },         // 0x0A000000
  167772161: { name: 'TWD CP', module: 'CAB' },           // 0x0A000001
  167772162: { name: 'TWD PRC', module: 'CAB' },          // 0x0A000002
  167772163: { name: 'DARK LUX', module: 'CAB' },         // 0x0A000003
  167772164: { name: 'DARK VIT', module: 'CAB' },         // 0x0A000004
  167772165: { name: 'ROUT', module: 'CAB' },              // 0x0A000005
  167772166: { name: 'BogSV', module: 'CAB' },            // 0x0A000006
  167772167: { name: 'Bad-KT', module: 'CAB' },           // 0x0A000007
  167772168: { name: 'FOXY 1', module: 'CAB' },           // 0x0A000008
  167772169: { name: 'D STAR', module: 'CAB' },           // 0x0A000009
  167772170: { name: 'TOM OPEN', module: 'CAB' },         // 0x0A00000A
  167772171: { name: 'TWD LUX', module: 'CAB' },          // 0x0A00000B
  167772172: { name: 'US STO', module: 'CAB' },           // 0x0A00000C
  167772173: { name: 'ACE', module: 'CAB' },               // 0x0A00000D
  167772174: { name: 'UK G12', module: 'CAB' },           // 0x0A00000E
  167772175: { name: 'FOXY 2', module: 'CAB' },           // 0x0A00000F
  167772176: { name: 'Match', module: 'CAB' },             // 0x0A000010
  167772177: { name: 'J-120', module: 'CAB' },             // 0x0A000011
  167772178: { name: 'Dark Twin', module: 'CAB' },        // 0x0A000012
  167772179: { name: 'UK GRN 1', module: 'CAB' },         // 0x0A000013
  167772180: { name: 'TWD SUP', module: 'CAB' },          // 0x0A000014
  167772181: { name: 'BOUTI', module: 'CAB' },             // 0x0A000015
  167772182: { name: 'Bellman 1', module: 'CAB' },         // 0x0A000016
  167772183: { name: 'SUP', module: 'CAB' },               // 0x0A000017
  167772184: { name: 'MATT TWD', module: 'CAB' },         // 0x0A000018
  167772185: { name: 'SUP Star', module: 'CAB' },         // 0x0A000019
  167772186: { name: 'Freed', module: 'CAB' },             // 0x0A00001A
  167772187: { name: 'Dark CS', module: 'CAB' },           // 0x0A00001B
  167772188: { name: 'DB Rock', module: 'CAB' },           // 0x0A00001C
  167772189: { name: 'Blue SK', module: 'CAB' },           // 0x0A00001D
  167772190: { name: 'Bellman 2', module: 'CAB' },         // 0x0A00001E
  167772191: { name: 'UK LD', module: 'CAB' },             // 0x0A00001F
  167772192: { name: 'UK TD', module: 'CAB' },             // 0x0A000020
  167772193: { name: 'UK MD', module: 'CAB' },             // 0x0A000021
  167772194: { name: 'UK GRN 2', module: 'CAB' },         // 0x0A000022
  167772195: { name: 'EV', module: 'CAB' },                 // 0x0A000023
  167772196: { name: 'Mess', module: 'CAB' },               // 0x0A000024
  167772197: { name: 'Bog', module: 'CAB' },                // 0x0A000025
  167772198: { name: 'Eagle', module: 'CAB' },              // 0x0A000026
  167772199: { name: 'Uban', module: 'CAB' },               // 0x0A000027
  167772200: { name: 'Solo', module: 'CAB' },               // 0x0A000028
  167772201: { name: 'Juice', module: 'CAB' },              // 0x0A000029
  167772202: { name: 'H-WAY', module: 'CAB' },             // 0x0A00002A
  167772203: { name: 'UK Dark', module: 'CAB' },           // 0x0A00002B
  167772204: { name: 'Way', module: 'CAB' },                // 0x0A00002C
  167772205: { name: 'Dumb', module: 'CAB' },               // 0x0A00002D
  167772206: { name: 'Dizz', module: 'CAB' },               // 0x0A00002E
  167772207: { name: 'TRP', module: 'CAB' },                // 0x0A00002F
  167772208: { name: 'UK 75', module: 'CAB' },              // 0x0A000030
  167772209: { name: 'King', module: 'CAB' },               // 0x0A000031
  167772210: { name: 'ADM 1', module: 'CAB' },              // 0x0A000032
  167772211: { name: 'Workman 1', module: 'CAB' },          // 0x0A000033
  167772212: { name: 'F-TOP', module: 'CAB' },              // 0x0A000034
  167772213: { name: 'US BASS', module: 'CAB' },            // 0x0A000035
  167772214: { name: 'MATT', module: 'CAB' },               // 0x0A000036
  167772215: { name: 'ADM 2', module: 'CAB' },              // 0x0A000037
  167772216: { name: 'AMPG 1', module: 'CAB' },             // 0x0A000038
  167772217: { name: 'Workman 2', module: 'CAB' },          // 0x0A000039
  167772218: { name: 'HACK', module: 'CAB' },               // 0x0A00003A
  167772219: { name: 'AMPG 2', module: 'CAB' },             // 0x0A00003B
  167772220: { name: 'AC', module: 'CAB' },                  // 0x0A00003C
  167772221: { name: 'AC Dream', module: 'CAB' },           // 0x0A00003D
  167772222: { name: 'OM', module: 'CAB' },                  // 0x0A00003E
  167772223: { name: 'JUMBO', module: 'CAB' },              // 0x0A00003F
  167772224: { name: 'Bird', module: 'CAB' },                // 0x0A000040
  167772225: { name: 'GA', module: 'CAB' },                  // 0x0A000041
  167772226: { name: 'Classic AC', module: 'CAB' },          // 0x0A000042
  167772227: { name: 'Mandolin', module: 'CAB' },            // 0x0A000043
  167772228: { name: 'Fretless Bass', module: 'CAB' },       // 0x0A000044
  167772229: { name: 'Double Bass', module: 'CAB' },         // 0x0A000045

  // ── CAB User IR (0x0A10) ───────────────────────────────────────────
  168820736: { name: 'User IR', module: 'CAB' },            // 0x0A100000
  168820737: { name: 'User IR', module: 'CAB' },            // 0x0A100001
  168820738: { name: 'User IR', module: 'CAB' },            // 0x0A100002
  168820739: { name: 'User IR', module: 'CAB' },            // 0x0A100003
  168820740: { name: 'User IR', module: 'CAB' },            // 0x0A100004
  168820741: { name: 'User IR', module: 'CAB' },            // 0x0A100005
  168820742: { name: 'User IR', module: 'CAB' },            // 0x0A100006
  168820743: { name: 'User IR', module: 'CAB' },            // 0x0A100007
  168820744: { name: 'User IR', module: 'CAB' },            // 0x0A100008
  168820745: { name: 'User IR', module: 'CAB' },            // 0x0A100009
  168820746: { name: 'User IR', module: 'CAB' },            // 0x0A10000A
  168820747: { name: 'User IR', module: 'CAB' },            // 0x0A10000B
  168820748: { name: 'User IR', module: 'CAB' },            // 0x0A10000C
  168820749: { name: 'User IR', module: 'CAB' },            // 0x0A10000D
  168820750: { name: 'User IR', module: 'CAB' },            // 0x0A10000E
  168820751: { name: 'User IR', module: 'CAB' },            // 0x0A10000F
  168820752: { name: 'User IR', module: 'CAB' },            // 0x0A100010
  168820753: { name: 'User IR', module: 'CAB' },            // 0x0A100011
  168820754: { name: 'User IR', module: 'CAB' },            // 0x0A100012
  168820755: { name: 'User IR', module: 'CAB' },            // 0x0A100013

  // ── DLY (0x0B) ─────────────────────────────────────────────────────
  184549376: { name: 'Pure', module: 'DLY' },               // 0x0B000000
  184549377: { name: 'Analog', module: 'DLY' },             // 0x0B000001
  184549378: { name: 'Tape', module: 'DLY' },               // 0x0B000002
  184549379: { name: 'Dual Echo', module: 'DLY' },          // 0x0B000003
  184549380: { name: 'Ping Pong', module: 'DLY' },          // 0x0B000004
  184549381: { name: 'Slapback', module: 'DLY' },           // 0x0B000005
  184549382: { name: 'Sweep Echo', module: 'DLY' },         // 0x0B000006
  184549385: { name: 'Ring Echo', module: 'DLY' },          // 0x0B000009
  184549387: { name: 'Tube', module: 'DLY' },               // 0x0B00000B
  184549388: { name: 'M-Echo', module: 'DLY' },             // 0x0B00000C
  184549389: { name: 'Sweet Echo', module: 'DLY' },         // 0x0B00000D
  184549394: { name: '999 Echo', module: 'DLY' },           // 0x0B000012
  184549396: { name: 'Vintage Rack', module: 'DLY' },       // 0x0B000014
  184549405: { name: 'BBD Delay S', module: 'DLY' },        // 0x0B00001D
  184549407: { name: 'Digital Delay S', module: 'DLY' },    // 0x0B00001F
  184549409: { name: 'Tape Delay S', module: 'DLY' },       // 0x0B000021
  184549414: { name: 'Lofi Echo', module: 'DLY' },          // 0x0B000026
  184549416: { name: 'Rev Echo', module: 'DLY' },           // 0x0B000028
  184549418: { name: 'Ambience 1', module: 'DLY' },         // 0x0B00002A
  184549422: { name: 'Ambience 2', module: 'DLY' },         // 0x0B00002E
  184549426: { name: 'Broken Delay', module: 'DLY' },       // 0x0B000032
  184549427: { name: 'Ice Delay', module: 'DLY' },          // 0x0B000033

  // ── RVB (0x0C) ─────────────────────────────────────────────────────
  201326592: { name: 'Room', module: 'RVB' },               // 0x0C000000
  201326593: { name: 'Hall', module: 'RVB' },               // 0x0C000001
  201326594: { name: 'Church', module: 'RVB' },             // 0x0C000002
  201326595: { name: 'Plate', module: 'RVB' },              // 0x0C000003
  201326596: { name: 'Spring', module: 'RVB' },             // 0x0C000004
  201326598: { name: 'N-Star', module: 'RVB' },             // 0x0C000006
  201326599: { name: 'Deepsea', module: 'RVB' },            // 0x0C000007
  201326600: { name: 'Sweet Space', module: 'RVB' },        // 0x0C000008
  201326601: { name: 'Shimmer', module: 'RVB' },            // 0x0C000009
  201326603: { name: 'Studio', module: 'RVB' },             // 0x0C00000B
  201326604: { name: 'Club', module: 'RVB' },               // 0x0C00000C
  201326605: { name: 'Concert', module: 'RVB' },            // 0x0C00000D
  201326606: { name: 'Arena', module: 'RVB' },              // 0x0C00000E
  201326609: { name: 'Amp Spring', module: 'RVB' },         // 0x0C000011
  201326610: { name: 'Tube Spring', module: 'RVB' },        // 0x0C000012

  // ── SnapTone (0x0F) ────────────────────────────────────────────────
  251658240: { name: 'SnapTone', module: 'AMP' },           // 0x0F000000
  251658241: { name: 'SnapTone', module: 'AMP' },           // 0x0F000001
  251658242: { name: 'SnapTone', module: 'AMP' },           // 0x0F000002
  251658243: { name: 'SnapTone', module: 'AMP' },           // 0x0F000003
  251658244: { name: 'SnapTone', module: 'AMP' },           // 0x0F000004
  251658245: { name: 'SnapTone', module: 'DST' },           // 0x0F000005
  251658246: { name: 'SnapTone', module: 'DST' },           // 0x0F000006
  251658247: { name: 'SnapTone', module: 'DST' },           // 0x0F000007
  251658248: { name: 'SnapTone', module: 'DST' },           // 0x0F000008
  251658249: { name: 'SnapTone', module: 'DST' },           // 0x0F000009
};

/** Returns the effect display name, or "Unknown (0xHEX)" for unmapped codes. */
export function getEffectName(effectId: number): string {
  return EFFECT_MAP[effectId]?.name ?? `Unknown (0x${effectId.toString(16).toUpperCase().padStart(8, '0')})`;
}

/** Returns the module category, or "Unknown" for unmapped codes. */
export function getModuleName(effectId: number): string {
  return EFFECT_MAP[effectId]?.module ?? 'Unknown';
}

/** Returns all effects for a given module type, sorted by name. */
export function getEffectsByModule(module: string): { effectId: number; name: string }[] {
  const results: { effectId: number; name: string }[] = [];
  for (const [id, info] of Object.entries(EFFECT_MAP)) {
    if (info.module === module) {
      results.push({ effectId: Number(id), name: info.name });
    }
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Module color system for the dark pedalboard UI.
 * Uses CSS custom properties for the main theme, with inline style overrides
 * for per-module accent colors (LED color, border glow).
 */
export const MODULE_COLORS: Record<string, { accent: string; accentDim: string; glow: string }> = {
  PRE:     { accent: '#d4a24e', accentDim: '#8a6a30', glow: 'rgba(212,162,78,0.12)' },
  WAH:     { accent: '#c876d4', accentDim: '#7a4a86', glow: 'rgba(200,118,212,0.12)' },
  DST:     { accent: '#d45050', accentDim: '#8a3030', glow: 'rgba(212,80,80,0.12)' },
  AMP:     { accent: '#e08040', accentDim: '#8a5028', glow: 'rgba(224,128,64,0.12)' },
  NR:      { accent: '#7a8a8a', accentDim: '#4a5a5a', glow: 'rgba(122,138,138,0.10)' },
  CAB:     { accent: '#50b878', accentDim: '#307850', glow: 'rgba(80,184,120,0.12)' },
  EQ:      { accent: '#50b8d4', accentDim: '#307888', glow: 'rgba(80,184,212,0.12)' },
  MOD:     { accent: '#5090e0', accentDim: '#305a8a', glow: 'rgba(80,144,224,0.12)' },
  DLY:     { accent: '#7070d8', accentDim: '#4848a0', glow: 'rgba(112,112,216,0.12)' },
  RVB:     { accent: '#9060c8', accentDim: '#604080', glow: 'rgba(144,96,200,0.12)' },
  VOL:     { accent: '#909090', accentDim: '#606060', glow: 'rgba(144,144,144,0.10)' },
};
