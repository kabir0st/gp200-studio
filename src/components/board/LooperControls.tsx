import { useEffect, useRef } from 'react';
import { useAudioEngine } from '@/components/AudioEngineProvider';
import { Button } from '@/components/ui/Button';
import type { LooperApi } from '@/hooks/useLooper';
import type { LooperTempo } from '@/components/board/LooperSetup';
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

interface LooperSyncControlProps {
  looper: LooperApi;
  /** the practice drum machine's current bar, offered as the grid to lock to */
  tempo: LooperTempo;
  size?: 'sm' | 'md';
}

/**
 * Lock the loop's bar to the drum machine's, or release it again.
 *
 * The locked state stays on screen after the first take, disabled, rather than
 * disappearing: the bar genuinely cannot be released while tracks exist (the
 * engine refuses), and a control that vanishes reads as a control that never
 * existed , which is how people conclude the only way out is a page reload.
 * Disabled-with-a-reason names CLEAR ALL as the way back instead.
 *
 * The label comes from `baseLockedLabel`, frozen when the lock was taken, not
 * from the live tempo: the lock copies a bar length once, so a drum machine
 * retuned afterwards would otherwise have this button describing a tempo the
 * loop is not running at.
 */
export function LooperSyncControl({ looper, tempo, size = 'md' }: LooperSyncControlProps) {
  const locked = looper.baseLocked;
  // The bar can only be taken or released on an empty board , the engine
  // refuses either once a take exists, so the button has to say so rather than
  // sit there looking live and doing nothing.
  const held = looper.hasContent;
  const label = locked ? `↻ SYNCED · ${looper.baseLockedLabel ?? tempo.label}` : '↻ SYNC TO DRUMS';

  let title = 'Take the bar length from the practice drum machine, so the loop lands exactly in time';
  if (locked) {
    title = 'The loop is locked to the drum machine. Click to let your first take set it instead';
  }
  if (held && locked) {
    title = 'Locked to the drum machine for this session. CLEAR ALL deletes every track and releases it';
  }
  if (held && !locked) {
    title = 'Your first take already set the bar. CLEAR ALL deletes every track and lets you sync to the drums instead';
  }

  return (
    <Button
      size={size}
      variant={locked ? 'primary' : 'secondary'}
      disabled={held}
      title={title}
      onClick={() => {
        if (locked) {
          looper.unlockBase();
          return;
        }
        looper.lockBaseSeconds(tempo.barSeconds, tempo.label);
      }}
    >
      {label}
    </Button>
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

  let label = '↓ IMPORT';
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

// The per-track rows moved into LooperTrackRack, where each one sits with its
// own waveform instead of restating it in a second list.
