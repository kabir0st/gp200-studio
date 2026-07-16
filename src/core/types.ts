import { z } from 'zod';

export const EffectSlotSchema = z.object({
  slotIndex: z.number().int().min(0).max(10), // GP-200 has 11 slots (0–10)
  effectId: z.number().int().min(0).max(0xFFFFFFFF), // LE uint32 effect code
  enabled: z.boolean(),
  /** Effect parameters: 15 x float32 LE values per slot */
  params: z.array(z.number()).length(15),
});

export const GP200PresetSchema = z.object({
  version: z.string(),
  patchName: z.string().max(16), // .prst offset 0x44, 16 bytes null-terminated
  author: z.string().max(16).optional(), // .prst offset 0x54, 16 bytes null-terminated
  effects: z.array(EffectSlotSchema).length(11), // GP-200 always has exactly 11 slots
  checksum: z.number().int().min(0).max(65535), // BE uint16 at end of file
  /** FX-loop SEND insertion point. 1 = between PRE(0) and WAH(1). Range 1..10. */
  fxLoopSend: z.number().int().min(1).max(10).default(4),
  /** FX-loop RETURN insertion point. 1..10. Invariant SEND <= RETURN enforced at mutation points, not in the schema. */
  fxLoopReturn: z.number().int().min(1).max(10).default(4),
  /**
   * Original raw file bytes (1224 or 1176). When present, the encoder uses
   * this as the starting buffer and overwrites only the fields the editor
   * models (name, author, effect blocks, routing, checksum). Everything else
   * — controller/EXP assignments, pre-name metadata, routing header extras
   * — round-trips byte-exact. Absent for synthetically-built presets (HLX
   * import, tests); the encoder then builds a buffer from scratch.
   */
  rawSource: z.instanceof(Uint8Array).optional(),
});

export type EffectSlot = z.infer<typeof EffectSlotSchema>;
export type GP200Preset = z.infer<typeof GP200PresetSchema>;
