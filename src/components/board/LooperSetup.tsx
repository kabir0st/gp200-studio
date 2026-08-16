import { useEffect, useRef, type ReactNode } from 'react';
import { useAudioEngine } from '@/components/AudioEngineProvider';
import { Button } from '@/components/ui/Button';
import type { LooperApi } from '@/hooks/useLooper';
import { LOOPER_HOTKEYS } from '@/hooks/useLooperHotkeys';
import {
  LATENCY_TRIM_MIN_MS,
  LATENCY_TRIM_MAX_MS,
  TAIL_BLEND_MAX_MS,
  TRIGGER_DB_MIN,
  TRIGGER_DB_MAX,
  RECORD_BAR_CHOICES,
} from '@/core/loopCapture';

// The loop station's capture settings: everything that decides WHERE a take
// starts, where it ends and how its loop point is joined. Split out of
// LooperPanel because it is a settings surface with its own explanations,
// not part of the transport , and because the phone reuses it verbatim.
//
// Every block states the setting in plain language underneath it: these are the
// four knobs a looper actually gets judged on, and none of them are guessable
// from a number alone.

/** The practice drum machine's current bar, offered as a grid to lock to. */
export interface LooperTempo {
  bpm: number;
  /** seconds in one bar at that tempo and signature */
  barSeconds: number;
  /** e.g. "120 BPM · 4/4" */
  label: string;
}

interface LooperSetupProps {
  looper: LooperApi;
  tempo: LooperTempo;
}

const BLOCK_CLASS =
  'flex flex-col gap-2 px-3 py-2.5 rounded-lg border border-border-active bg-bg-hover';
const TITLE_CLASS =
  'font-mono-display text-label text-text-secondary uppercase tracking-widest';
const HINT_CLASS = 'font-mono-display text-caption text-text-muted';
const VALUE_CLASS = 'font-mono-display text-caption text-accent-amber tabular-nums';

interface BlockProps {
  title: string;
  value: string;
  children: ReactNode;
  hint: string;
}

function SetupBlock({ title, value, children, hint }: BlockProps) {
  return (
    <div className={BLOCK_CLASS}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={TITLE_CLASS}>{title}</span>
        <span className={VALUE_CLASS}>{value}</span>
      </div>
      {children}
      <p className={HINT_CLASS}>{hint}</p>
    </div>
  );
}

interface BarChoice {
  id: string;
  label: string;
  bars: number | null;
}

const TAKE_LENGTHS: BarChoice[] = [
  { id: 'free', label: 'FREE', bars: null },
  ...RECORD_BAR_CHOICES.map((bars) => ({ id: `bars-${bars}`, label: String(bars), bars })),
];

function takeVariant(selected: boolean): 'primary' | 'secondary' {
  if (selected) return 'primary';
  return 'secondary';
}

function takeLengthValue(recordBars: number | null): string {
  if (recordBars === null) return 'free';
  if (recordBars === 1) return '1 bar';
  return `${recordBars} bars`;
}

function triggerValue(autoStart: boolean, triggerDb: number): string {
  if (autoStart) return `${triggerDb} dB`;
  return 'off';
}

function triggerToggleLabel(autoStart: boolean): string {
  if (autoStart) return '● ON';
  return '○ OFF';
}

/**
 * Live input level with the trigger point marked on the same scale.
 *
 * The meter is the only way to set a threshold honestly: it has to sit above
 * the room/amp hiss and below the quietest note you intend to start on, and
 * that is a property of this rig, not a number anyone can guess. Level is read
 * inside rAF and written straight to the DOM, like every other meter here.
 */
function TriggerMeter({ triggerDb }: { triggerDb: number }) {
  const fillRef = useRef<HTMLDivElement>(null);
  const { active, getLevels } = useAudioEngine();

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      const { input } = getLevels();
      if (fillRef.current) fillRef.current.style.width = `${(input * 100).toFixed(1)}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, getLevels]);

  // Both the meter and the marker use the engine's −60 dBFS..0 → 0..1 mapping,
  // so what you see under the marker is what will trigger.
  const markerPercent = ((triggerDb + 60) / 60) * 100;
  return (
    <div className="relative h-3 rounded bg-bg-deep overflow-hidden">
      <div ref={fillRef} className="h-full bg-accent-green/70" style={{ width: '0%' }} />
      <div
        className="absolute inset-y-0 w-0.5 bg-accent-red"
        style={{ left: `${markerPercent.toFixed(1)}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

function signedMs(value: number): string {
  if (value > 0) return `+${value} ms`;
  return `${value} ms`;
}

export function LooperSetup({ looper, tempo }: LooperSetupProps) {
  const { settings, updateSettings } = looper;

  const barLabel = () => {
    if (looper.baseDurationSec === null) return 'not set yet';
    return `${looper.baseDurationSec.toFixed(3)} s`;
  };

  const gridHint = () => {
    if (looper.hasContent) {
      return 'The bar is set for this session. Clear every track to choose a new one.';
    }
    if (looper.baseLocked) {
      return 'Takes are rounded to this bar exactly , no reaction time in the tempo.';
    }
    return 'Otherwise your first take sets the bar, including however late you hit stop.';
  };

  const startHint = () => {
    if (looper.hasContent) {
      return 'A loop is already running, so takes drop in on its downbeat. This applies again to the first take after Clear All.';
    }
    if (settings.autoStart) {
      return 'The first take waits for you to play, and keeps the pick attack that started it. Later takes drop in on the downbeat.';
    }
    return 'Takes start the moment you press REC. Later takes still wait for the downbeat.';
  };

  const takeHint = () => {
    if (settings.recordBars === null) {
      return 'Free takes end when you press stop, so their length carries your reaction time. Pick a bar count to end them exactly.';
    }
    return `Recording stops itself after ${takeLengthValue(settings.recordBars)}, sample-exact. Nothing to press in time.`;
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <SetupBlock title="Loop grid" value={barLabel()} hint={gridHint()}>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={takeVariant(looper.baseLocked)}
              disabled={looper.hasContent}
              onClick={() => looper.lockBaseSeconds(tempo.barSeconds)}
              title="Use one drum-machine bar as the looper's bar"
            >
              ↻ LOCK BAR TO DRUMS
            </Button>
            <span className="font-mono-display text-caption text-text-secondary tabular-nums">
              {tempo.label} · {tempo.barSeconds.toFixed(3)} s
            </span>
            {looper.baseLocked && !looper.hasContent && (
              <Button size="sm" variant="ghost" onClick={looper.unlockBase}>
                UNLOCK
              </Button>
            )}
          </div>
        </SetupBlock>

        <SetupBlock
          title="Take length"
          value={takeLengthValue(settings.recordBars)}
          hint={takeHint()}
        >
          <div className="flex flex-wrap items-center gap-1">
            {TAKE_LENGTHS.map((choice) => (
              <Button
                key={choice.id}
                size="sm"
                variant={takeVariant(settings.recordBars === choice.bars)}
                onClick={() => updateSettings({ recordBars: choice.bars })}
                title={`Record ${choice.label} bar(s)`}
              >
                {choice.label}
              </Button>
            ))}
          </div>
        </SetupBlock>

        <SetupBlock
          title="Start on first note"
          value={triggerValue(settings.autoStart, settings.triggerDb)}
          hint={startHint()}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={takeVariant(settings.autoStart)}
              onClick={() => updateSettings({ autoStart: !settings.autoStart })}
              role="switch"
              aria-checked={settings.autoStart}
            >
              {triggerToggleLabel(settings.autoStart)}
            </Button>
            <div className="flex-1 min-w-[9rem] flex flex-col gap-1">
              <TriggerMeter triggerDb={settings.triggerDb} />
              <input
                type="range"
                min={TRIGGER_DB_MIN}
                max={TRIGGER_DB_MAX}
                step={1}
                value={settings.triggerDb}
                disabled={!settings.autoStart}
                onChange={(event) => updateSettings({ triggerDb: Number(event.target.value) })}
                className="w-full accent-accent-red"
                aria-label="Trigger level in dBFS"
              />
            </div>
          </div>
        </SetupBlock>

        <SetupBlock
          title="Loop join"
          value={`${settings.tailBlendMs} ms`}
          hint="How much of the ring-out past the loop end is mixed back over the downbeat. The downbeat itself is never faded , raise this if the wrap sounds cut off, lower it if the last chord smears."
        >
          <input
            type="range"
            min={0}
            max={TAIL_BLEND_MAX_MS}
            step={10}
            value={settings.tailBlendMs}
            onChange={(event) => updateSettings({ tailBlendMs: Number(event.target.value) })}
            className="w-full accent-accent-amber"
            aria-label="Loop join length in milliseconds"
          />
        </SetupBlock>
      </div>

      <SetupBlock
        title="Timing trim"
        value={`device ${looper.latencyMs} ms · trim ${signedMs(settings.latencyTrimMs)}`}
        hint="Your interface reports the first number and the app already compensates for it. If overdubs still land late, raise the trim; if they land early, lower it. One click ≈ 5 ms. It only moves where the loop starts inside audio recorded either way, so it never trims the front off a take, and it leaves a take recorded with nothing playing alone."
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="range"
            min={LATENCY_TRIM_MIN_MS}
            max={LATENCY_TRIM_MAX_MS}
            step={5}
            value={settings.latencyTrimMs}
            onChange={(event) => updateSettings({ latencyTrimMs: Number(event.target.value) })}
            className="flex-1 min-w-[10rem] accent-accent-amber"
            aria-label="Extra latency trim in milliseconds"
          />
          <span className="font-mono-display text-caption text-text-secondary tabular-nums w-20 text-right">
            {signedMs(settings.latencyTrimMs)}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={settings.latencyTrimMs === 0}
            onClick={() => updateSettings({ latencyTrimMs: 0 })}
          >
            RESET
          </Button>
        </div>
      </SetupBlock>

      <div className={BLOCK_CLASS}>
        <span className={TITLE_CLASS}>Keyboard</span>
        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {LOOPER_HOTKEYS.map((hotkey) => (
            <div key={hotkey.keys} className="flex items-baseline gap-2">
              <kbd
                className="font-mono-display text-micro text-text-secondary uppercase
                  tracking-widest px-1.5 py-0.5 rounded border border-border-active
                  bg-bg-deep shrink-0"
              >
                {hotkey.keys}
              </kbd>
              <span className={HINT_CLASS}>{hotkey.label}</span>
            </div>
          ))}
        </div>
        <p className={HINT_CLASS}>
          Work anywhere in the app while capture is on , the drawer does not have to
          be open. They stand down while you are typing in a field.
        </p>
      </div>
    </div>
  );
}
