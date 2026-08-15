import { useState } from 'react';
import type { LooperApi } from '@/hooks/useLooper';
import type { LooperBindings, LooperActionKind } from '@/core/looperBindings';
import { Button } from '@/components/ui/Button';
import { LooperSimple } from '@/components/board/LooperSimple';
import { LooperAdvanced } from '@/components/board/LooperAdvanced';
import type { LooperTempo } from '@/components/board/LooperSetup';
import { loadLooperMode, saveLooperMode, type LooperMode } from '@/core/looperMode';
import type { LooperTriggerMap } from '@/core/looperTriggers';
import type { LearnNotice } from '@/hooks/useLooperTriggers';

// The loop station, in two faces.
//
// SIMPLE is one big context-labelled record button plus play / undo / import /
// clear, a volume knob and the timeline , enough to record and stack loops
// with nothing configured. ADVANCED adds the capture-edge settings, footswitch
// learning and EXP routing on top of the same transport.
//
// The split is presentation only: both faces drive the same LooperApi, and any
// shared control lives in LooperControls.tsx so the two cannot drift. The mode
// is remembered per machine (core/looperMode.ts).

interface LooperPanelProps {
  looper: LooperApi;
  /** the practice drum machine's bar, offered as a grid to lock the loop to */
  tempo: LooperTempo;
  bindings: LooperBindings;
  onBindingsChange: (next: LooperBindings) => void;
  /** enable the AUDIO IN capture: the looper needs the shared context running */
  onEnableAudio: () => void;
  audioStarting: boolean;
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

function modeVariant(active: boolean): 'primary' | 'ghost' {
  if (active) return 'primary';
  return 'ghost';
}

interface ModeSwitchProps {
  mode: LooperMode;
  onChange: (next: LooperMode) => void;
}

function ModeSwitch({ mode, onChange }: ModeSwitchProps) {
  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant={modeVariant(mode === 'simple')}
        aria-pressed={mode === 'simple'}
        onClick={() => onChange('simple')}
        title="Just the controls you need to record and stack loops"
      >
        Simple
      </Button>
      <Button
        size="sm"
        variant={modeVariant(mode === 'advanced')}
        aria-pressed={mode === 'advanced'}
        onClick={() => onChange('advanced')}
        title="Adds capture timing, take lengths, footswitch learning and EXP routing"
      >
        Advanced
      </Button>
    </div>
  );
}

export function LooperPanel({
  looper,
  tempo,
  bindings,
  onBindingsChange,
  onEnableAudio,
  audioStarting,
  triggers,
  armedAction,
  onArmLearn,
  onClearTrigger,
  onClearAll,
  learnNotice,
  learnEnabled,
}: LooperPanelProps) {
  const [mode, setMode] = useState<LooperMode>(loadLooperMode);

  const changeMode = (next: LooperMode) => {
    setMode(next);
    saveLooperMode(next);
  };

  if (!looper.ready) {
    let enableLabel = 'ENABLE AUDIO IN';
    if (audioStarting) enableLabel = 'ENABLING…';
    return (
      <div className="text-center py-6">
        <p className="font-mono-display text-caption text-text-muted mb-3">
          The loop station records the GP-200&apos;s USB audio here in the browser
          (separate from the pedal&apos;s built-in looper): import a backing track,
          then record guitar takes over it. Every take becomes its own track,
          and the loop grows to fit the longest one. Enable audio capture to
          start.
        </p>
        <Button onClick={onEnableAudio} disabled={audioStarting}>
          {enableLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <ModeSwitch mode={mode} onChange={changeMode} />
      </div>

      {mode === 'simple' && (
        <LooperSimple
          looper={looper}
          tempo={tempo}
          triggers={triggers}
          armedAction={armedAction}
          onArmLearn={onArmLearn}
          onClearTrigger={onClearTrigger}
          onClearAll={onClearAll}
          learnNotice={learnNotice}
          learnEnabled={learnEnabled}
        />
      )}

      {mode === 'advanced' && (
        <LooperAdvanced
          looper={looper}
          tempo={tempo}
          bindings={bindings}
          onBindingsChange={onBindingsChange}
          triggers={triggers}
          armedAction={armedAction}
          onArmLearn={onArmLearn}
          onClearTrigger={onClearTrigger}
          onClearAll={onClearAll}
          learnNotice={learnNotice}
          learnEnabled={learnEnabled}
        />
      )}
    </div>
  );
}
