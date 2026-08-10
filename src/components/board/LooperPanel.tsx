import { useEffect, useRef, useState } from 'react';
import { useAudioEngine } from '@/components/AudioEngineProvider';
import type { LooperApi } from '@/hooks/useLooper';
import {
  LOOPER_ACTION_KINDS,
  type LooperBindings,
  type LooperActionKind,
  type ExpTarget,
} from '@/core/looperBindings';
import { Button } from '@/components/ui/Button';
import { Led } from '@/components/ui/Badge';
import { LooperTimeline } from '@/components/board/LooperTimeline';
import { track } from '@/core/analytics';
import { fileExt } from '@/core/analyticsEvents';
import type { LooperTriggerMap } from '@/core/looperTriggers';
import type { LearnNotice } from '@/hooks/useLooperTriggers';

/** Audio containers worth offering; the browser decodes whatever it supports. */
const IMPORT_ACCEPT = 'audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac';

interface LooperPanelProps {
  looper: LooperApi;
  bindings: LooperBindings;
  onBindingsChange: (next: LooperBindings) => void;
  /** enable the AUDIO IN capture: the looper needs the shared context running */
  onEnableAudio: () => void;
  audioStarting: boolean;
  /* MIDI-learn: assign a hardware stomp to each transport action */
  triggers: LooperTriggerMap;
  armedAction: LooperActionKind | null;
  onArmLearn: (action: LooperActionKind) => void;
  onClearTrigger: (action: LooperActionKind) => void;
  /** forget every assigned stomp at once */
  onClearAll: () => void;
  learnNotice: LearnNotice | null;
  /** learning needs a connected GP-200 */
  learnEnabled: boolean;
}

const SELECT_CLASS =
  'bg-bg-primary border border-border-active rounded px-2 py-1 ' +
  'font-mono-display text-caption text-text-secondary';

const ACTION_LABELS: Record<LooperActionKind, string> = {
  recordToggle: 'Record / Stop',
  playToggle: 'Play / Stop selected track',
  muteToggle: 'Mute / Unmute selected track',
  trackNext: 'Track +',
  trackPrev: 'Track -',
};

function fmtLength(sec: number | null): string {
  if (sec === null) return '- : -';
  return `${sec.toFixed(2)}s`;
}

/** "4 BARS · 8.00s (2.00s/bar)" , the whole length model in one line. */
function fmtCycle(bars: number, cycleSec: number | null, baseSec: number | null): string {
  if (cycleSec === null || baseSec === null) return 'no loop yet';
  const plural = bars === 1 ? '' : 'S';
  return `${bars} BAR${plural} · ${fmtLength(cycleSec)} (${fmtLength(baseSec)}/bar)`;
}

function learnLabel(armed: boolean, learned: boolean): string {
  if (armed) return '● STOMP NOW';
  if (learned) return 'REASSIGN';
  return 'ASSIGN STOMP';
}

function learnVariant(armed: boolean): 'danger' | 'secondary' {
  if (armed) return 'danger';
  return 'secondary';
}

function learnTitle(armed: boolean, learned: boolean, learnEnabled: boolean): string {
  if (!learnEnabled) return 'Connect the GP-200 to assign a stomp';
  if (armed) return 'Stomp any footswitch now (click to cancel)';
  if (learned) return 'Assigned , click to assign a different switch';
  return 'Click, then stomp any footswitch to assign it';
}

function assignStatus(armed: boolean, learned: boolean): string {
  if (armed) return 'waiting for stomp…';
  if (learned) return '✓ assigned';
  return 'not assigned';
}

function assignStatusClass(armed: boolean, learned: boolean): string {
  const base = 'font-mono-display text-caption';
  if (armed) return `${base} text-accent-red`;
  if (learned) return `${base} text-accent-amber`;
  return `${base} text-text-muted`;
}

function recordLabel(recording: boolean, armed: boolean): string {
  if (armed) return '◌ ARMED';
  if (recording) return '■ STOP REC';
  return '● REC';
}

function recordVariant(active: boolean): 'danger' | 'secondary' {
  if (active) return 'danger';
  return 'secondary';
}

function playAllLabel(anyPlaying: boolean): string {
  if (anyPlaying) return '■ STOP';
  return '▶ PLAY';
}

function trackRowClass(selected: boolean): string {
  const base =
    'flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border bg-bg-hover cursor-pointer';
  if (selected) return `${base} border-accent-amber`;
  return `${base} border-border-active`;
}

function playPauseLabel(state: string): string {
  if (state === 'playing') return 'Pause';
  return 'Play';
}

function muteVariant(muted: boolean): 'primary' | 'ghost' {
  if (muted) return 'primary';
  return 'ghost';
}

function expValue(target: ExpTarget): string {
  if (target === null) return 'none';
  if (target.kind === 'masterGain') return 'master';
  return 'selected';
}

export function LooperPanel({
  looper,
  bindings,
  onBindingsChange,
  onEnableAudio,
  audioStarting,
  triggers,
  armedAction,
  onArmLearn,
  onClearTrigger,
  onClearAll,
  learnNotice,
  learnEnabled,
}: LooperPanelProps) {
  const recBar = useRef<HTMLSpanElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Track gains keyed by dynamic track id; default 1 for new tracks.
  const [gains, setGains] = useState<Record<number, number>>({});
  const [importError, setImportError] = useState<string | null>(null);
  const { isRecording } = looper;
  const { active: audioActive, getLevels } = useAudioEngine();

  // Live input level while actively recording, so silence doesn't go
  // unnoticed , same rAF-driven read AudioMeters uses, gated to the
  // recording pass only.
  useEffect(() => {
    if (!isRecording || !audioActive) return;
    let raf = 0;
    const tick = () => {
      const { input } = getLevels();
      if (recBar.current) recBar.current.style.width = `${(input * 100).toFixed(1)}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isRecording, audioActive, getLevels]);

  const updateExpTarget = (target: ExpTarget) => {
    onBindingsChange({ ...bindings, expTarget: target });
  };

  const setTrackGain = (id: number, value: number) => {
    setGains((prev) => ({ ...prev, [id]: value }));
    looper.setTrackGain(id, value);
  };

  const handleImportPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset immediately so re-picking the SAME file still fires a change event.
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    const error = await looper.importAudioFile(file);
    setImportError(error);
    // Safe to instrument at the call site (unlike record): import has no
    // footswitch binding, so this is the only path in. Extension only , the
    // filename itself is user data and never leaves the browser.
    track('looper_import_audio', { ok: error === null, ext: fileExt(file.name) });
  };

  if (!looper.ready) {
    return (
      <div className="text-center py-6">
        <p className="font-mono-display text-caption text-text-muted mb-3">
          The loop station records the GP-200's USB audio here in the browser
          (separate from the pedal's built-in looper): import a backing track,
          then record guitar takes over it. Every take becomes its own track,
          and the loop grows to fit the longest one. Enable audio capture to
          start.
        </p>
        <Button onClick={onEnableAudio} disabled={audioStarting}>
          {audioStarting ? 'ENABLING…' : 'ENABLE AUDIO IN'}
        </Button>
      </div>
    );
  }

  const selectedPosition = looper.tracks.findIndex(
    (track) => track.id === looper.selectedTrack,
  );
  let trackReadout = '-/-';
  if (selectedPosition >= 0) {
    trackReadout = `${selectedPosition + 1}/${looper.tracks.length}`;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Collapsible primer on the dynamic-track workflow */}
      <details className="group">
        <summary
          className="font-mono-display text-label text-text-muted uppercase
            tracking-widest cursor-pointer select-none list-none"
        >
          <span className="group-open:hidden">▸ How the looper works</span>
          <span className="hidden group-open:inline">▾ How the looper works</span>
        </summary>
        <ul
          className="font-mono-display text-caption text-text-muted mt-2 pl-4
            flex flex-col gap-1 list-disc"
        >
          <li>
            Records the GP-200's USB audio here in the browser , separate from
            the pedal's built-in looper, which is the collapsed section at the
            bottom of this drawer.
          </li>
          <li>
            IMPORT loads a backing track and its length becomes one BAR , the
            unit everything else is measured in. Record before importing and
            your first take sets the bar instead.
          </li>
          <li>
            ● REC starts a NEW track; press again to stop. Once a bar exists,
            recording waits for the downbeat (◌ ARMED) so takes always start in
            time. Each take is rounded to the nearest whole number of bars.
          </li>
          <li>
            The loop is as long as the LONGEST take. Play past the end and it
            grows another bar; shorter tracks simply repeat underneath , you can
            see the repeats ghosted in the timeline.
          </li>
          <li>
            ▶ PLAY stops or restarts all tracks together. ◀ / ▶ move the
            selected track (highlighted row) , that's the track the EXP pedal's
            "Selected track level" controls.
          </li>
          <li>
            Stomp assignments below: click ASSIGN STOMP on an action, then step
            on any footswitch , that switch is remembered on this machine. Give
            the looper switches that do nothing else on the pedal (CTRL / TAP set
            to None); see the warning below for why.
          </li>
        </ul>
      </details>

      {/* Transport: the same four controls the footswitch bindings target.
          REC/PLAY grow to fill narrow screens (primary touch targets); the
          track selector and Clear All wrap onto their own line when tight;
          the loop-progress bar always gets a full-width row of its own. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={recordVariant(looper.isRecording || looper.isArmed)}
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={looper.toggleRecord}
            title="Record a new track / stop recording"
          >
            {recordLabel(looper.isRecording, looper.isArmed)}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 sm:flex-none"
            disabled={looper.importing}
            onClick={() => fileInput.current?.click()}
            title="Import an audio file as a looping track"
          >
            {looper.importing ? 'DECODING…' : '⭳ IMPORT'}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept={IMPORT_ACCEPT}
            className="hidden"
            onChange={handleImportPick}
          />
          {looper.isRecording && (
            <span
              className="flex items-center gap-1.5 basis-full sm:basis-auto"
              title="Live input level while recording"
            >
              <span className="font-mono-display text-caption text-accent-red">IN</span>
              <span className="w-16 sm:w-20 h-3 rounded bg-bg-hover overflow-hidden">
                <span
                  ref={recBar}
                  className="block h-full bg-accent-red"
                  style={{ width: '0%' }}
                />
              </span>
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 sm:flex-none"
            disabled={looper.tracks.length === 0}
            onClick={looper.togglePlayAll}
            title="Play all tracks / stop all tracks"
          >
            {playAllLabel(looper.anyPlaying)}
          </Button>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={looper.tracks.length === 0}
              onClick={looper.selectPrevTrack}
              title="Select previous track"
            >
              ◀
            </Button>
            <span
              className="font-mono-display text-caption text-text-secondary tabular-nums
                w-12 text-center"
            >
              {trackReadout}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={looper.tracks.length === 0}
              onClick={looper.selectNextTrack}
              title="Select next track"
            >
              ▶
            </Button>
          </div>
          <Button
            variant="danger"
            size="sm"
            className="ml-auto"
            disabled={looper.tracks.length === 0}
            onClick={looper.clearAll}
          >
            Clear All
          </Button>
        </div>
        {/* The length model, stated plainly: bars, total, and one bar's worth */}
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono-display text-label text-text-muted uppercase tracking-widest">
            LOOP
          </span>
          <span className="font-mono-display text-caption text-text-secondary tabular-nums">
            {fmtCycle(looper.cycleBars, looper.cycleDurationSec, looper.baseDurationSec)}
          </span>
        </div>
      </div>

      {importError && (
        <p
          className="font-mono-display text-caption text-accent-red px-3 py-2 rounded-lg
            border border-accent-red bg-accent-red/10"
        >
          {importError}
        </p>
      )}

      {/* The visual: waveform lanes across the cycle with a shared playhead */}
      <LooperTimeline looper={looper} />

      {/* Track rows: the control surface for what the timeline shows */}
      <div className="flex flex-col gap-2">
        {looper.tracks.map((track) => {
          const selected = track.id === looper.selectedTrack;
          const position = looper.tracks.indexOf(track) + 1;
          const recordingThis = looper.recordArmedTrack === track.id;
          return (
            <div
              key={track.id}
              className={trackRowClass(selected)}
              onClick={() => looper.selectTrack(track.id)}
            >
              <Led active={track.state === 'playing' || track.state === 'recording'} />
              <span
                className="font-mono-display text-label text-text-secondary w-24 truncate"
                title={track.label}
              >
                {track.label}
              </span>
              <span className="font-mono-display text-micro text-text-muted tabular-nums w-12">
                {track.bars > 0 ? `${track.bars}b` : '—'}
              </span>
              {recordingThis && (
                <span className="font-mono-display text-caption text-accent-red">
                  {track.state === 'armed' ? '◌ armed' : '● recording'}
                </span>
              )}
              <Button
                variant="secondary"
                size="sm"
                disabled={!track.hasAudio}
                onClick={() => looper.togglePlay(track.id)}
              >
                {playPauseLabel(track.state)}
              </Button>
              <Button
                variant={muteVariant(track.muted)}
                size="sm"
                disabled={!track.hasAudio}
                onClick={() => looper.setMute(track.id, !track.muted)}
              >
                Mute
              </Button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={gains[track.id] ?? 1}
                disabled={!track.hasAudio}
                onChange={(e) => setTrackGain(track.id, Number(e.target.value))}
                className="order-last basis-full sm:order-none sm:basis-0 sm:flex-1
                  min-w-0 accent-accent-amber"
                aria-label={`Track ${position} level`}
              />
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto sm:ml-0"
                onClick={() => looper.clear(track.id)}
                title="Delete this track"
              >
                ✕
              </Button>
            </div>
          );
        })}
      </div>

      {/* Stomp assignments: one row per transport action. The user never picks
          a footswitch NUMBER , they arm an action and stomp whatever switch
          they like, and the frame's fingerprint is cached for that action. */}
      <div className="pt-2 border-t border-border-active">
        <p className="font-mono-display text-label text-text-muted uppercase tracking-widest mb-1">
          Stomp assignments
        </p>
        <p className="font-mono-display text-caption text-text-secondary mb-3">
          Click ASSIGN STOMP, then step on any footswitch. While this dialog is
          open a learned stomp drives the looper instead of your patch , the app
          undoes the pedal&apos;s own reaction to it.
        </p>
        {/* Two constraints, both hard: (1) only CTRL 1-8 stomps produce a frame
            this can fingerprint , a PATCH/BANK switch sends a slot change the
            dispatcher must keep, and TAP/TUNER emit nothing learnable
            (looperTriggers.ts, docs/protocol-capture.md §4); (2) the undo is a
            single toggle-back (revertFor), so it can only cancel a switch that
            flips ONE effect block , a CTRL assignment carrying a blockMask of
            many blocks would leave the extras flipped. The app cannot read the
            pedal's footswitch config, so this has to be a warning rather than a
            check , and rewriting that config was tried twice and reverted,
            because it is write-only and clobbers the user's real setup (see the
            note in App.tsx). */}
        <div
          className="mb-3 px-3 py-2 rounded-lg border border-accent-amber
            bg-accent-amber/10"
        >
          <p className="font-mono-display text-label text-accent-amber uppercase tracking-widest mb-1">
            ⚠ Before you assign a footswitch
          </p>
          <p className="font-mono-display text-caption text-text-secondary">
            On the GP-200, the switches you want the looper to own must be set
            to a <strong>CTRL 1–8</strong> assignment , not PATCH, BANK, TAP or
            TUNER. Only a CTRL stomp sends something this app can recognise; a
            patch or bank switch changes the pedal&apos;s slot instead, and the
            looper will never hear it.
          </p>
          <p className="font-mono-display text-caption text-text-secondary mt-2">
            Give each of those CTRL switches <strong>one effect block only</strong>.
            A CTRL that toggles several blocks at once cannot be fully undone:
            the looper action will fire, but the extra pedals stay flipped. One
            switch, one job.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {LOOPER_ACTION_KINDS.map((action) => {
            const learned = triggers[action] !== undefined;
            const armed = armedAction === action;
            const showNotice = learnNotice !== null && learnNotice.action === action;
            return (
              <div key={action} className="flex flex-col gap-1">
                <div
                  className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg
                    border border-border-active bg-bg-hover"
                >
                  <span className="font-mono-display text-label text-text-secondary w-32">
                    {ACTION_LABELS[action]}
                  </span>
                  <span className={assignStatusClass(armed, learned)}>
                    {assignStatus(armed, learned)}
                  </span>
                  <Button
                    variant={learnVariant(armed)}
                    size="sm"
                    className="ml-auto"
                    disabled={!learnEnabled}
                    onClick={() => onArmLearn(action)}
                    title={learnTitle(armed, learned, learnEnabled)}
                  >
                    {learnLabel(armed, learned)}
                  </Button>
                  {learned && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onClearTrigger(action)}
                      title="Forget the switch assigned to this action"
                    >
                      ✕
                    </Button>
                  )}
                </div>
                {showNotice && (
                  <p className="font-mono-display text-caption text-accent-red px-3">
                    That switch is already assigned to {ACTION_LABELS[learnNotice.duplicateOf]} —
                    not saved
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-end mt-2">
          <Button
            variant="danger"
            size="sm"
            onClick={onClearAll}
            title="Forget every assigned stomp"
          >
            CLEAR ASSIGNMENTS
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="font-mono-display text-label text-text-secondary w-16">EXP →</span>
          <select
            value={expValue(bindings.expTarget)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'none') updateExpTarget(null);
              else if (v === 'master') updateExpTarget({ kind: 'masterGain' });
              else updateExpTarget({ kind: 'selectedTrackGain' });
            }}
            className={`flex-1 sm:flex-none min-w-0 ${SELECT_CLASS}`}
          >
            <option value="none">-</option>
            <option value="master">Master level</option>
            <option value="selected">Selected track level</option>
          </select>
          <span className="font-mono-display text-caption text-text-muted basis-full sm:basis-auto">
            (EXP wire format pending capture)
          </span>
        </div>
      </div>
    </div>
  );
}
