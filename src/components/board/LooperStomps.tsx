import { Button } from '@/components/ui/Button';
import { LOOPER_ACTION_KINDS, type LooperActionKind } from '@/core/looperBindings';
import type { LooperTriggerMap } from '@/core/looperTriggers';
import type { LearnNotice } from '@/hooks/useLooperTriggers';

// Footswitch assignments as a row of buttons rather than a row per action.
//
// The user never picks a switch NUMBER: they arm an ACTION and stomp whatever
// switch they like, and the frame's fingerprint is cached against that action.
// So each action only ever has three states , unassigned, waiting, assigned ,
// and a button carries all three in its own label and colour. Five stacked
// rows spent a third of the drawer restating that, which is why the loop
// station's simple face could not afford to show them at all; compacted like
// this, both faces can.

/** Short button faces. The full action name goes in the tooltip / aria-label. */
const SHORT_LABELS: Record<LooperActionKind, string> = {
  recordToggle: 'REC / STOP',
  playToggle: 'PLAY',
  muteToggle: 'MUTE',
  trackNext: 'TRACK +',
  trackPrev: 'TRACK −',
};

const FULL_LABELS: Record<LooperActionKind, string> = {
  recordToggle: 'Record / Stop',
  playToggle: 'Play / Stop selected track',
  muteToggle: 'Mute / Unmute selected track',
  trackNext: 'Track +',
  trackPrev: 'Track -',
};

function stompVariant(armed: boolean, learned: boolean): 'danger' | 'primary' | 'secondary' {
  if (armed) return 'danger';
  if (learned) return 'primary';
  return 'secondary';
}

function stompLabel(action: LooperActionKind, armed: boolean, learned: boolean): string {
  if (armed) return '● STOMP NOW';
  if (learned) return `✓ ${SHORT_LABELS[action]}`;
  return SHORT_LABELS[action];
}

function stompTitle(action: LooperActionKind, armed: boolean, learned: boolean): string {
  if (armed) return `${FULL_LABELS[action]} , stomp any footswitch now (click to cancel)`;
  if (learned) return `${FULL_LABELS[action]} , assigned. Click to use a different switch`;
  return `${FULL_LABELS[action]} , click, then stomp any footswitch to assign it`;
}

function stompAriaLabel(action: LooperActionKind, armed: boolean, learned: boolean): string {
  if (armed) return `${FULL_LABELS[action]}: waiting for a stomp`;
  if (learned) return `${FULL_LABELS[action]}: assigned, reassign`;
  return `${FULL_LABELS[action]}: not assigned, assign a stomp`;
}

/**
 * What the collapsed header says, so the drawer only has to be opened to CHANGE
 * something. Assignments are made once at setup and then used with your feet
 * for the rest of the session; what earns the space after that is knowing which
 * actions are covered, not five buttons offering to reassign them.
 */
function stompsSummary(triggers: LooperTriggerMap, learnEnabled: boolean): string {
  const assigned = LOOPER_ACTION_KINDS.filter((action) => triggers[action] !== undefined);
  if (assigned.length > 0) {
    return assigned.map((action) => `✓ ${SHORT_LABELS[action]}`).join(' · ');
  }
  if (!learnEnabled) return 'none assigned — connect the GP-200 to assign';
  return 'none assigned — hands-free transport';
}

/** The two hard constraints, shared by both faces so they cannot drift apart. */
function ConstraintText() {
  return (
    <>
      <p className="font-mono-display text-caption text-text-secondary">
        On the GP-200, the switches you want the looper to own must be set to a{' '}
        <strong>CTRL 1–8</strong> assignment , not PATCH, BANK, TAP or TUNER. Only a
        CTRL stomp sends something this app can recognise; a patch or bank switch
        changes the pedal&apos;s slot instead, and the looper will never hear it.
      </p>
      <p className="font-mono-display text-caption text-text-secondary mt-2">
        Give each of those CTRL switches <strong>one effect block only</strong>. A
        CTRL that toggles several blocks at once cannot be fully undone: the looper
        action will fire, but the extra pedals stay flipped. One switch, one job.
      </p>
    </>
  );
}

interface LooperStompsProps {
  triggers: LooperTriggerMap;
  armedAction: LooperActionKind | null;
  onArmLearn: (action: LooperActionKind) => void;
  onClearTrigger: (action: LooperActionKind) => void;
  /** forget every assigned stomp at once */
  onClearAll: () => void;
  learnNotice: LearnNotice | null;
  /** learning needs a connected GP-200 */
  learnEnabled: boolean;
  /** spell the pedal-side constraints out in full instead of behind a summary */
  verbose?: boolean;
}

export function LooperStomps({
  triggers,
  armedAction,
  onArmLearn,
  onClearTrigger,
  onClearAll,
  learnNotice,
  learnEnabled,
  verbose = false,
}: LooperStompsProps) {
  const anyLearned = LOOPER_ACTION_KINDS.some((action) => triggers[action] !== undefined);

  return (
    <details className="rounded-lg border border-border-active bg-bg-deep/40">
      <summary
        className="px-3 py-2 cursor-pointer select-none list-none flex flex-wrap
          items-baseline gap-x-3 gap-y-1"
      >
        <span
          className="font-mono-display text-label text-text-secondary uppercase
            tracking-widest"
        >
          Footswitches
        </span>
        <span className="font-mono-display text-caption text-text-muted">
          {stompsSummary(triggers, learnEnabled)}
        </span>
      </summary>

      <div className="flex flex-col gap-2 px-3 pb-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {learnEnabled && (
            <span className="font-mono-display text-caption text-text-muted">
              Click one, then step on any switch to assign it
            </span>
          )}
          {!learnEnabled && (
            <span className="font-mono-display text-caption text-text-muted">
              Connect the GP-200 to assign footswitches
            </span>
          )}
          {anyLearned && (
            // Inside the body, not the summary: a button in a <summary> toggles
            // the details as well as firing, so CLEAR ALL would snap it shut.
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={onClearAll}
              title="Forget every assigned stomp"
            >
              CLEAR ALL
            </Button>
          )}
        </div>

        {/* gap-x-3, not 2: the per-button clear badge overhangs the corner by
            6px on each side, and a tighter gap makes two adjacent badges touch. */}
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          {LOOPER_ACTION_KINDS.map((action) => {
            const learned = triggers[action] !== undefined;
            const armed = armedAction === action;
            return (
              <div key={action} className="relative">
                <Button
                  variant={stompVariant(armed, learned)}
                  size="sm"
                  disabled={!learnEnabled}
                  onClick={() => onArmLearn(action)}
                  title={stompTitle(action, armed, learned)}
                  aria-label={stompAriaLabel(action, armed, learned)}
                >
                  {stompLabel(action, armed, learned)}
                </Button>
                {/* A sibling, not a child: a button inside a button is invalid
                    markup and the inner one never receives its own clicks. */}
                {learned && !armed && (
                  <button
                    type="button"
                    onClick={() => onClearTrigger(action)}
                    title={`Forget the switch assigned to ${FULL_LABELS[action]}`}
                    aria-label={`Forget the switch assigned to ${FULL_LABELS[action]}`}
                    className="ui-btn absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full
                      border border-border-active bg-bg-primary text-text-muted
                      hover:text-accent-red hover:border-accent-red font-mono-display
                      text-micro leading-none flex items-center justify-center"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {learnNotice !== null && (
          <p className="font-mono-display text-caption text-accent-red">
            That switch is already assigned to {FULL_LABELS[learnNotice.duplicateOf]} — not saved
          </p>
        )}

        {verbose && (
          <div className="px-3 py-2 rounded-lg border border-accent bg-accent/10">
            <p
              className="font-mono-display text-label text-accent uppercase
                tracking-widest mb-1"
            >
              ⚠ Before you assign a footswitch
            </p>
            <ConstraintText />
          </div>
        )}

        {!verbose && (
          <details className="rounded-lg border border-accent bg-accent/10">
            <summary
              className="px-3 py-2 cursor-pointer select-none list-none font-mono-display
                text-caption text-accent"
            >
              ⚠ Switches must be set to CTRL 1–8, one effect block each — why
            </summary>
            <div className="px-3 pb-2">
              <ConstraintText />
            </div>
          </details>
        )}
      </div>
    </details>
  );
}
