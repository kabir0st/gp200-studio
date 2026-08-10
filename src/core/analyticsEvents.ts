// The GA4 event taxonomy: names, param shapes, and the helpers that keep
// continuous or unbounded values out of GA4 dimensions. No transport lives here
// (see analytics.ts), so this module is pure and testable on its own.
//
// GA4 limits respected below:
//   • ≤ 500 distinct event names per property     → this file defines 12
//   • event name ≤ 40 chars, [a-z][a-z0-9_]*      → enforced by the union type
//   • ≤ 25 params per event                       → analytics.ts truncates at 24
//   • param name ≤ 40 chars, value ≤ 100 chars    → analytics.ts clamps both
//   • ≤ 50 event-scoped custom dimensions         → the params below reuse 13 names
//
// Cardinality rule, enforced by the shapes here: never send free text the user
// typed or a filename. No patch name, no author, no MIDI port name, no imported
// file name. Every string param is either a closed union or passed through a
// bucketing helper below.

/** Drawers (desktop) and tabs/sheets (mobile), normalised to one vocabulary so
 *  the two editor trees report into a single comparable `panel_open` metric. */
export type PanelId =
  | 'fxloop'
  /** Consolidated per-patch settings drawer/sheet (EXP + CTRL + bulk apply);
   *  replaced the separate 'exp' and 'ctrl' panels 2026-08-09. */
  | 'patch'
  | 'looper'
  | 'drums'
  | 'remote'
  | 'patch_manager'
  | 'slot_browser'
  | 'patch_meta';

export type UiMode = 'desktop' | 'phone';

/** How the editor was entered , the headline question this whole module exists
 *  to answer: do people arrive with a real GP-200 attached, or open it blank? */
export type EditorEntry = 'device' | 'blank' | 'import' | 'slot';

export type MobileTabId = 'chain' | 'patches' | 'loop' | 'drums' | 'device';

export interface AnalyticsParams {
  app_open: { ui_mode: UiMode; webmidi: boolean };
  view_change: { view: 'landing' | 'board' | 'guide' };

  connect_start: { retry: boolean };
  connect_success: { firmware: string; firmware_ok: boolean; ms_bucket: string };
  connect_error: { stage: 'connect' | 'handshake'; reason: string };

  editor_open: { entry: EditorEntry; ui_mode: UiMode };

  panel_open: { panel: PanelId; ui_mode: UiMode };
  nav_tab: { tab: MobileTabId };

  preset_import: { target: 'editor' | 'slot'; ok: boolean };
  preset_export: { scope: 'editor' | 'slot' | 'bulk' };
  /** Bulk CTRL/volume write across many slots. `done` = patches written. */
  bulk_apply: { ok: boolean; done?: number; cancelled?: boolean };

  // ── Looper + drums usage ────────────────────────────────────────────────
  // panel_open only says a drawer was opened. These say the feature was used.
  //
  // The browser loop station is gated on microphone capture, so its funnel is
  //   panel_open(looper) → audio_capture → looper_record → looper_first_loop
  // and every step can drop. audio_capture in particular is invisible without
  // this event: a denied permission kills the feature outright.
  /** Microphone capture settled. `ok:false` means the loop station cannot work. */
  audio_capture: { ok: boolean };
  /** A take was started. `tracks` is the layer count at that moment, so the
   *  distribution answers "do people stack loops or record one and stop?". */
  looper_record: { tracks: number };
  /** First take that actually landed, once per session , the activation metric.
   *  The gap between looper_record and this is the real-world failure rate. */
  looper_first_loop: { ui_mode: UiMode };
  /** Backing track imported. `ext` is the file extension only , never the name. */
  looper_import_audio: { ok: boolean; ext: string };
  /** A footswitch was successfully bound to a looper action (MIDI learn). */
  looper_learn_bound: { action: string };
  /** A bound footswitch actually drove the looper. Deduped per action per
   *  session: this measures whether hands-free control gets used at all, and
   *  keeps a long jam from flooding the event budget. */
  looper_footswitch: { action: string };
  /** Practice drum machine started playing. */
  drums_start: { kit: string; pattern: string; bpm_bucket: string };
  /** The GP-200's OWN hardware looper (MIDI CC), distinct from the browser
   *  loop station it nests under. Fire-and-forget, so this is press-intent. */
  device_looper_record: { connected: boolean };

  guide_read: { sections_seen: number; deepest: string; dwell_bucket: string };

  session_summary: {
    ui_mode: UiMode;
    connected: boolean;
    panels: number;
    /** Reached the point of recording a loop / starting the drums, not merely
     *  opening the panel , lets you cohort ("do people who connect also loop?")
     *  without joining across events. */
    looper_used: boolean;
    drums_used: boolean;
    dwell_bucket: string;
  };
}

export type AnalyticsEvent = keyof AnalyticsParams;

/** Coarse duration buckets. A raw millisecond count would make an unbounded
 *  dimension; seven buckets stay readable in a GA4 report. */
export function msBucket(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  if (ms < 1_000) return '<1s';
  if (ms < 3_000) return '1-3s';
  if (ms < 10_000) return '3-10s';
  if (ms < 30_000) return '10-30s';
  if (ms < 120_000) return '30s-2m';
  if (ms < 600_000) return '2-10m';
  return '10m+';
}

/** Tempo buckets, same reasoning as msBucket: raw BPM is a continuous value and
 *  would make an unbounded dimension out of the drum machine's 40–300 range. */
export function bpmBucket(bpm: number): string {
  if (!Number.isFinite(bpm)) return 'unknown';
  if (bpm < 80) return '<80';
  if (bpm < 100) return '80-99';
  if (bpm < 130) return '100-129';
  if (bpm < 160) return '130-159';
  return '160+';
}

/** File extension only, lowercased and clamped. Never the filename itself. */
export function fileExt(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0 || dot === filename.length - 1) return 'none';
  return filename.slice(dot + 1).toLowerCase().slice(0, 8);
}

/** Collapse a thrown error into a bounded enum. Without this an unexpected
 *  browser error string becomes a new dimension value on every occurrence. */
export function errorCode(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('timeout') || m.includes('timed out')) return 'timeout';
  if (m.includes('not supported') || m.includes('requestmidiaccess')) return 'no_webmidi';
  if (m.includes('permission') || m.includes('denied')) return 'permission';
  if (m.includes('no gp-200') || m.includes('not found')) return 'device_not_found';
  if (m.includes('handshake')) return 'handshake';
  if (m.includes('decode') || m.includes('parse') || m.includes('invalid')) return 'bad_file';
  return 'other';
}
