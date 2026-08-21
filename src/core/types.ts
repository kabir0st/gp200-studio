import { z } from 'zod';

export const EffectSlotSchema = z.object({
  slotIndex: z.number().int().min(0).max(10), // GP-200 has 11 slots (0–10)
  effectId: z.number().int().min(0).max(0xFFFFFFFF), // LE uint32 effect code
  enabled: z.boolean(),
  /** Effect parameters: 15 x float32 LE values per slot */
  params: z.array(z.number()).length(15),
});

/**
 * One EXP pedal assignment record (.prst tail, TLV type 0x000C).
 * The GP-200 has 3 EXP pages (0=EXP1 Mode A, 1=EXP1 Mode B, 2=EXP2), each
 * with 3 assignable "Para" items: 9 records per preset, saved with the patch.
 */
export const ExpAssignmentSchema = z.object({
  page: z.number().int().min(0).max(2),
  item: z.number().int().min(0).max(2),
  /** Block byte the assigned param lives in. 0..10 = modeled fixed blocks
   *  (PRE..VOL); 11..254 = an unmodeled/special target (e.g. Patch Volume/Tempo
   *  in the official editor), kept verbatim so it round-trips; null = 0xFF
   *  (unassigned). Only 0..10 render as a pedal in the EXP panel. */
  blockIndex: z.number().int().min(0).max(254).nullable(),
  /** u16 in the file. Effect params are 0..14; special targets (Patch Volume/
   *  Tempo in the official editor) may use values beyond that. Don't clamp. */
  paramIndex: z.number().int().min(0).max(0xFFFF),
  min: z.number(),
  max: z.number(),
});

/**
 * One CTRL footswitch assignment record (.prst tail, TLV type 0x000F).
 * Each of the 8 CTRL footswitches stores a 12-bit mask: bit n toggles the
 * fixed effect block n (0=PRE..10=VOL), bit 11 the FX loop. Saved with the
 * patch.
 */
export const CtrlAssignmentSchema = z.object({
  ctrlIndex: z.number().int().min(0).max(7),
  /** Full u16 mask kept verbatim so unknown high bits round-trip; bits 0..10
   *  (PRE..VOL) and bit 11 (FX LOOP) map to cards in the footswitch panel. */
  blockMask: z.number().int().min(0).max(0xFFFF),
  /**
   * The switch's saved toggle position (record payload+1). Not editable in the
   * app , but the live-write frame (`SysExCodec.buildCtrlAssignment`) carries
   * it, so it has to be modeled: sending the wrong value would flip the
   * switch's stored on/off position on the device. Optional so presets built
   * before this field (and `defaultCtrlAssignments()`) stay valid; treat
   * absent as 0.
   */
  state: z.number().int().min(0).max(1).optional(),
});

export const GP200PresetSchema = z.object({
  version: z.string(),
  patchName: z.string().max(16), // .prst offset 0x44, 16 bytes null-terminated
  author: z.string().max(16).optional(), // .prst offset 0x54, 16 bytes null-terminated
  effects: z.array(EffectSlotSchema).length(11), // GP-200 always has exactly 11 slots
  checksum: z.number().int().min(0).max(65535), // BE uint16 at end of file
  /** FX-loop SEND insertion point. 1 = between PRE(0) and WAH(1). Range 1..11,
   *  where 11 sits after the last block (the 4-cable-method position). */
  fxLoopSend: z.number().int().min(1).max(11).default(4),
  /** FX-loop RETURN insertion point. 1..11. Invariant SEND <= RETURN enforced at mutation points, not in the schema. */
  fxLoopReturn: z.number().int().min(1).max(11).default(4),
  /** FX-loop routing mode, .prst bytes 0x42-0x43 (u16 LE). 0 = parallel, 1 = serial. */
  fxLoopMode: z.number().int().min(0).max(1).default(0),
  /** Per-patch master volume (0..100), .prst byte 0x38. Distinct from the VOL
   *  effect block's own Volume knob. The field is a u16 LE like its neighbours,
   *  but the value never exceeds 100, so the low byte alone is read and written
   *  and byte 0x39 is left untouched. */
  patchVolume: z.number().int().min(0).max(100).default(50),
  /** Per-patch pan, .prst bytes 0x3A-0x3B (s16 LE). 0 = center, negative = L,
   *  positive = R (deck exposes L50..R50). */
  patchPan: z.number().int().min(-50).max(50).default(0),
  /** Per-patch style/genre tag, .prst bytes 0x3C-0x3D (u16 LE). Index into
   *  PATCH_STYLES (patchStyles.ts); 0 = none. Metadata only, but the pedal and
   *  the official editor both display it. */
  patchStyle: z.number().int().min(0).max(0xFFFF).default(0),
  /** Per-patch free-text note, .prst offset 0x64, 40 bytes null-terminated.
   *  Surfaced by the official editor; carried here so it survives a round trip
   *  and can be edited. */
  patchNote: z.string().max(40).optional(),
  /** Per-patch tempo in BPM, .prst bytes 0x36-0x37 (u16 LE). */
  patchTempo: z.number().int().min(0).max(0xFFFF).default(120),
  /**
   * Target patch slot, 0..255 = (bank-1)*4 + letter (A=0..D=3). Stored in the
   * .prst at byte 0x34 (and mirrored at 0x90). Genuine files carry the slot the
   * patch belongs to; the Valeton editor uses it when writing to the device, so
   * an export left at 0 lands on slot 01-A instead of the chosen slot. Absent
   * for synthetic presets (blank editor) until the user picks one.
   */
  slotIndex: z.number().int().min(0).max(255).optional(),
  /**
   * Original raw file bytes (1224 or 1176). When present, the encoder uses
   * this as the starting buffer and overwrites only the fields the editor
   * models (name, author, effect blocks, routing, checksum). Everything else
   * (controller/EXP assignments, pre-name metadata, routing header extras)
   * round-trips byte-exact. Absent for synthetically-built presets (blank
   * editor, tests); the encoder then builds a buffer from scratch.
   */
  rawSource: z.instanceof(Uint8Array).optional(),
  /**
   * EXP pedal assignments decoded from the .prst tail records (see
   * controlRecords.ts). Absent when the tail couldn't be parsed (factory
   * 1176-byte files, malformed tails); the raw bytes still round-trip
   * via rawSource.
   */
  expAssignments: z.array(ExpAssignmentSchema).length(9).optional(),
  /** CTRL 1–8 footswitch assignments decoded from the .prst tail records. */
  ctrlAssignments: z.array(CtrlAssignmentSchema).length(8).optional(),
});

export type EffectSlot = z.infer<typeof EffectSlotSchema>;
export type ExpAssignment = z.infer<typeof ExpAssignmentSchema>;
export type CtrlAssignment = z.infer<typeof CtrlAssignmentSchema>;
export type GP200Preset = z.infer<typeof GP200PresetSchema>;
