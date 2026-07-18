import { useEffect, useRef, useState } from 'react';
import type { LooperApi } from '@/hooks/useLooper';
import {
  LOOPER_ACTION_KINDS,
  type LooperBindings,
  type LooperActionKind,
  type ExpTarget,
} from '@/core/looperBindings';
import { Button } from '@/components/ui/Button';
import { Led } from '@/components/ui/Badge';
import type { LooperTriggerMap } from '@/core/looperTriggers';
import type { LearnNotice } from '@/hooks/useLooperTriggers';

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
  playToggle: 'Play / Stop',
  trackNext: 'Track +',
  trackPrev: 'Track -',
};

function fmtLength(sec: number | null): string {
  if (sec === null) return '- : -';
  return `${sec.toFixed(2)}s`;
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
  if (learned) return 'Assigned — click to assign a different switch';
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

function recordLabel(recording: boolean): string {
  if (recording) return '■ STOP REC';
  return '● REC';
}

function recordVariant(recording: boolean): 'danger' | 'secondary' {
  if (recording) return 'danger';
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
  const playBar = useRef<HTMLSpanElement>(null);
  // Track gains keyed by dynamic track id; default 1 for new tracks.
  const [gains, setGains] = useState<Record<number, number>>({});
  const { ready, getPlayhead } = looper;

  // Drive the master-loop progress bar from a rAF loop (no per-frame React
  // state), mirroring AudioMeters: read the pure playhead each frame.
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    const tick = () => {
      const pos = getPlayhead();
      if (playBar.current) playBar.current.style.width = `${(pos * 100).toFixed(1)}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, getPlayhead]);

  const updateExpTarget = (target: ExpTarget) => {
    onBindingsChange({ ...bindings, expTarget: target });
  };

  const setTrackGain = (id: number, value: number) => {
    setGains((prev) => ({ ...prev, [id]: value }));
    looper.setTrackGain(id, value);
  };

  if (!looper.ready) {
    return (
      <div className="text-center py-6">
        <p className="font-mono-display text-caption text-text-muted mb-3">
          The loop station records the GP-200's USB audio here in the browser
          (separate from the pedal's built-in looper): record takes on top of
          each other, every take becomes its own track, and everything stays in
          sync with the first loop. Enable audio capture to start.
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
            Records the GP-200's USB audio here in the browser — separate from
            the pedal's built-in looper (that one lives in the DRUMS drawer).
          </li>
          <li>
            ● REC starts a NEW track; press again to stop. Your first take sets
            the master loop length; every later take is stretched to a whole
            number of loops and stays locked in time with it.
          </li>
          <li>
            ▶ PLAY stops or restarts all tracks together. ◀ / ▶ move the
            selected track (highlighted row) — that's the track the EXP pedal's
            "Selected track level" controls.
          </li>
          <li>
            Stomp assignments below: click ASSIGN STOMP on an action, then step
            on any footswitch — that switch is remembered on this machine. While
            this dialog is open the pedal hands its footswitches over to the
            looper; normal behaviour is restored when you close it.
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
            variant={recordVariant(looper.isRecording)}
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={looper.toggleRecord}
            title="Record a new track / stop recording"
          >
            {recordLabel(looper.isRecording)}
          </Button>
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
        <div className="flex items-center gap-2">
          <span className="flex-1 h-3 rounded bg-bg-hover overflow-hidden">
            <span
              ref={playBar}
              className="block h-full bg-accent-amber"
              style={{ width: '0%' }}
            />
          </span>
          <span className="font-mono-display text-caption text-text-secondary tabular-nums">
            {fmtLength(looper.masterLoopLengthSec)}
          </span>
        </div>
      </div>

      {/* Track rows: one per recorded take, newest last */}
      {looper.tracks.length === 0 && (
        <p className="font-mono-display text-caption text-text-muted">
          No tracks yet — hit ● REC (or an assigned footswitch) to record the
          first loop; every record/stop cycle adds a track.
        </p>
      )}
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
              <span className="font-mono-display text-label text-text-secondary w-14">
                TRK {position}
              </span>
              {recordingThis && (
                <span className="font-mono-display text-caption text-accent-red">
                  ● recording
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
          a footswitch NUMBER — they arm an action and stomp whatever switch
          they like, and the frame's fingerprint is cached for that action. */}
      <div className="pt-2 border-t border-border-active">
        <p className="font-mono-display text-label text-text-muted uppercase tracking-widest mb-1">
          Stomp assignments
        </p>
        <p className="font-mono-display text-caption text-text-secondary mb-3">
          Click ASSIGN STOMP, then step on any footswitch. While this dialog is
          open the GP-200's footswitches belong to the looper — their normal
          function is restored when you close it.
        </p>
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
