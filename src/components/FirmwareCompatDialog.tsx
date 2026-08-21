import { useState } from 'react';
import { TESTED_FIRMWARE_VERSIONS } from '@/core/firmware';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';

interface FirmwareCompatDialogProps {
  detectedVersion: string;
  onContinue: () => void;
  onDisconnect: () => void;
}

export function FirmwareCompatDialog({ detectedVersion, onContinue, onDisconnect }: FirmwareCompatDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <Dialog
      open
      onClose={onDisconnect}
      title="Firmware Compatibility Warning"
      role="alertdialog"
      closeOnOverlayClick={false}
      className="max-w-md"
    >
      <h2 className="mb-4 font-mono-display text-lg font-bold text-accent-red">
        ⚠ Firmware Compatibility Warning
      </h2>

      <p className="mb-3 font-mono-display text-sm text-text-primary">
        {`This app was only tested with firmware ${TESTED_FIRMWARE_VERSIONS.join(', ')}. Your device has firmware ${detectedVersion}.`}
      </p>

      <p className="mb-6 font-mono-display text-sm text-accent-red">
        With untested firmware, presets may get corrupted or the device may behave unexpectedly.
      </p>

      <label className="mb-6 flex cursor-pointer items-center gap-2 font-mono-display text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="accent-accent"
        />
        I understand the risk
      </label>

      <div className="flex justify-end gap-3">
        <Button variant="danger" onClick={onDisconnect}>
          Disconnect
        </Button>
        <Button variant="primary" disabled={!acknowledged} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </Dialog>
  );
}
