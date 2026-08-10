import { useState } from 'react';
import {
  type CCCommand,
  TEMPO_MAX_BPM,
  TEMPO_MIN_BPM,
  bankStep,
  ctrlTap,
  patchStep,
  quickAccessParam,
  tempoBpm,
} from '@/core/ccControl';
import { Button } from '@/components/ui/Button';
import { CcSlider, SectionHeading } from '@/components/board/CcControls';
import { SELECT_CLASS, disabledTitle } from '@/components/board/ccUi';

interface RemotePanelProps {
  connected: boolean;
  sendCC: (command: CCCommand | CCCommand[]) => void;
}

const CTRL_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];
const QUICK_KNOB_NUMBERS = [1, 2, 3];

/**
 * MIDI-CC remote for GP-200 commands the app has no other surface for:
 * virtual CTRL 1–8 footswitch taps, bank/patch stepping, direct tempo, and
 * the three Quick Access knobs. All plain CC from the manual's MIDI Control
 * Information List (src/core/ccControl.ts). The EXP 1 position/A-B live
 * controls deliberately live in ControllerPanel (PATCH SETTINGS drawer),
 * next to the assignments they exercise.
 *
 * Fire-and-forget like the drums/looper panels: the device sends no
 * feedback, so slider state is what was last sent, and the CTRL taps are
 * momentary commands with no state at all. Module on/off CCs (48–57) exist
 * in ccControl.ts but get no buttons here , the pedalboard's own switches
 * already toggle modules over SysEx with real state tracking.
 */
export function RemotePanel({ connected, sendCC }: RemotePanelProps) {
  const [tempo, setTempo] = useState(120);
  const [quickValues, setQuickValues] = useState<number[]>([50, 50, 50]);

  function handleQuickChange(knobNumber: number, value: number) {
    setQuickValues((previous) =>
      previous.map((quickValue, knobIndex) => {
        // index is the knob identity here: quickValues is positional by knob
        if (knobIndex === knobNumber - 1) return value;
        return quickValue;
      }),
    );
    sendCC(quickAccessParam(knobNumber, value));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Virtual CTRL footswitch taps */}
      <div className="flex flex-col gap-2">
        <SectionHeading>CTRL footswitches · virtual tap</SectionHeading>
        <div className="flex flex-wrap items-center gap-2">
          {CTRL_NUMBERS.map((ctrlNumber) => (
            <Button
              key={ctrlNumber}
              variant="secondary"
              size="sm"
              disabled={!connected}
              title={disabledTitle(
                connected,
                `Tap CTRL ${ctrlNumber} (fires its assigned action)`,
              )}
              onClick={() => sendCC(ctrlTap(ctrlNumber))}
            >
              {ctrlNumber}
            </Button>
          ))}
        </div>
      </div>

      {/* Bank / patch stepping */}
      <div className="flex flex-col gap-2">
        <SectionHeading>Bank / patch</SectionHeading>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!connected}
            title={disabledTitle(connected, 'Previous bank')}
            onClick={() => sendCC(bankStep('down'))}
          >
            BANK −
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!connected}
            title={disabledTitle(connected, 'Next bank')}
            onClick={() => sendCC(bankStep('up'))}
          >
            BANK +
          </Button>
          <span className="w-2" />
          <Button
            variant="ghost"
            size="sm"
            disabled={!connected}
            title={disabledTitle(connected, 'Previous patch')}
            onClick={() => sendCC(patchStep('down'))}
          >
            PATCH −
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!connected}
            title={disabledTitle(connected, 'Next patch')}
            onClick={() => sendCC(patchStep('up'))}
          >
            PATCH +
          </Button>
        </div>
      </div>

      {/* Direct tempo */}
      <div className="flex flex-wrap items-center gap-2">
        <SectionHeading>Tempo</SectionHeading>
        <input
          type="number"
          min={TEMPO_MIN_BPM}
          max={TEMPO_MAX_BPM}
          value={tempo}
          disabled={!connected}
          onChange={(event) => setTempo(Number(event.target.value))}
          className={`w-20 ${SELECT_CLASS} disabled:opacity-40`}
          aria-label="Device tempo in BPM"
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={!connected}
          title={disabledTitle(
            connected,
            `Set the device tempo (${TEMPO_MIN_BPM}–${TEMPO_MAX_BPM} BPM)`,
          )}
          onClick={() => sendCC(tempoBpm(tempo))}
        >
          SET BPM
        </Button>
      </div>

      {/* Quick Access knobs */}
      <div className="flex flex-col gap-2">
        <SectionHeading>Quick access knobs</SectionHeading>
        {QUICK_KNOB_NUMBERS.map((knobNumber) => (
          <CcSlider
            key={knobNumber}
            label={`KNOB ${knobNumber}`}
            value={quickValues[knobNumber - 1]}
            disabled={!connected}
            onChange={(value) => handleQuickChange(knobNumber, value)}
          />
        ))}
      </div>
    </div>
  );
}
