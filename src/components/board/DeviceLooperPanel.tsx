import { useEffect, useRef, useState } from 'react';
import {
  type CCCommand,
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
} from '@/core/ccControl';
import { Button } from '@/components/ui/Button';
import { Led } from '@/components/ui/Badge';
import { CcSlider } from '@/components/board/CcControls';
import { disabledTitle, playStopLabel, toggleVariant } from '@/components/board/ccUi';
import { trackOnce } from '@/core/analytics';

interface DeviceLooperPanelProps {
  connected: boolean;
  sendCC: (command: CCCommand | CCCommand[]) => void;
}

/** How long the DELETE button stays armed before falling back to safe. */
const DELETE_ARM_MS = 3000;

/**
 * Remote control for the GP-200's OWN single-track looper over plain MIDI CC
 * (src/core/ccControl.ts) , a different machine from the browser-audio loop
 * station it sits under in the LOOP drawer. Collapsed by default so the loop
 * station stays the headline of that drawer.
 *
 * All state here is optimistic/local: these CCs are fire-and-forget and the
 * device sends no feedback for them, so the panel tracks what it last sent.
 * The device's own screen (opened via SHOW) is the ground truth.
 */
export function DeviceLooperPanel({ connected, sendCC }: DeviceLooperPanelProps) {
  const [looperPlaying, setLooperPlaying] = useState(false);
  const [looperShown, setLooperShown] = useState(false);
  const [autoRec, setAutoRec] = useState(false);
  const [halfSpeed, setHalfSpeed] = useState(false);
  const [reversed, setReversed] = useState(false);
  const [placementFront, setPlacementFront] = useState(true);
  const [recLevel, setRecLevel] = useState(50);
  const [playLevel, setPlayLevel] = useState(50);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (deleteTimer.current !== null) window.clearTimeout(deleteTimer.current);
    };
  }, []);

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
    <details className="group">
      <summary
        className="font-mono-display text-label text-text-muted uppercase
          tracking-widest cursor-pointer select-none list-none"
      >
        <span className="group-open:hidden">▸ GP-200 built-in looper</span>
        <span className="hidden group-open:inline">▾ GP-200 built-in looper</span>
      </summary>
      <p className="font-mono-display text-caption text-text-muted mt-2 mb-3">
        The pedal&apos;s own single loop, driven over MIDI CC , separate from the
        multi-track loop station above.
      </p>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Led active={looperPlaying} />
          <Button
            variant="danger"
            size="sm"
            disabled={!connected}
            title={disabledTitle(connected, 'Start recording / overdub')}
            onClick={() => {
              // The pedal's OWN looper, not the browser loop station this panel
              // nests under. Deduped per session: the CC is fire-and-forget with
              // no device feedback, so this only ever means "pressed record".
              trackOnce('device-looper', 'device_looper_record', { connected });
              sendCC(looperRecord());
            }}
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
    </details>
  );
}
