import { useEffect, useRef, useState } from 'react';
import {
  type CCCommand,
  drumsPlay,
  drumsRhythm,
  drumsShow,
  drumsVolume,
  looperAutoRecord,
  looperDelete,
  looperHalfSpeed,
  looperPlacement,
  looperPlay,
  looperPlaybackVolume,
  looperRecVolume,
  looperRecord,
  looperReverse,
  looperShow,
  tapTempo,
  tunerShow,
} from '@/core/ccControl';
import { DRUM_RHYTHMS, groupDrumRhythms } from '@/core/drumRhythms';
import { Button } from '@/components/ui/Button';
import { Led } from '@/components/ui/Badge';

interface DrumsPanelProps {
  connected: boolean;
  sendCC: (command: CCCommand | CCCommand[]) => void;
  /** CC channel index 0..15 (displayed 1..16). */
  ccChannel: number;
  onCcChannelChange: (channel: number) => void;
}

const SELECT_CLASS =
  'bg-bg-primary border border-border-active rounded px-2 py-1 ' +
  'font-mono-display text-caption text-text-secondary';

const CHANNEL_INDEXES = [...Array(16).keys()];

/** How long the DELETE button stays armed before falling back to safe. */
const DELETE_ARM_MS = 3000;

function toggleVariant(on: boolean): 'primary' | 'ghost' {
  if (on) return 'primary';
  return 'ghost';
}

function playStopLabel(playing: boolean): string {
  if (playing) return '■ STOP';
  return '▶ PLAY';
}

function disabledTitle(connected: boolean, action: string): string {
  if (connected) return action;
  return 'Connect the GP-200 to use this';
}

interface SectionHeadingProps {
  children: React.ReactNode;
}

function SectionHeading({ children }: SectionHeadingProps) {
  return (
    <p className="font-mono-display text-label text-text-muted uppercase tracking-widest">
      {children}
    </p>
  );
}

interface CcSliderProps {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

function CcSlider({ label, value, disabled, onChange }: CcSliderProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono-display text-label text-text-secondary w-20">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="flex-1 min-w-16 accent-accent-amber"
        aria-label={label}
      />
      <b className="font-mono-display text-caption text-text-secondary w-8 text-right tabular-nums">
        {value}
      </b>
    </div>
  );
}

/**
 * Remote control for the GP-200's BUILT-IN drum machine, single-track looper,
 * and tuner, via plain MIDI CC (src/core/ccControl.ts) — distinct from the
 * browser-audio loop station in LooperPanel.tsx.
 *
 * All state here is optimistic/local: these CCs are fire-and-forget and the
 * device sends no feedback for them, so the panel tracks what it last sent.
 * The device's own screen (opened via the SHOW toggles) is the ground truth.
 */
export function DrumsPanel({
  connected,
  sendCC,
  ccChannel,
  onCcChannelChange,
}: DrumsPanelProps) {
  // Drum machine
  const [drumsOn, setDrumsOn] = useState(false);
  const [drumsShown, setDrumsShown] = useState(false);
  const [rhythmIndex, setRhythmIndex] = useState(0);
  const [drumsLevel, setDrumsLevel] = useState(50);
  // Device looper
  const [looperPlaying, setLooperPlaying] = useState(false);
  const [looperShown, setLooperShown] = useState(false);
  const [autoRec, setAutoRec] = useState(false);
  const [halfSpeed, setHalfSpeed] = useState(false);
  const [reversed, setReversed] = useState(false);
  const [placementFront, setPlacementFront] = useState(true);
  const [recLevel, setRecLevel] = useState(50);
  const [playLevel, setPlayLevel] = useState(50);
  // Tuner + destructive-delete arming
  const [tunerOpen, setTunerOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (deleteTimer.current !== null) window.clearTimeout(deleteTimer.current);
    };
  }, []);

  const rhythm = DRUM_RHYTHMS[rhythmIndex];
  const rhythmGroups = groupDrumRhythms();

  function handleDelete() {
    if (deleteTimer.current !== null) window.clearTimeout(deleteTimer.current);
    if (!deleteArmed) {
      setDeleteArmed(true);
      deleteTimer.current = window.setTimeout(() => setDeleteArmed(false), DELETE_ARM_MS);
      return;
    }
    setDeleteArmed(false);
    sendCC(looperDelete());
    setLooperPlaying(false);
  }

  let deleteLabel = 'DELETE';
  if (deleteArmed) deleteLabel = 'SURE?';
  let deleteVariant: 'danger' | 'ghost' = 'ghost';
  if (deleteArmed) deleteVariant = 'danger';

  return (
    <div className="flex flex-col gap-4">
      {/* Drum machine */}
      <div className="flex flex-col gap-2">
        <SectionHeading>Drum machine</SectionHeading>
        <div className="flex items-center gap-2">
          <Led active={drumsOn} />
          <Button
            variant="secondary"
            size="sm"
            disabled={!connected}
            title={disabledTitle(connected, 'Start/stop the drum machine')}
            onClick={() => {
              const next = !drumsOn;
              setDrumsOn(next);
              sendCC(drumsPlay(next));
            }}
          >
            {playStopLabel(drumsOn)}
          </Button>
          <select
            value={rhythmIndex}
            disabled={!connected}
            onChange={(event) => {
              const index = Number(event.target.value);
              setRhythmIndex(index);
              sendCC(drumsRhythm(index));
            }}
            className={`flex-1 ${SELECT_CLASS} disabled:opacity-40`}
            aria-label="Drum rhythm"
          >
            {rhythmGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.rhythms.map((groupRhythm) => (
                  <option key={groupRhythm.index} value={groupRhythm.index}>
                    {groupRhythm.name} — {groupRhythm.signature}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="font-mono-display text-caption text-text-muted w-8">
            {rhythm.signature}
          </span>
          <Button
            variant={toggleVariant(drumsShown)}
            size="sm"
            disabled={!connected}
            title={disabledTitle(connected, "Show/hide the drum menu on the device's screen")}
            onClick={() => {
              const next = !drumsShown;
              setDrumsShown(next);
              sendCC(drumsShow(next));
            }}
          >
            SHOW
          </Button>
        </div>
        <CcSlider
          label="DRUM VOL"
          value={drumsLevel}
          disabled={!connected}
          onChange={(value) => {
            setDrumsLevel(value);
            sendCC(drumsVolume(value));
          }}
        />
      </div>

      {/* Built-in looper */}
      <div className="flex flex-col gap-2 pt-2 border-t border-border-active">
        <SectionHeading>
          Built-in looper{' '}
          <span className="normal-case tracking-normal">
            (the GP-200's own single loop — the multi-track LOOP drawer is separate)
          </span>
        </SectionHeading>
        <div className="flex items-center gap-2">
          <Led active={looperPlaying} />
          <Button
            variant="danger"
            size="sm"
            disabled={!connected}
            title={disabledTitle(connected, 'Start recording / overdub')}
            onClick={() => sendCC(looperRecord())}
          >
            ● REC
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!connected}
            title={disabledTitle(connected, 'Play or stop the loop')}
            onClick={() => {
              const next = !looperPlaying;
              setLooperPlaying(next);
              sendCC(looperPlay(next));
            }}
          >
            {playStopLabel(looperPlaying)}
          </Button>
          <Button
            variant={deleteVariant}
            size="sm"
            disabled={!connected}
            title={disabledTitle(connected, 'Delete the loop (click twice to confirm)')}
            onClick={handleDelete}
          >
            {deleteLabel}
          </Button>
          <span className="flex-1" />
          <Button
            variant={toggleVariant(looperShown)}
            size="sm"
            disabled={!connected}
            title={disabledTitle(connected, "Show/hide the looper on the device's screen")}
            onClick={() => {
              const next = !looperShown;
              setLooperShown(next);
              sendCC(looperShow(next));
            }}
          >
            SHOW
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={toggleVariant(autoRec)}
            size="sm"
            disabled={!connected}
            title={disabledTitle(connected, 'Start recording automatically when you play')}
            onClick={() => {
              const next = !autoRec;
              setAutoRec(next);
              sendCC(looperAutoRecord(next));
            }}
          >
            AUTO REC
          </Button>
          <Button
            variant={toggleVariant(halfSpeed)}
            size="sm"
            disabled={!connected}
            title={disabledTitle(connected, 'Play the loop at half speed')}
            onClick={() => {
              const next = !halfSpeed;
              setHalfSpeed(next);
              sendCC(looperHalfSpeed(next));
            }}
          >
            ½ SPEED
          </Button>
          <Button
            variant={toggleVariant(reversed)}
            size="sm"
            disabled={!connected}
            title={disabledTitle(connected, 'Play the loop in reverse')}
            onClick={() => {
              const next = !reversed;
              setReversed(next);
              sendCC(looperReverse(next));
            }}
          >
            REVERSE
          </Button>
          <Button
            variant={toggleVariant(!placementFront)}
            size="sm"
            disabled={!connected}
            title={disabledTitle(
              connected,
              'Record before (FRONT) or after (REAR) the effect chain',
            )}
            onClick={() => {
              const front = !placementFront;
              setPlacementFront(front);
              if (front) sendCC(looperPlacement('front'));
              if (!front) sendCC(looperPlacement('rear'));
            }}
          >
            {placementFront && 'FRONT'}
            {!placementFront && 'REAR'}
          </Button>
        </div>
        <CcSlider
          label="REC VOL"
          value={recLevel}
          disabled={!connected}
          onChange={(value) => {
            setRecLevel(value);
            sendCC(looperRecVolume(value));
          }}
        />
        <CcSlider
          label="PLAY VOL"
          value={playLevel}
          disabled={!connected}
          onChange={(value) => {
            setPlayLevel(value);
            sendCC(looperPlaybackVolume(value));
          }}
        />
      </div>

      {/* Tuner / tempo / channel */}
      <div className="flex items-center gap-2 pt-2 border-t border-border-active">
        <Button
          variant={toggleVariant(tunerOpen)}
          size="sm"
          disabled={!connected}
          title={disabledTitle(connected, "Open/close the tuner on the device's screen")}
          onClick={() => {
            const next = !tunerOpen;
            setTunerOpen(next);
            sendCC(tunerShow(next));
          }}
        >
          TUNER
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!connected}
          title={disabledTitle(connected, 'Tap to set the device tempo')}
          onClick={() => sendCC(tapTempo())}
        >
          TAP
        </Button>
        <span className="flex-1" />
        <span className="font-mono-display text-label text-text-secondary">MIDI CH</span>
        <select
          value={ccChannel}
          onChange={(event) => onCcChannelChange(Number(event.target.value))}
          className={SELECT_CLASS}
          aria-label="MIDI channel for CC control"
        >
          {CHANNEL_INDEXES.map((channelIndex) => (
            <option key={channelIndex} value={channelIndex}>
              {channelIndex + 1}
            </option>
          ))}
        </select>
        <span className="font-mono-display text-caption text-text-muted">
          must match the GP-200's global MIDI channel (default 1)
        </span>
      </div>
    </div>
  );
}
