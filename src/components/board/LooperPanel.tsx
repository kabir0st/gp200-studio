import { useEffect, useRef, useState } from 'react';
import type { LooperApi } from '@/hooks/useLooper';
import {
  type LooperBindings,
  type LooperAction,
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
  /* MIDI-learn: bind hardware stomps to the rows below */
  triggers: LooperTriggerMap;
  armedFs: number | null;
  onArmLearn: (fs: number) => void;
  onClearTrigger: (fs: number) => void;
  learnNotice: LearnNotice | null;
  /** learning needs a connected GP-200 */
  learnEnabled: boolean;
  /** FS takeover: rewrite bound switches' TAP targets to CTRLs on the pedal
   *  so stomps stop firing their normal function while this panel is open */
  takeoverActive: boolean;
  onTakeoverChange: (active: boolean) => void;
}

const FS_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];

const SELECT_CLASS =
  'bg-bg-primary border border-border-active rounded px-2 py-1 ' +
  'font-mono-display text-caption text-text-secondary';

// The four transport actions selectable per footswitch (plus "none" to unbind).
type ActionKind = LooperAction['kind'] | 'none';
const ACTION_LABELS: Record<ActionKind, string> = {
  none: '-',
  recordToggle: 'Record / Stop',
  playToggle: 'Play / Stop',
  trackNext: 'Track +',
  trackPrev: 'Track -',
};

function actionKind(action: LooperAction | undefined): ActionKind {
  return action?.kind ?? 'none';
}

function buildAction(kind: ActionKind): LooperAction | null {
  if (kind === 'none') return null;
  return { kind };
}

function fmtLength(sec: number | null): string {
  if (sec === null) return '- : -';
  return `${sec.toFixed(2)}s`;
}

function learnLabel(armed: boolean, learned: boolean): string {
  if (armed) return '● STOMP';
  if (learned) return '✓';
  return 'LEARN';
}

function learnVariant(armed: boolean): 'danger' | 'ghost' {
  if (armed) return 'danger';
  return 'ghost';
}

function takeoverLabel(active: boolean): string {
  if (active) return '● TAKEOVER ON';
  return 'TAKEOVER';
}

function learnTitle(armed: boolean, learned: boolean, learnEnabled: boolean): string {
  if (!learnEnabled) return 'Connect the GP-200 to learn';
  if (armed) return 'Stomp the hardware switch now (click to cancel)';
  if (learned) return 'Learned — click to re-learn';
  return 'Arm, then stomp the hardware switch to bind it';
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
  const base = 'flex items-center gap-2 px-3 py-2 rounded-lg border bg-bg-hover cursor-pointer';
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
  armedFs,
  onArmLearn,
  onClearTrigger,
  learnNotice,
  learnEnabled,
  takeoverActive,
  onTakeoverChange,
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

  const updateFootswitch = (fs: number, kind: ActionKind) => {
    const next = { ...bindings.footswitches };
    const action = buildAction(kind);
    if (action) next[fs] = action;
    else delete next[fs];
    onBindingsChange({ ...bindings, footswitches: next });
  };

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
            Hardware bindings below: arm LEARN and stomp a footswitch to bind
            it. While this panel is open, bound stomps drive the looper;
            TAKEOVER rewrites those switches on the pedal so their normal
            function stays silent (restored when the panel closes).
          </li>
        </ul>
      </details>

      {/* Transport: the same four controls the footswitch bindings target */}
      <div className="flex items-center gap-2">
        <Button
          variant={recordVariant(looper.isRecording)}
          size="sm"
          onClick={looper.toggleRecord}
          title="Record a new track / stop recording"
        >
          {recordLabel(looper.isRecording)}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={looper.tracks.length === 0}
          onClick={looper.togglePlayAll}
          title="Play all tracks / stop all tracks"
        >
          {playAllLabel(looper.anyPlaying)}
        </Button>
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
          className="font-mono-display text-caption text-text-secondary tabular-nums w-12
            text-center"
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
        <span className="flex-1 h-2 rounded bg-bg-hover overflow-hidden">
          <span ref={playBar} className="block h-full bg-accent-amber" style={{ width: '0%' }} />
        </span>
        <span className="font-mono-display text-caption text-text-secondary tabular-nums">
          {fmtLength(looper.masterLoopLengthSec)}
        </span>
        <Button
          variant="danger"
          size="sm"
          disabled={looper.tracks.length === 0}
          onClick={looper.clearAll}
        >
          Clear All
        </Button>
      </div>

      {/* Track rows: one per recorded take, newest last */}
      {looper.tracks.length === 0 && (
        <p className="font-mono-display text-caption text-text-muted">
          No tracks yet — hit ● REC (or a bound footswitch) to record the first
          loop; every record/stop cycle adds a track.
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
                className="flex-1 min-w-16 accent-accent-amber"
                aria-label={`Track ${position} level`}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => looper.clear(track.id)}
                title="Delete this track"
              >
                ✕
              </Button>
            </div>
          );
        })}
      </div>

      {/* Bindings */}
      <div className="pt-2 border-t border-border-active">
        <div className="flex items-center gap-3 mb-2">
          <p className="font-mono-display text-label text-text-muted uppercase tracking-widest">
            Hardware bindings{' '}
            <span className="normal-case tracking-normal">
              (arm LEARN, then stomp the switch — bound switches drive the looper
              while this panel is open)
            </span>
          </p>
          <Button
            variant={learnVariant(takeoverActive)}
            size="sm"
            disabled={!learnEnabled}
            onClick={() => onTakeoverChange(!takeoverActive)}
            title={
              'Rewrite the bound switches on the pedal to their CTRLs while this ' +
              'panel is open, so stomps stop patch-switching; restored on close'
            }
          >
            {takeoverLabel(takeoverActive)}
          </Button>
        </div>
        {takeoverActive && (
          <p className="font-mono-display text-caption text-text-secondary mb-2">
            Takeover active: FS mode set to User, bound switches point at their
            CTRLs. Re-LEARN each switch once while active, then stomps only
            drive the looper. Closing this panel restores your setup.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {FS_NUMBERS.map((fs) => {
            const kind = actionKind(bindings.footswitches[fs]);
            const learned = triggers[fs] !== undefined;
            const armed = armedFs === fs;
            const showNotice = learnNotice !== null && learnNotice.fs === fs;
            return (
              <div key={fs} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono-display text-label text-text-secondary w-10">
                    FS{fs}
                  </span>
                  <select
                    value={kind}
                    onChange={(e) => updateFootswitch(fs, e.target.value as ActionKind)}
                    className={`flex-1 ${SELECT_CLASS}`}
                    aria-label={`FS${fs} looper action`}
                  >
                    {(Object.keys(ACTION_LABELS) as ActionKind[]).map((actionOption) => (
                      <option key={actionOption} value={actionOption}>
                        {ACTION_LABELS[actionOption]}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant={learnVariant(armed)}
                    size="sm"
                    disabled={!learnEnabled}
                    onClick={() => onArmLearn(fs)}
                    title={learnTitle(armed, learned, learnEnabled)}
                  >
                    {learnLabel(armed, learned)}
                  </Button>
                  {learned && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onClearTrigger(fs)}
                      title="Forget the learned hardware switch"
                    >
                      ✕
                    </Button>
                  )}
                </div>
                {showNotice && (
                  <p className="font-mono-display text-caption text-accent-red pl-12">
                    Same stomp already bound to FS{learnNotice.duplicateOfFs} — not saved
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <span className="font-mono-display text-label text-text-secondary w-16">EXP →</span>
          <select
            value={expValue(bindings.expTarget)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'none') updateExpTarget(null);
              else if (v === 'master') updateExpTarget({ kind: 'masterGain' });
              else updateExpTarget({ kind: 'selectedTrackGain' });
            }}
            className={SELECT_CLASS}
          >
            <option value="none">-</option>
            <option value="master">Master level</option>
            <option value="selected">Selected track level</option>
          </select>
          <span className="font-mono-display text-caption text-text-muted">
            (EXP wire format pending capture)
          </span>
        </div>
      </div>
    </div>
  );
}
