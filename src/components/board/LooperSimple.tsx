import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { LooperApi } from '@/hooks/useLooper';
import type { LooperTempo } from '@/components/board/LooperSetup';
import { LooperTimeline } from '@/components/board/LooperTimeline';
import {
  LooperImportButton,
  LooperInputMeter,
  LooperMasterLevel,
  LooperTrackList,
} from '@/components/board/LooperControls';
import { LooperStomps } from '@/components/board/LooperStomps';
import { fmtCycle, playAllLabel, recordButtonState } from '@/components/board/looperLabels';
import type { LooperActionKind } from '@/core/looperBindings';
import type { LooperTriggerMap } from '@/core/looperTriggers';
import type { LearnNotice } from '@/hooks/useLooperTriggers';

// The loop station's SIMPLE face: one big button that says what it will do,
// four small ones for everything you touch mid-session, a volume knob, and the
// picture. Nothing here has to be configured before it works.
//
// Footswitch assignments ARE here, compacted to one button per action
// (LooperStomps): hands-free transport is not an advanced feature on a looper,
// it is the only way to work one while both hands are on the guitar.
//
// What is deliberately NOT here: latency trim, loop-join length, trigger
// threshold, fixed take lengths and EXP routing. Every one of those has a
// default that is right for a first loop, and all of them are one click away
// under ADVANCED. The thing that made the old panel hard was never any single
// control , it was meeting twenty-five of them at once.

interface LooperSimpleProps {
  looper: LooperApi;
  /** the practice drum machine's bar, offered as a one-tap grid to lock to */
  tempo: LooperTempo;
  /* MIDI-learn: assign a hardware stomp to each transport action */
  triggers: LooperTriggerMap;
  armedAction: LooperActionKind | null;
  onArmLearn: (action: LooperActionKind) => void;
  onClearTrigger: (action: LooperActionKind) => void;
  /** forget every assigned stomp at once */
  onClearAll: () => void;
  learnNotice: LearnNotice | null;
  /** learning needs a connected GP-200 */
  learnEnabled: boolean;
}

function syncVariant(locked: boolean): 'primary' | 'secondary' {
  if (locked) return 'primary';
  return 'secondary';
}

function syncLabel(locked: boolean, tempo: LooperTempo): string {
  if (locked) return `↻ SYNCED · ${tempo.label}`;
  return '↻ SYNC TO DRUMS';
}

function syncTitle(locked: boolean): string {
  if (locked) {
    return 'The loop is locked to the drum machine. Click to let your first take set it instead';
  }
  return 'Take the bar length from the practice drum machine, so the loop lands exactly in time';
}

export function LooperSimple({
  looper,
  tempo,
  triggers,
  armedAction,
  onArmLearn,
  onClearTrigger,
  onClearAll,
  learnNotice,
  learnEnabled,
}: LooperSimpleProps) {
  const [importError, setImportError] = useState<string | null>(null);
  const button = recordButtonState(looper);
  const noTracks = looper.tracks.length === 0;

  const handleSync = () => {
    if (looper.baseLocked) {
      looper.unlockBase();
      return;
    }
    looper.lockBaseSeconds(tempo.barSeconds);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* The one control. Its label is the next thing that will happen, and the
          line under it is why , which is what lets the wait states (listening
          for a note, waiting for a downbeat) stop being a mystery. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-stretch gap-2">
          <Button
            variant={button.variant}
            size="lg"
            className="flex-1 py-5 text-lg tracking-widest"
            onClick={looper.toggleRecord}
          >
            {button.label}
          </Button>
          {button.live && (
            <Button
              variant="ghost"
              size="lg"
              onClick={looper.cancelRecord}
              title="Throw this take away and keep everything else (Ctrl+Z)"
              aria-label="Cancel this take"
            >
              ✕
            </Button>
          )}
        </div>
        <p className="font-mono-display text-caption text-text-muted text-center">
          {button.hint}
        </p>
      </div>

      {looper.isRecording && <LooperInputMeter barClassName="flex-1" />}

      {/* Everything else you reach for mid-session, at one size, in one row. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={noTracks}
          onClick={looper.togglePlayAll}
          title="Play or stop every track together (Space)"
        >
          {playAllLabel(looper.anyPlaying)}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!looper.canUndo && !button.live}
          onClick={looper.undo}
          title="Cancels the take in progress, otherwise removes the last one (Ctrl+Z)"
        >
          ↶ UNDO
        </Button>
        <LooperImportButton looper={looper} onError={setImportError} className="w-full" />
        <Button
          variant="danger"
          size="sm"
          disabled={noTracks}
          onClick={looper.clearAll}
          title="Delete every track and start over"
        >
          CLEAR
        </Button>
      </div>

      <LooperMasterLevel
        level={looper.settings.masterLevel}
        onChange={(level) => looper.updateSettings({ masterLevel: level })}
      />

      {importError && (
        <p
          className="font-mono-display text-caption text-accent-red px-3 py-2 rounded-lg
            border border-accent-red bg-accent-red/10"
        >
          {importError}
        </p>
      )}

      {/* The loop's length, plus the single setup decision worth surfacing here:
          locking the bar to the drum machine is the only way to get a loop with
          no stop-press reaction time in it, and it costs one tap. It disappears
          once something is recorded, because by then the bar is fixed. */}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 rounded-lg
          border border-border-active"
      >
        <span
          className="font-mono-display text-label text-text-secondary uppercase
            tracking-widest"
        >
          Loop
        </span>
        <span className="font-mono-display text-caption text-text-secondary tabular-nums">
          {fmtCycle(looper.cycleBars, looper.cycleDurationSec, looper.baseDurationSec)}
        </span>
        {!looper.hasContent && (
          <Button
            size="sm"
            variant={syncVariant(looper.baseLocked)}
            className="ml-auto"
            onClick={handleSync}
            title={syncTitle(looper.baseLocked)}
          >
            {syncLabel(looper.baseLocked, tempo)}
          </Button>
        )}
      </div>

      <LooperTimeline looper={looper} />
      <LooperTrackList looper={looper} compact />

      <div className="pt-2 border-t border-border-active">
        <LooperStomps
          triggers={triggers}
          armedAction={armedAction}
          onArmLearn={onArmLearn}
          onClearTrigger={onClearTrigger}
          onClearAll={onClearAll}
          learnNotice={learnNotice}
          learnEnabled={learnEnabled}
        />
      </div>

      <p className="font-mono-display text-caption text-text-muted">
        Keys: <strong>R</strong> record · <strong>Space</strong> play/stop ·{' '}
        <strong>Ctrl+Z</strong> undo. They work with this drawer shut.
      </p>
    </div>
  );
}
