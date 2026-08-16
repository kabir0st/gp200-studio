import { useState } from 'react';
import type { LooperApi } from '@/hooks/useLooper';
import {
  type LooperBindings,
  type LooperActionKind,
  type ExpTarget,
} from '@/core/looperBindings';
import { Button } from '@/components/ui/Button';
import { LooperTimeline } from '@/components/board/LooperTimeline';
import { LooperSetup, type LooperTempo } from '@/components/board/LooperSetup';
import {
  LooperImportButton,
  LooperInputMeter,
  LooperMasterLevel,
  LooperTrackList,
} from '@/components/board/LooperControls';
import { LooperStomps } from '@/components/board/LooperStomps';
import { fmtCycle, playAllLabel, recordButtonState } from '@/components/board/looperLabels';
import type { LooperTriggerMap } from '@/core/looperTriggers';
import type { LearnNotice } from '@/hooks/useLooperTriggers';

// The loop station's ADVANCED face: everything the simple one hides. Capture
// edges (LooperSetup), footswitch learning, EXP routing and per-track
// transport, on top of the same transport and track list the simple face uses.

interface LooperAdvancedProps {
  looper: LooperApi;
  /** the practice drum machine's bar, offered as a grid to lock the loop to */
  tempo: LooperTempo;
  bindings: LooperBindings;
  onBindingsChange: (next: LooperBindings) => void;
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

const SELECT_CLASS =
  'bg-bg-primary border border-border-active rounded px-2 py-1 ' +
  'font-mono-display text-caption text-text-secondary';






/** One line of "what this take will do", so the setup drawer can stay shut. */
function setupSummary(looper: LooperApi): string {
  const parts: string[] = [];
  if (looper.baseDurationSec === null) parts.push('bar not set');
  else parts.push(`bar ${looper.baseDurationSec.toFixed(2)}s`);
  if (looper.baseLocked) parts.push('locked to drums');
  if (looper.settings.recordBars === null) parts.push('free length');
  else parts.push(`${looper.settings.recordBars}-bar takes`);
  if (looper.settings.autoStart) parts.push('starts on first note');
  parts.push(`join ${looper.settings.tailBlendMs}ms`);
  if (looper.settings.latencyTrimMs !== 0) parts.push(`trim ${looper.settings.latencyTrimMs}ms`);
  return parts.join(' · ');
}

function expValue(target: ExpTarget): string {
  if (target === null) return 'none';
  if (target.kind === 'masterGain') return 'master';
  return 'selected';
}

export function LooperAdvanced({
  looper,
  tempo,
  bindings,
  onBindingsChange,
  triggers,
  armedAction,
  onArmLearn,
  onClearTrigger,
  onClearAll,
  learnNotice,
  learnEnabled,
}: LooperAdvancedProps) {
  const [importError, setImportError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(!looper.hasContent);
  const button = recordButtonState(looper);
  const noTracks = looper.tracks.length === 0;
  // The bar outlives the last track when it was locked to a tempo, and CLEAR is
  // the only way back to a blank transport , so it stays live while one exists.
  const nothingToClear = noTracks && looper.baseDurationSec === null;

  const updateExpTarget = (target: ExpTarget) => {
    onBindingsChange({ ...bindings, expTarget: target });
  };

  let trackReadout = '-/-';
  const selectedPosition = looper.tracks.findIndex(
    (trackRow) => trackRow.id === looper.selectedTrack,
  );
  if (selectedPosition >= 0) {
    trackReadout = `${selectedPosition + 1}/${looper.tracks.length}`;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Collapsible primer on the dynamic-track workflow */}
      <details className="group">
        <summary
          className="font-mono-display text-label text-text-muted uppercase
            tracking-widest cursor-pointer select-none list-none"
        >
          <span className="group-open:hidden">▸ How the looper works</span>
          <span className="hidden group-open:inline">▾ How the looper works</span>
        </summary>
        <ul
          className="font-mono-display text-caption text-text-muted mt-2 pl-4
            flex flex-col gap-1 list-disc"
        >
          <li>
            Records the GP-200&apos;s USB audio here in the browser , separate from
            the pedal&apos;s built-in looper, which is the collapsed section at the
            bottom of this drawer.
          </li>
          <li>
            <strong>Set the bar first.</strong> LOCK BAR TO DRUMS (in RECORD
            SETUP) takes the practice drum machine&apos;s tempo, so the loop length is
            exact. Otherwise the first thing in sets it , an imported file&apos;s own
            length, or your first take, stop-press reaction time and all.
          </li>
          <li>
            ● REC starts a NEW track. With START ON FIRST NOTE on, the first take
            waits for you to actually play and begins on the attack , the pick
            itself is kept, not clipped. Once a loop is running, takes drop in on
            the downbeat instead (◌ ARMED). Set a TAKE LENGTH in bars and the
            recorder stops itself, sample-exact, with nothing to press in time.
          </li>
          <li>
            The loop point is joined by mixing the ring-out captured PAST the end
            back over the downbeat , the downbeat is never faded in. LOOP JOIN
            sets how much: raise it if the wrap sounds cut off, lower it if the
            last chord smears over the top of the loop.
          </li>
          <li>
            If overdubs land consistently late or early, nudge TIMING TRIM. The
            app already compensates for the round trip your interface reports;
            the trim covers whatever that number misses. It only moves where the
            loop starts inside audio that was captured either way, so nudging it
            never costs you the front of a take , and it does nothing to a take
            recorded with nothing playing, which has no round trip to correct.
          </li>
          <li>
            The loop is as long as the LONGEST take. Play past the end and it
            grows another bar; shorter tracks simply repeat underneath , you can
            see the repeats ghosted in the timeline.
          </li>
          <li>
            VOLUME is the loop station&apos;s own output. Tracks sum, so stacking
            takes gets loud fast , a soft clipper keeps the mix from breaking
            up, but the level is still yours to set.
          </li>
          <li>
            ▶ PLAY stops or restarts all tracks together. ◀ / ▶ move the
            selected track (highlighted row) , that&apos;s the track the EXP pedal&apos;s
            &quot;Selected track level&quot; controls.
          </li>
          <li>
            <strong>Keys beat mice mid-phrase.</strong> R records, SPACE plays and
            stops, and Ctrl+Z throws away the take in progress (or steps back
            through finished ones). Full list in RECORD SETUP.
          </li>
          <li>
            Footswitches below: click the action you want, then step on any
            switch , that switch is remembered on this machine. Give the looper
            switches that do nothing else on the pedal (CTRL / TAP set to None);
            see the warning below for why.
          </li>
        </ul>
      </details>

      {/* Transport: the same controls the footswitch bindings target. REC/PLAY
          grow to fill narrow screens (primary touch targets); the track
          selector and Clear All wrap onto their own line when tight. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={button.variant}
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={looper.toggleRecord}
            title={button.hint}
          >
            {button.label}
          </Button>
          {button.live && (
            <Button
              variant="ghost"
              size="sm"
              onClick={looper.cancelRecord}
              title="Throw this take away and keep everything else (Ctrl+Z)"
            >
              ✕ CANCEL
            </Button>
          )}
          <LooperImportButton
            looper={looper}
            onError={setImportError}
            className="flex-1 sm:flex-none"
          />
          {looper.isRecording && (
            <LooperInputMeter barClassName="w-16 sm:w-20" />
          )}
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 sm:flex-none"
            disabled={noTracks}
            onClick={looper.togglePlayAll}
            title="Play all tracks / stop all tracks"
          >
            {playAllLabel(looper.anyPlaying)}
          </Button>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={noTracks}
              onClick={looper.selectPrevTrack}
              title="Select previous track"
            >
              ◀
            </Button>
            <span
              className="font-mono-display text-caption text-text-secondary tabular-nums
                w-12 text-center"
            >
              {trackReadout}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={noTracks}
              onClick={looper.selectNextTrack}
              title="Select next track"
            >
              ▶
            </Button>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <Button
              variant="secondary"
              size="sm"
              disabled={!looper.canUndo && !button.live}
              onClick={looper.undo}
              title="Undo , cancels the take in progress, otherwise steps back one (Ctrl+Z)"
            >
              ↶ UNDO
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!looper.canRedo}
              onClick={looper.redo}
              title="Redo (Ctrl+Shift+Z)"
            >
              ↷
            </Button>
            <Button variant="danger" size="sm" disabled={nothingToClear} onClick={looper.clearAll}>
              Clear All
            </Button>
          </div>
        </div>
        {/* The length model, stated plainly: bars, total, and one bar's worth */}
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono-display text-label text-text-muted uppercase tracking-widest">
            LOOP
          </span>
          <span className="font-mono-display text-caption text-text-secondary tabular-nums">
            {fmtCycle(looper.cycleBars, looper.cycleDurationSec, looper.baseDurationSec)}
          </span>
        </div>
      </div>

      <LooperMasterLevel
        level={looper.settings.masterLevel}
        onChange={(level) => looper.updateSettings({ masterLevel: level })}
      />

      {/* Capture settings: the four things that decide whether a loop lands in
          time and wraps cleanly. Open by default until the first take exists,
          because that is exactly when they matter and nobody goes looking for
          a collapsed panel before their loop sounds wrong. */}
      <details
        className="rounded-lg border border-border-active bg-bg-deep/40"
        open={setupOpen}
        onToggle={(event) => setSetupOpen(event.currentTarget.open)}
      >
        <summary
          className="px-3 py-2 cursor-pointer select-none list-none flex flex-wrap
            items-baseline gap-x-3 gap-y-1"
        >
          <span
            className="font-mono-display text-label text-text-secondary uppercase
              tracking-widest"
          >
            ⚙ Record setup
          </span>
          <span className="font-mono-display text-caption text-text-muted">
            {setupSummary(looper)}
          </span>
        </summary>
        <div className="px-3 pb-3">
          <LooperSetup looper={looper} tempo={tempo} />
        </div>
      </details>

      {importError && (
        <p
          className="font-mono-display text-caption text-accent-red px-3 py-2 rounded-lg
            border border-accent-red bg-accent-red/10"
        >
          {importError}
        </p>
      )}

      {/* The visual: waveform lanes across the cycle with a shared playhead */}
      <LooperTimeline looper={looper} />

      {/* Track rows: the control surface for what the timeline shows */}
      <LooperTrackList looper={looper} />

      {/* Footswitch assignments (compact grid) + what the EXP pedal drives. */}
      <div className="pt-2 border-t border-border-active flex flex-col gap-3">
        <LooperStomps
          triggers={triggers}
          armedAction={armedAction}
          onArmLearn={onArmLearn}
          onClearTrigger={onClearTrigger}
          onClearAll={onClearAll}
          learnNotice={learnNotice}
          learnEnabled={learnEnabled}
          verbose
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono-display text-label text-text-secondary w-16">EXP →</span>
          <select
            value={expValue(bindings.expTarget)}
            onChange={(event) => {
              const picked = event.target.value;
              if (picked === 'none') updateExpTarget(null);
              else if (picked === 'master') updateExpTarget({ kind: 'masterGain' });
              else updateExpTarget({ kind: 'selectedTrackGain' });
            }}
            className={`flex-1 sm:flex-none min-w-0 ${SELECT_CLASS}`}
          >
            <option value="none">-</option>
            <option value="master">Master level</option>
            <option value="selected">Selected track level</option>
          </select>
          <span
            className="font-mono-display text-caption text-text-muted basis-full
              sm:basis-auto"
          >
            (EXP wire format pending capture)
          </span>
        </div>
      </div>
    </div>
  );
}
