/**
 * Strips the NN-[A-D] slot/bank prefix that the GP-200 prepends to user
 * preset names (reflecting the device slot where the preset was last stored).
 *
 * The prefix is meaningless once the file lives in a library — it adds noise
 * to listings. The regex requires trailing whitespace so literal names like
 * "05-DAwesome" (no space) are left untouched.
 *
 * Applied only in the ingest pipeline. Regular user uploads keep their
 * original names.
 */
const SLOT_PREFIX_RE = /^\d{1,2}-[A-D]\s+/;

export function normalizePresetName(raw: string): string {
  return raw.trim().replace(SLOT_PREFIX_RE, '').trim();
}
