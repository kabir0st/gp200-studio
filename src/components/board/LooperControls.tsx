import { useEffect, useRef, useState } from 'react';
import { useAudioEngine } from '@/components/AudioEngineProvider';
import { Button } from '@/components/ui/Button';
import { Led } from '@/components/ui/Badge';
import type { LooperApi } from '@/hooks/useLooper';
import { track as trackEvent } from '@/core/analytics';
import { fileExt } from '@/core/analyticsEvents';

// Presentational pieces the loop station's SIMPLE and ADVANCED faces both
// render. Anything that appears on both lives here rather than being written
// twice , the two faces are meant to differ in how much they show, never in
// how the same control behaves.

/** Audio containers worth offering; the browser decodes whatever it supports. */
const IMPORT_ACCEPT = 'audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac';

interface LooperMasterLevelProps {
  level: number;
  onChange: (level: number) => void;
}

/**
 * The loop station's output level.
 *
 * Every take stacks its full level onto the mix, so without this the third
 * overdub is three times as loud as the first and the browser hard-clips the
 * difference. It sits on the main surface in both faces for that reason ,
 * this is not a setup detail, it is the volume knob.
 */
export function LooperMasterLevel({ level, onChange }: LooperMasterLevelProps) {
  const percent = Math.round(level * 100);
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border
        border-border-active bg-bg-hover"
    >
      <span
        className="font-mono-display text-label text-text-secondary uppercase
          tracking-widest shrink-0"
      >
        Volume
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={level}
        onChange={(event) => onChange(Number(event.target.value))}
        className="flex-1 min-w-0 accent-accent-amber"
        aria-label="Loop station output level"
      />
      <span
        className="font-mono-display text-caption text-text-secondary tabular-nums
          w-10 text-right shrink-0"
      >
        {percent}%
      </span>
    </div>
  );
}

interface LooperImportButtonProps {
  looper: LooperApi;
  /** the decode error, reported up so each face can place it in its own layout */
  onError: (message: string | null) => void;
  className?: string;
}

/** Pick an audio file and add it as a looping track. */
export function LooperImportButton({ looper, onError, className = '' }: LooperImportButtonProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  const handlePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset immediately so re-picking the SAME file still fires a change event.
    event.target.value = '';
    if (!file) return;
    onError(null);
    const error = await looper.importAudioFile(file);
    onError(error);
    // Safe to instrument at the call site (unlike record): import has no
    // footswitch binding, so this is the only path in. Extension only , the
    // filename itself is user data and never leaves the browser.
    trackEvent('looper_import_audio', { ok: error === null, ext: fileExt(file.name) });
  };

  let label = '⭳ IMPORT';
  if (looper.importing) label = 'DECODING…';

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className={className}
        disabled={looper.importing}
        onClick={() => fileInput.current?.click()}
        title="Import a backing track to play along to"
      >
        {label}
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept={IMPORT_ACCEPT}
        className="hidden"
        onChange={handlePick}
      />
    </>
  );
}

interface LooperInputMeterProps {
  /** width classes for the meter bar itself */
  barClassName?: string;
}

/**
 * Live input level, mounted only while a take is actually capturing.
 *
 * Same rAF-driven read the AudioMeters use, written straight to the DOM. A
 * silent take , wrong input picked, amp muted , is otherwise impossible to
 * tell from a good one until playback, by which point it has already cost you
 * the phrase.
 */
export function LooperInputMeter({ barClassName = 'flex-1' }: LooperInputMeterProps) {
  const fill = useRef<HTMLSpanElement>(null);
  const { active, getLevels } = useAudioEngine();

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      const { input } = getLevels();
      if (fill.current) fill.current.style.width = `${(input * 100).toFixed(1)}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, getLevels]);

  return (
    <span className="flex items-center gap-1.5" title="Live input level while recording">
      <span className="font-mono-display text-caption text-accent-red">IN</span>
      <span className={`h-3 rounded bg-bg-hover overflow-hidden ${barClassName}`}>
        <span ref={fill} className="block h-full bg-accent-red" style={{ width: '0%' }} />
      </span>
    </span>
  );
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

interface LooperTrackListProps {
  looper: LooperApi;
  /** drop the per-track transport and bar count, leaving level / mute / delete */
  compact?: boolean;
}

/** One row per recorded or imported track: the control surface for the timeline. */
export function LooperTrackList({ looper, compact = false }: LooperTrackListProps) {
  // Track gains keyed by dynamic track id; default 1 for new tracks.
  const [gains, setGains] = useState<Record<number, number>>({});

  const setTrackGain = (id: number, value: number) => {
    setGains((prev) => ({ ...prev, [id]: value }));
    looper.setTrackGain(id, value);
  };

  return (
    <div className="flex flex-col gap-2">
      {looper.tracks.map((trackRow) => {
        const selected = trackRow.id === looper.selectedTrack;
        const position = looper.tracks.indexOf(trackRow) + 1;
        const recordingThis = looper.recordArmedTrack === trackRow.id;
        const live = trackRow.state === 'playing' || trackRow.state === 'recording';
        return (
          <div
            key={trackRow.id}
            className={trackRowClass(selected)}
            onClick={() => looper.selectTrack(trackRow.id)}
          >
            <Led active={live} />
            <span
              className="font-mono-display text-label text-text-secondary w-24 truncate"
              title={trackRow.label}
            >
              {trackRow.label}
            </span>
            {!compact && (
              <span
                className="font-mono-display text-micro text-text-muted tabular-nums w-12"
              >
                {trackRow.bars > 0 && `${trackRow.bars}b`}
                {trackRow.bars === 0 && '—'}
              </span>
            )}
            {recordingThis && trackRow.state === 'armed' && (
              <span className="font-mono-display text-caption text-accent-red">◌ armed</span>
            )}
            {recordingThis && trackRow.state !== 'armed' && (
              <span className="font-mono-display text-caption text-accent-red">● recording</span>
            )}
            {!compact && (
              <Button
                variant="secondary"
                size="sm"
                disabled={!trackRow.hasAudio}
                onClick={() => looper.togglePlay(trackRow.id)}
              >
                {playPauseLabel(trackRow.state)}
              </Button>
            )}
            <Button
              variant={muteVariant(trackRow.muted)}
              size="sm"
              disabled={!trackRow.hasAudio}
              onClick={() => looper.setMute(trackRow.id, !trackRow.muted)}
            >
              Mute
            </Button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={gains[trackRow.id] ?? 1}
              disabled={!trackRow.hasAudio}
              onChange={(event) => setTrackGain(trackRow.id, Number(event.target.value))}
              className="order-last basis-full sm:order-none sm:basis-0 sm:flex-1
                min-w-0 accent-accent-amber"
              aria-label={`Track ${position} level`}
            />
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto sm:ml-0"
              onClick={() => looper.clear(trackRow.id)}
              title="Delete this track"
            >
              ✕
            </Button>
          </div>
        );
      })}
    </div>
  );
}
