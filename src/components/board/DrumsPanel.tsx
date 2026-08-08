import { useState } from 'react';
import {
  type CCCommand,
  drumsPlay,
  drumsRhythm,
  drumsShow,
  drumsVolume,
  tapTempo,
  tunerShow,
} from '@/core/ccControl';
import { DRUM_RHYTHMS, groupDrumRhythms } from '@/core/drumRhythms';
import { Button } from '@/components/ui/Button';
import { Led } from '@/components/ui/Badge';
import { CcSlider, SectionHeading } from '@/components/board/CcControls';
import {
  SELECT_CLASS,
  disabledTitle,
  playStopLabel,
  toggleVariant,
} from '@/components/board/ccUi';

interface DrumsPanelProps {
  connected: boolean;
  sendCC: (command: CCCommand | CCCommand[]) => void;
  /** CC channel index 0..15 (displayed 1..16). */
  ccChannel: number;
  onCcChannelChange: (channel: number) => void;
}

const CHANNEL_INDEXES = [...Array(16).keys()];

function tunerVariant(open: boolean): 'danger' | 'ghost' {
  if (open) return 'danger';
  return 'ghost';
}

/**
 * Remote control for the GP-200's BUILT-IN drum machine and tuner, via plain
 * MIDI CC (src/core/ccControl.ts). The pedal's own looper used to live here
 * too; it moved next to the browser loop station it is easily confused with
 * (DeviceLooperPanel.tsx, in the LOOP drawer).
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
  // Tuner
  const [tunerOpen, setTunerOpen] = useState(false);

  const rhythm = DRUM_RHYTHMS[rhythmIndex];
  const rhythmGroups = groupDrumRhythms();

  return (
    <div className="flex flex-col gap-4">
      {/* Drum machine */}
      <div className="flex flex-col gap-2">
        <SectionHeading>Drum machine</SectionHeading>
        {/* The rhythm select drops to its own full-width line on phones */}
        <div className="flex flex-wrap items-center gap-2">
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
            className={`order-last basis-full sm:order-none sm:basis-0 sm:flex-1 min-w-0
              ${SELECT_CLASS} disabled:opacity-40`}
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

      {/* Tuner / tempo / channel */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-active">
        <Button
          variant={tunerVariant(tunerOpen)}
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
        <span className="font-mono-display text-caption text-text-muted basis-full sm:basis-auto">
          must match the GP-200's global MIDI channel (default 1)
        </span>
      </div>
    </div>
  );
}
