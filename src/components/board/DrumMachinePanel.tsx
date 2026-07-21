import { useEffect, useMemo, useState } from 'react';
import {
  DRUM_KITS,
  DRUM_LANES,
  DRUM_PATTERNS,
  RANDOM_STYLES,
  STEP_COUNT,
  type DrumPattern,
  type RandomStyle,
} from '@/core/drumMachine';
import { DRUM_BPM_MAX, DRUM_BPM_MIN, type DrumMachineApi } from '@/hooks/useDrumMachine';
import { Button } from '@/components/ui/Button';
import { Led } from '@/components/ui/Badge';

interface DrumMachinePanelProps {
  drums: DrumMachineApi;
}

const SELECT_CLASS =
  'bg-bg-primary border border-border-active rounded px-2 py-1 ' +
  'font-mono-display text-caption text-text-secondary';

/** Step positions are the cells' identity, so the grid maps over these. */
const STEP_INDICES = [...Array(STEP_COUNT).keys()];

function playLabel(playing: boolean): string {
  if (playing) return '■ STOP';
  return '▶ PLAY';
}

/* Visuals live in board.css (.dm-cell family) so the playhead glow and the
   hit "pop" animate with CSS transitions instead of utility-class swaps. */
function cellClass(velocity: number, isBeatStart: boolean, isCurrent: boolean): string {
  const classes = ['dm-cell'];
  if (velocity >= 1) classes.push('dm-accent');
  else if (velocity >= 0.5) classes.push('dm-on');
  else if (velocity > 0) classes.push('dm-ghost');
  if (isBeatStart) classes.push('dm-beat');
  if (isCurrent) classes.push('dm-now');
  if (isCurrent && velocity > 0) classes.push('dm-hit');
  return classes.join(' ');
}

function laneButtonClass(muted: boolean): string {
  const classes = [
    'w-20 shrink-0 text-left font-mono-display text-label uppercase tracking-wider',
    'rounded px-1.5 py-1 border border-transparent hover:border-border-active',
  ];
  if (muted) classes.push('text-text-muted line-through');
  else classes.push('text-text-secondary');
  return classes.join(' ');
}

interface DrumSliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
}

function DrumSlider({ label, min, max, step, value, display, onChange }: DrumSliderProps) {
  return (
    <div className="flex items-center gap-2 min-w-44 flex-1">
      <span className="font-mono-display text-label text-text-secondary w-12">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="flex-1 min-w-16 accent-accent-amber"
        aria-label={label}
      />
      <b className="font-mono-display text-caption text-text-secondary w-10 text-right tabular-nums">
        {display}
      </b>
    </div>
  );
}

/**
 * Browser practice drum machine: plays the CC0 sample kits in public/drums/
 * through Web Audio (useDrumMachine), fully offline and independent of the
 * GP-200 — this is the backing-track metronome you jam over, not the
 * hardware drums remote (DrumsPanel). The hook lives in App, so playback
 * keeps running when this panel's drawer closes.
 */
export function DrumMachinePanel({ drums }: DrumMachinePanelProps) {
  const [randomStyle, setRandomStyle] = useState<RandomStyle>('Rock');
  // Playhead polled inside rAF (getCurrentStep is a ref-read, like the audio
  // meters): only THIS component re-renders per step, and only when the step
  // actually changes — the drawer and the selects above never churn.
  const { playing, getCurrentStep } = drums;
  const [displayStep, setDisplayStep] = useState(-1);
  useEffect(() => {
    if (!playing) {
      setDisplayStep(-1);
      return;
    }
    let frame = 0;
    const follow = () => {
      setDisplayStep(getCurrentStep());
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [playing, getCurrentStep]);
  const patternGroups = useMemo(() => {
    const groups: { label: string; patterns: DrumPattern[] }[] = [];
    for (const drumPattern of DRUM_PATTERNS) {
      let group = groups.find((candidate) => candidate.label === drumPattern.group);
      if (!group) {
        group = { label: drumPattern.group, patterns: [] };
        groups.push(group);
      }
      group.patterns.push(drumPattern);
    }
    return groups;
  }, []);

  const isPresetPattern = DRUM_PATTERNS.some((candidate) => candidate.id === drums.patternId);
  const swingPercent = Math.round(drums.swing * 100);

  function handleStyleChange(value: string) {
    const known = RANDOM_STYLES.find((candidate) => candidate === value);
    setRandomStyle(known ?? 'Rock');
  }

  return (
    <div className="flex flex-col gap-3" data-testid="drum-machine">
      {/* transport + sound selection */}
      <div className="flex flex-wrap items-center gap-2">
        <Led active={drums.playing} />
        <Button
          variant="secondary"
          size="sm"
          disabled={drums.loading}
          title="Start/stop the practice drums (browser audio)"
          onClick={drums.togglePlay}
        >
          {playLabel(drums.playing)}
        </Button>
        <select
          value={drums.kitId}
          onChange={(event) => drums.selectKit(event.target.value)}
          className={SELECT_CLASS}
          aria-label="Drum kit"
        >
          {DRUM_KITS.map((kit) => (
            <option key={kit.id} value={kit.id} title={kit.description}>
              {kit.name}
            </option>
          ))}
        </select>
        <select
          value={drums.patternId}
          onChange={(event) => drums.selectPattern(event.target.value)}
          className={`${SELECT_CLASS} min-w-0 flex-1`}
          aria-label="Drum pattern"
        >
          {!isPresetPattern && <option value={drums.patternId}>{drums.patternName}</option>}
          {patternGroups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.patterns.map((drumPattern) => (
                <option key={drumPattern.id} value={drumPattern.id}>
                  {drumPattern.name} — {drumPattern.bpm} BPM
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          value={randomStyle}
          onChange={(event) => handleStyleChange(event.target.value)}
          className={SELECT_CLASS}
          aria-label="Randomizer style"
        >
          {RANDOM_STYLES.map((style) => (
            <option key={style} value={style}>
              {style}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="sm"
          title="Roll a new random groove in the selected style"
          onClick={() => drums.randomize(randomStyle)}
        >
          🎲 RANDOM
        </Button>
      </div>

      {/* feel + level */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <DrumSlider
          label="BPM"
          min={DRUM_BPM_MIN}
          max={DRUM_BPM_MAX}
          step={1}
          value={drums.bpm}
          display={String(drums.bpm)}
          onChange={drums.setBpm}
        />
        <DrumSlider
          label="SWING"
          min={0}
          max={50}
          step={1}
          value={swingPercent}
          display={`${swingPercent}%`}
          onChange={(percent) => drums.setSwing(percent / 100)}
        />
        <DrumSlider
          label="VOL"
          min={0}
          max={100}
          step={1}
          value={drums.volume}
          display={String(drums.volume)}
          onChange={drums.setVolume}
        />
      </div>

      {drums.loading && (
        <p className="font-mono-display text-caption text-text-secondary">Loading kit…</p>
      )}
      {drums.error && (
        <p className="font-mono-display text-caption text-accent-red">{drums.error}</p>
      )}

      {/* step grid: click a cell to toggle a hit, click a lane name to mute it */}
      <div className="overflow-x-auto">
        <div className="flex flex-col gap-1 min-w-[34rem]">
          {DRUM_LANES.map((lane) => (
            <div key={lane.id} className="flex items-center gap-1">
              <button
                type="button"
                className={laneButtonClass(drums.mutedLanes.has(lane.id))}
                aria-pressed={drums.mutedLanes.has(lane.id)}
                title={`Mute/unmute ${lane.label}`}
                onClick={() => drums.toggleLaneMute(lane.id)}
              >
                {lane.label}
              </button>
              {STEP_INDICES.map((stepIndex) => (
                <button
                  key={stepIndex}
                  type="button"
                  className={cellClass(
                    drums.steps[lane.id][stepIndex],
                    stepIndex % 4 === 0 && stepIndex > 0,
                    drums.playing && displayStep === stepIndex,
                  )}
                  aria-label={`${lane.label} step ${stepIndex + 1}`}
                  aria-pressed={drums.steps[lane.id][stepIndex] > 0}
                  onClick={() => drums.toggleStep(lane.id, stepIndex)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="font-mono-display text-caption text-text-muted">
        Plays in the browser — no GP-200 needed. Pick a groove, roll the dice, and jam over it.
      </p>
    </div>
  );
}
