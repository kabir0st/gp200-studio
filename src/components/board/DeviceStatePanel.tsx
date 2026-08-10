import type { DeviceStateDump } from '@/core/SysExCodec';
import { SectionHeading } from '@/components/board/CcControls';

interface DeviceStatePanelProps {
  connected: boolean;
  state: DeviceStateDump | null;
}

/**
 * Read-only view of the 0x4E state dump pulled at connect (global EQ floats,
 * tuner A4 reference, drum style-group names , decoded 2026-08-09, see
 * docs/protocol-capture.md §4). Read-only on purpose: the global-EQ WRITE
 * frame was not found in the editor binary, and the 31 EQ floats are not yet
 * mapped to named bands , both need one hardware session (diff-map the dump
 * while changing one setting at a time). Until then this panel shows
 * device truth without pretending to edit it.
 */
export function DeviceStatePanel({ connected, state }: DeviceStatePanelProps) {
  if (!connected || state === null) {
    return (
      <p className="font-mono-display text-caption text-text-muted">
        Connect the GP-200 to read its global state (tuner, global EQ, drum
        kits). It is read once during the connect handshake.
      </p>
    );
  }

  const eqFloats = state.globalEqFloats ?? [];
  const drumNames = state.drumStyleNames ?? [];

  return (
    <div className="flex flex-col gap-4">
      {state.tunerA4Hz !== undefined && (
        <div className="flex items-center gap-2">
          <SectionHeading>Tuner reference</SectionHeading>
          <b className="font-mono-display text-caption text-text-secondary tabular-nums">
            A4 = {state.tunerA4Hz} Hz
          </b>
        </div>
      )}

      {eqFloats.length > 0 && (
        <div className="flex flex-col gap-1">
          <SectionHeading>Global EQ · raw values</SectionHeading>
          <div className="flex flex-wrap gap-1">
            {eqFloats.map((eqValue, floatIndex) => (
              // index is the identity: the dump is a fixed-order float block
              <span
                key={floatIndex}
                className="font-mono-display text-caption text-text-secondary px-1.5 py-0.5
                  rounded border border-border-active tabular-nums"
                title={`Float ${floatIndex}`}
              >
                {formatEqValue(eqValue)}
              </span>
            ))}
          </div>
          <p className="font-mono-display text-caption text-text-muted">
            Band labels and editing arrive once the float→band mapping is
            hardware-verified (docs/protocol-capture.md §4).
          </p>
        </div>
      )}

      {drumNames.length > 0 && (
        <div className="flex flex-col gap-1">
          <SectionHeading>Drum kits on device</SectionHeading>
          <p className="font-mono-display text-caption text-text-secondary">
            {drumNames.map((drumKit) => drumKit.name).join(' · ')}
          </p>
        </div>
      )}
    </div>
  );
}

function formatEqValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}
