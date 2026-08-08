import { useCallback, useEffect, useRef } from 'react';
import { setAnalyticsContext, track, trackOnce } from '@/core/analytics';
import {
  bpmBucket,
  errorCode,
  msBucket,
  type EditorEntry,
  type PanelId,
  type UiMode,
} from '@/core/analyticsEvents';
import type { UseMidiDeviceReturn } from '@/hooks/useMidiDevice';

/**
 * Every analytics signal that is a *reaction to state* rather than a reaction
 * to a click. App keeps only the imperative call sites (a handler ran → track
 * it); the transitions live here so App.tsx doesn't grow eight more effects.
 *
 * Deriving the connect funnel from `status` rather than from the connect button
 * matters: `status` is set from seven places in useMidiDevice including the
 * handshake timeout and the auto-reconnect retry, so a transition effect counts
 * outcomes the button handler never sees. It also avoids the "button clicked
 * but the state never changed" mismatch a click-based funnel is prone to.
 */

export interface EngagementTracking {
  /** Record *why* the editor is about to open. Called by the handler that
   *  causes it; read by the effect that observes `hasPreset` flip. */
  markEditorEntry: (entry: EditorEntry) => void;
  /** Deduped per panel per session — the useful signal for a drawer is whether
   *  anyone ever found it, not how many times one person reopened it. */
  trackPanelOpen: (panel: PanelId) => void;
}

interface Args {
  status: UseMidiDeviceReturn['status'];
  deviceInfo: UseMidiDeviceReturn['deviceInfo'];
  errorMessage: UseMidiDeviceReturn['errorMessage'];
  hasPreset: boolean;
  isPhone: boolean;
  /** Microphone capture state — the hard gate on the whole loop station. */
  audioActive: boolean;
  audioError: string | null;
  /** Loop station depth; 0 → ≥1 is the activation moment. */
  looperTrackCount: number;
  drumsPlaying: boolean;
  drumKit: string;
  drumPattern: string;
  drumBpm: number;
}

export function useEngagementTracking({
  status,
  deviceInfo,
  errorMessage,
  hasPreset,
  isPhone,
  audioActive,
  audioError,
  looperTrackCount,
  drumsPlaying,
  drumKit,
  drumPattern,
  drumBpm,
}: Args): EngagementTracking {
  const uiMode: UiMode = isPhone ? 'phone' : 'desktop';

  // Refs, not state: these feed events, and nothing here may cause a re-render.
  const uiModeRef = useRef(uiMode);
  uiModeRef.current = uiMode;
  const entryRef = useRef<EditorEntry>('blank');
  const connectStartedAt = useRef<number | null>(null);
  const prevStatus = useRef(status);
  const openedAt = useRef(Date.now());
  const panelsSeen = useRef(new Set<PanelId>());
  const everConnected = useRef(false);
  const everLooped = useRef(false);
  const everDrummed = useRef(false);
  const prevDrumsPlaying = useRef(drumsPlaying);

  const markEditorEntry = useCallback((entry: EditorEntry) => {
    entryRef.current = entry;
  }, []);

  const trackPanelOpen = useCallback((panel: PanelId) => {
    panelsSeen.current.add(panel);
    trackOnce(`panel:${panel}`, 'panel_open', { panel, ui_mode: uiModeRef.current });
  }, []);

  // Session context + app_open. Empty deps: strictly once per page load.
  useEffect(() => {
    const webmidi = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
    setAnalyticsContext({ ui_mode: uiModeRef.current, webmidi });
    track('app_open', { ui_mode: uiModeRef.current, webmidi });
  }, []);

  // Connect funnel, driven off the status transition.
  useEffect(() => {
    const from = prevStatus.current;
    prevStatus.current = status;
    if (from === status) return;

    if (status === 'connecting') {
      connectStartedAt.current = Date.now();
      return;
    }
    if (status === 'connected') {
      everConnected.current = true;
      const started = connectStartedAt.current;
      connectStartedAt.current = null;
      track('connect_success', {
        // firmwareValues is a small numeric tuple from the device identity
        // response — a bounded set, safe as a dimension.
        firmware: deviceInfo?.firmwareValues.join('.') ?? 'unknown',
        firmware_ok: deviceInfo?.versionAccepted ?? false,
        ms_bucket: started === null ? 'unknown' : msBucket(Date.now() - started),
      });
      return;
    }
    if (status === 'error') {
      connectStartedAt.current = null;
      track('connect_error', {
        // `from` distinguishes "never reached the device" from "reached it but
        // the handshake failed" — the two halves of the funnel leak.
        stage: from === 'handshaking' ? 'handshake' : 'connect',
        reason: errorCode(errorMessage ?? ''),
      });
    }
  }, [status, deviceInfo, errorMessage]);

  // The headline event: the editor opened, and by which route.
  useEffect(() => {
    if (!hasPreset) return;
    track('editor_open', { entry: entryRef.current, ui_mode: uiModeRef.current });
  }, [hasPreset]);

  // Microphone capture settled. Without this the loop station funnel has an
  // invisible step: a denied prompt makes every later looper event impossible,
  // and the drop would otherwise look like disinterest rather than a blocker.
  useEffect(() => {
    if (audioActive) trackOnce('audio', 'audio_capture', { ok: true });
    else if (audioError !== null) trackOnce('audio', 'audio_capture', { ok: false });
  }, [audioActive, audioError]);

  // A take actually landed. looper_record says someone pressed record; this says
  // it worked, so the gap between the two is the real failure rate.
  useEffect(() => {
    if (looperTrackCount === 0) return;
    everLooped.current = true;
    trackOnce('looper:first', 'looper_first_loop', { ui_mode: uiModeRef.current });
  }, [looperTrackCount]);

  // Drums went from stopped to playing. Guarded on the transition, so the extra
  // deps (kit/pattern/bpm, which the event needs) can't re-fire it.
  useEffect(() => {
    const was = prevDrumsPlaying.current;
    prevDrumsPlaying.current = drumsPlaying;
    if (was || !drumsPlaying) return;
    everDrummed.current = true;
    track('drums_start', {
      kit: drumKit,
      pattern: drumPattern,
      bpm_bucket: bpmBucket(drumBpm),
    });
  }, [drumsPlaying, drumKit, drumPattern, drumBpm]);

  // One rollup row per session, so cohort questions ("do people who connect
  // also open the looper?") don't need an event-level join.
  useEffect(() => {
    let sentSummary = false;
    const send = () => {
      if (sentSummary) return;
      sentSummary = true;
      track('session_summary', {
        ui_mode: uiModeRef.current,
        connected: everConnected.current,
        panels: panelsSeen.current.size,
        looper_used: everLooped.current,
        drums_used: everDrummed.current,
        dwell_bucket: msBucket(Date.now() - openedAt.current),
      });
    };
    // pagehide is the reliable terminal signal on desktop; iOS Safari can skip
    // it when the tab is backgrounded and never restored, so listen for both.
    // gtag.js sends GA4 events via sendBeacon, so a hidden document still ships.
    const onHidden = () => {
      if (document.visibilityState === 'hidden') send();
    };
    window.addEventListener('pagehide', send);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', send);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, []);

  return { markEditorEntry, trackPanelOpen };
}
