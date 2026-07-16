import { useEffect, useRef, useState } from 'react';
import type { LooperApi } from '@/hooks/useLooper';
import {
  type LooperBindings,
  type LooperAction,
  type ExpTarget,
} from '@/core/looperBindings';
import { Button } from '@/components/ui/Button';
import { Led } from '@/components/ui/Badge';

interface LooperPanelProps {
  looper: LooperApi;
  bindings: LooperBindings;
  onBindingsChange: (next: LooperBindings) => void;
  /** enable the AUDIO IN capture — the looper needs the shared context running */
  onEnableAudio: () => void;
  audioStarting: boolean;
}

const FS_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];

// Action kinds selectable per footswitch (plus "none" to unbind).
type ActionKind = LooperAction['kind'] | 'none';
const ACTION_LABELS: Record<ActionKind, string> = {
  none: '—',
  recordOverdubCycle: 'Record / Stop',
  playToggle: 'Play / Stop',
  muteToggle: 'Mute',
  clear: 'Clear',
  clearAll: 'Clear All',
};

function actionKind(action: LooperAction | undefined): ActionKind {
  return action?.kind ?? 'none';
}

function actionTrack(action: LooperAction | undefined): number {
  return action && 'track' in action ? action.track : 0;
}

function buildAction(kind: ActionKind, track: number): LooperAction | null {
  switch (kind) {
    case 'none': return null;
    case 'clearAll': return { kind: 'clearAll' };
    default: return { kind, track };
  }
}

function fmtLength(sec: number | null): string {
  if (sec === null) return '— : —';
  return `${sec.toFixed(2)}s`;
}

export function LooperPanel({
  looper,
  bindings,
  onBindingsChange,
  onEnableAudio,
  audioStarting,
}: LooperPanelProps) {
  const playBar = useRef<HTMLSpanElement>(null);
  const [gains, setGains] = useState<number[]>(() => looper.tracks.map(() => 1));
  const { ready, getPlayhead } = looper;

  // Drive the master-loop progress bar from a rAF loop (no per-frame React
  // state), mirroring AudioMeters — read the pure playhead each frame.
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

  const updateFootswitch = (fs: number, kind: ActionKind, track: number) => {
    const next = { ...bindings.footswitches };
    const action = buildAction(kind, track);
    if (action) next[fs] = action;
    else delete next[fs];
    onBindingsChange({ ...bindings, footswitches: next });
  };

  const updateExpTarget = (target: ExpTarget) => {
    onBindingsChange({ ...bindings, expTarget: target });
  };

  const setTrackGain = (id: number, value: number) => {
    setGains((prev) => prev.map((g, i) => (i === id ? value : g)));
    looper.setTrackGain(id, value);
  };

  if (!looper.ready) {
    return (
      <div className="text-center py-6">
        <p className="font-mono-display text-caption text-text-muted mb-3">
          The loop station records the GP-200's USB audio — enable audio capture to start.
        </p>
        <Button onClick={onEnableAudio} disabled={audioStarting}>
          {audioStarting ? 'ENABLING…' : 'ENABLE AUDIO IN'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Master transport */}
      <div className="flex items-center gap-3">
        <span className="font-mono-display text-label text-text-muted uppercase tracking-widest">Master</span>
        <span className="flex-1 h-2 rounded bg-bg-hover overflow-hidden">
          <span ref={playBar} className="block h-full bg-accent-amber" style={{ width: '0%' }} />
        </span>
        <span className="font-mono-display text-caption text-text-secondary tabular-nums">
          {fmtLength(looper.masterLoopLengthSec)}
        </span>
        <Button variant="danger" size="sm" onClick={looper.clearAll}>Clear All</Button>
      </div>

      {/* Track rows */}
      <div className="flex flex-col gap-2">
        {looper.tracks.map((track) => {
          const recordingThis = looper.isRecording && looper.recordArmedTrack === track.id;
          const recordDisabled = looper.isRecording && !recordingThis;
          return (
            <div key={track.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border-active bg-bg-hover">
              <Led active={track.state === 'playing' || track.state === 'recording'} />
              <span className="font-mono-display text-label text-text-secondary w-14">TRK {track.id + 1}</span>
              <Button
                variant={recordingThis ? 'danger' : 'secondary'}
                size="sm"
                disabled={recordDisabled}
                onClick={() => (recordingThis ? looper.stopRecord() : looper.startRecord(track.id))}
              >
                {recordingThis ? 'Stop' : 'Rec'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!track.hasAudio}
                onClick={() => looper.togglePlay(track.id)}
              >
                {track.state === 'playing' ? 'Pause' : 'Play'}
              </Button>
              <Button
                variant={track.muted ? 'primary' : 'ghost'}
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
                value={gains[track.id]}
                disabled={!track.hasAudio}
                onChange={(e) => setTrackGain(track.id, Number(e.target.value))}
                className="flex-1 min-w-16 accent-accent-amber"
                aria-label={`Track ${track.id + 1} level`}
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={!track.hasAudio}
                onClick={() => looper.clear(track.id)}
                title="Clear this track"
              >
                ✕
              </Button>
            </div>
          );
        })}
      </div>

      {/* Bindings */}
      <div className="pt-2 border-t border-border-active">
        <p className="font-mono-display text-label text-text-muted uppercase tracking-widest mb-2">
          Hardware bindings <span className="normal-case tracking-normal">(footswitch / EXP wire format pending capture)</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          {FS_NUMBERS.map((fs) => {
            const action = bindings.footswitches[fs];
            const kind = actionKind(action);
            const track = actionTrack(action);
            const needsTrack = kind !== 'none' && kind !== 'clearAll';
            return (
              <div key={fs} className="flex items-center gap-2">
                <span className="font-mono-display text-label text-text-secondary w-10">FS{fs}</span>
                <select
                  value={kind}
                  onChange={(e) => updateFootswitch(fs, e.target.value as ActionKind, track)}
                  className="flex-1 bg-bg-primary border border-border-active rounded px-2 py-1 font-mono-display text-caption text-text-secondary"
                >
                  {(Object.keys(ACTION_LABELS) as ActionKind[]).map((k) => (
                    <option key={k} value={k}>{ACTION_LABELS[k]}</option>
                  ))}
                </select>
                <select
                  value={track}
                  disabled={!needsTrack}
                  onChange={(e) => updateFootswitch(fs, kind, Number(e.target.value))}
                  className="bg-bg-primary border border-border-active rounded px-2 py-1 font-mono-display text-caption text-text-secondary disabled:opacity-40"
                  aria-label={`FS${fs} target track`}
                >
                  {looper.tracks.map((t) => (
                    <option key={t.id} value={t.id}>T{t.id + 1}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <span className="font-mono-display text-label text-text-secondary w-16">EXP →</span>
          <select
            value={bindings.expTarget === null ? 'none' : bindings.expTarget.kind === 'masterGain' ? 'master' : `track:${bindings.expTarget.track}`}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'none') updateExpTarget(null);
              else if (v === 'master') updateExpTarget({ kind: 'masterGain' });
              else updateExpTarget({ kind: 'trackGain', track: Number(v.split(':')[1]) });
            }}
            className="bg-bg-primary border border-border-active rounded px-2 py-1 font-mono-display text-caption text-text-secondary"
          >
            <option value="none">—</option>
            <option value="master">Master level</option>
            {looper.tracks.map((t) => (
              <option key={t.id} value={`track:${t.id}`}>Track {t.id + 1} level</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
