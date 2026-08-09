import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SysExCodec } from '@/core/SysExCodec';
import {
  BANK_COUNT,
  describeScope,
  type BulkApplyProgress,
  type BulkScope,
} from '@/core/bulkApply';

const BULK_INPUT_CLASS =
  'w-14 bg-bg-primary border border-border-active rounded px-1.5 py-0.5 ' +
  'font-mono-display text-caption text-text-secondary disabled:opacity-40';

interface BulkApplySectionProps {
  connected: boolean;
  canCopyCtrl: boolean;
  progress: BulkApplyProgress | null;
  onApply: (scope: BulkScope, apply: { ctrl: boolean; volume: number | null }) => void;
  onCancel: () => void;
}

/**
 * Write the editor patch's CTRL 1–8 assignments and/or a patch volume into
 * many saved patches at once (all 256 or a bank range). Per slot the device
 * loop replays preset-change → live writes → save-commit, so ~0.8 s per
 * patch; a full 256-slot run takes ~3½ minutes and is cancellable between
 * slots. Destructive: it saves over every targeted patch, hence the inline
 * red confirmation. Hosted in the PATCH SETTINGS drawer (desktop) and the
 * patch-settings sheet (phone), next to the CTRL assignments it copies.
 */
export function BulkApplySection({
  connected,
  canCopyCtrl,
  progress,
  onApply,
  onCancel,
}: BulkApplySectionProps) {
  const [scopeKind, setScopeKind] = useState<'all' | 'banks'>('banks');
  const [fromBank, setFromBank] = useState(1);
  const [toBank, setToBank] = useState(1);
  const [applyCtrl, setApplyCtrl] = useState(true);
  const [applyVolume, setApplyVolume] = useState(false);
  const [volume, setVolume] = useState(100);
  const [confirming, setConfirming] = useState(false);

  const running = progress !== null;
  let scope: BulkScope = { kind: 'all' };
  if (scopeKind === 'banks') scope = { kind: 'banks', fromBank, toBank };
  const ctrlActive = applyCtrl && canCopyCtrl;
  const nothingToApply = !ctrlActive && !applyVolume;

  function startApply() {
    setConfirming(false);
    let volumeValue: number | null = null;
    if (applyVolume) volumeValue = volume;
    onApply(scope, { ctrl: ctrlActive, volume: volumeValue });
  }

  if (!connected) {
    return (
      <p className="font-mono-display text-caption text-text-muted">
        Connect the GP-200 to write assignments or volume across patches.
      </p>
    );
  }

  if (running) {
    return (
      <div
        className="flex items-center gap-2 font-mono-display text-caption"
        role="status"
        aria-live="polite"
      >
        <span style={{ color: 'var(--text-muted)' }}>
          Writing {SysExCodec.slotToLabel(progress.slot)} · {progress.done}/{progress.total}
        </span>
        <div
          className="flex-1 h-1 rounded-full overflow-hidden"
          style={{ background: 'rgba(0,0,0,0.12)' }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${(progress.done / progress.total) * 100}%`,
              background: 'var(--accent-amber)',
            }}
          />
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="underline"
          style={{ color: 'var(--accent-red, #c05050)' }}
        >
          cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 font-mono-display text-caption">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="bulk-scope"
            checked={scopeKind === 'all'}
            onChange={() => setScopeKind('all')}
          />
          <span>All patches</span>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="bulk-scope"
            checked={scopeKind === 'banks'}
            onChange={() => setScopeKind('banks')}
          />
          <span>Banks</span>
        </label>
        <input
          type="number"
          min={1}
          max={BANK_COUNT}
          value={fromBank}
          disabled={scopeKind !== 'banks'}
          onChange={(event) => setFromBank(Number(event.target.value))}
          className={BULK_INPUT_CLASS}
          aria-label="From bank"
        />
        <span style={{ color: 'var(--text-muted)' }}>to</span>
        <input
          type="number"
          min={1}
          max={BANK_COUNT}
          value={toBank}
          disabled={scopeKind !== 'banks'}
          onChange={(event) => setToBank(Number(event.target.value))}
          className={BULK_INPUT_CLASS}
          aria-label="To bank"
        />
      </div>

      <label className="flex items-center gap-2 font-mono-display text-caption">
        <input
          type="checkbox"
          checked={ctrlActive}
          disabled={!canCopyCtrl}
          onChange={(event) => setApplyCtrl(event.target.checked)}
        />
        <span>CTRL footswitches — copy the current patch’s assignments</span>
      </label>
      {!canCopyCtrl && (
        <p
          className="font-mono-display text-caption"
          style={{ color: 'var(--text-muted)' }}
        >
          The current patch has no CTRL assignments to copy — set them up in
          the CTRL section above first.
        </p>
      )}

      <div className="flex items-center gap-2 font-mono-display text-caption">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={applyVolume}
            onChange={(event) => setApplyVolume(event.target.checked)}
          />
          <span>Patch volume</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          disabled={!applyVolume}
          onChange={(event) => setVolume(Number(event.target.value))}
          className="flex-1 min-w-16 accent-accent-amber disabled:opacity-40"
          aria-label="Patch volume to apply"
        />
        <b className="w-8 text-right tabular-nums text-text-secondary">{volume}</b>
      </div>

      {!confirming && (
        <div>
          <Button
            size="sm"
            variant="secondary"
            disabled={nothingToApply}
            onClick={() => setConfirming(true)}
          >
            APPLY…
          </Button>
        </div>
      )}
      {confirming && (
        <div
          role="alertdialog"
          aria-label="Confirm bulk apply"
          className="px-3 py-2 rounded"
          style={{
            border: '1px solid var(--accent-red, #c05050)',
            background: 'rgba(192,80,80,0.06)',
          }}
        >
          <p className="font-mono-display text-caption mb-2 text-text-primary">
            Save over {describeScope(scope)} on the device? Each patch is
            rewritten and saved; this cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" onClick={startApply}>
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
