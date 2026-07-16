import type { UseMidiDeviceReturn } from '@/hooks/useMidiDevice';
import type { PushProgress } from '@/core/devicePush';
import { SysExCodec } from '@/core/SysExCodec';
// Firmware compat uses versionAccepted from handshake, not string matching
import { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/Dialog';

interface DeviceStatusBarProps {
  midiDevice: UseMidiDeviceReturn;
  currentPresetName: string | null;
  hasPreset: boolean;
  onPullRequest: () => void;
  onPushRequest: () => void;
  onSaveToActiveSlot?: () => Promise<void>;
  onPresetNameChange?: (name: string) => void;
  /** Live-push progress while a freshly loaded preset is sent to the device. */
  pushProgress?: PushProgress | null;
}

export function DeviceStatusBar({
  midiDevice,
  currentPresetName,
  hasPreset,
  onPullRequest,
  onPushRequest,
  onSaveToActiveSlot,
  onPresetNameChange,
  pushProgress,
}: DeviceStatusBarProps) {
  const { status, errorMessage, currentSlot, connect, disconnect } = midiDevice;
  const [webMidiSupported, setWebMidiSupported] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [saveConfirm, setSaveConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setWebMidiSupported('requestMIDIAccess' in navigator);
  }, []);

  const ledColor =
    status === 'connected'    ? 'var(--accent-green)' :
    status === 'connecting'   ? 'var(--accent-amber)' :
    status === 'handshaking'  ? 'var(--accent-amber)' :
    status === 'error'        ? 'var(--accent-red)'   :
    '#555';

  const slotLabel = currentSlot !== null ? SysExCodec.slotToLabel(currentSlot) : '—';
  // currentPresetName (from editor) takes priority over cached presetNames (from loadPresetNames)
  const displayName = currentPresetName || (currentSlot !== null ? midiDevice.presetNames[currentSlot] : null);
  const slotName = displayName ? ` »${displayName}«` : '';

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm"
      style={{
        border: `1px solid ${status === 'connected' ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.08)'}`,
        background: status === 'connected' ? 'rgba(74,222,128,0.04)' : 'rgba(255,255,255,0.02)',
      }}
      data-testid="device-status-bar"
    >
      {/* LED */}
      <span
        style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: ledColor,
          boxShadow: (status === 'connected') ? `0 0 6px ${ledColor}` :
                     (status === 'connecting' || status === 'handshaking') ? `0 0 6px ${ledColor}` : 'none',
          // References our own `led-pulse` keyframe (src/index.css) — Tailwind's built-in
          // `pulse` keyframe is JIT-purged unless an `animate-pulse` class is scanned
          // somewhere in the app, which nothing in this smaller repo does.
          animation: (status === 'connecting' || status === 'handshaking') ? 'led-pulse 1s ease-in-out infinite' : 'none',
        }}
      />

      {/* Status text */}
      {status === 'disconnected' && (
        <span className="font-mono-display" style={{ color: 'var(--text-muted)' }}>
          No device
        </span>
      )}
      {status === 'connecting' && (
        <span className="font-mono-display" style={{ color: 'var(--accent-amber)' }}>
          Connecting…
        </span>
      )}
      {status === 'handshaking' && (
        <span className="font-mono-display" style={{ color: 'var(--accent-amber)' }}>
          Initializing…
          {midiDevice.handshakeStep && (
            <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: '0.85em' }}>
              {midiDevice.handshakeStep}
            </span>
          )}
        </span>
      )}
      {status === 'connected' && (
        <span className="font-mono-display" style={{ color: 'var(--accent-green)', fontSize: '0.8em' }}>
          GP-200
          {midiDevice.deviceInfo && (
            <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontSize: '0.9em' }}>
              {`FW ${midiDevice.deviceInfo.firmwareValues.join('.')}`}
            </span>
          )}
          {midiDevice.deviceInfo && !midiDevice.deviceInfo.versionAccepted && (
            <span style={{ color: 'var(--accent-red)', marginLeft: 8, fontSize: '0.85em' }} title="Only tested with FW 1.2 — other versions at your own risk">
              ⚠
            </span>
          )}
          <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
            · Slot <strong style={{ color: 'var(--accent-amber)' }}>{slotLabel}</strong>
            {editingName ? (
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value.slice(0, 16))}
                onBlur={() => { if (onPresetNameChange && nameInput) onPresetNameChange(nameInput); setEditingName(false); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { if (onPresetNameChange && nameInput) onPresetNameChange(nameInput); setEditingName(false); }
                  if (e.key === 'Escape') setEditingName(false);
                }}
                maxLength={16}
                className="font-mono-display text-sm bg-transparent border-b outline-none ml-2"
                style={{ color: 'var(--accent-amber)', borderColor: 'var(--accent-amber)', width: `${Math.max(nameInput.length, 4)}ch` }}
              />
            ) : (
              <span
                onDoubleClick={() => {
                  if (!onPresetNameChange) return;
                  const name = currentPresetName || midiDevice.presetNames[currentSlot!] || '';
                  setNameInput(name);
                  setEditingName(true);
                }}
                style={{ cursor: onPresetNameChange ? 'text' : 'default' }}
                title={onPresetNameChange ? 'Slot' : undefined}
              >
                {slotName}
              </span>
            )}
          </span>
        </span>
      )}
      {status === 'error' && (
        <span className="font-mono-display" style={{ color: 'var(--accent-red)', fontSize: '0.8em' }}>
          {errorMessage ?? 'Connection error'}
        </span>
      )}

      {/* Live-push progress (non-blocking — user can keep editing) */}
      {pushProgress && (
        <div
          className="flex items-center gap-2 font-mono-display"
          style={{ fontSize: '0.75em', color: pushProgress.phase === 'done' ? 'var(--accent-green)' : 'var(--accent-amber)' }}
          data-testid="push-progress"
          role="status"
          aria-live="polite"
        >
          {pushProgress.phase === 'done' ? (
            <span>✓ Sent to device</span>
          ) : (
            <>
              <span>Sending to device…</span>
              <span
                aria-hidden
                style={{ position: 'relative', width: 56, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}
              >
                <span
                  style={{
                    position: 'absolute', insetBlock: 0, left: 0,
                    width: `${pushProgress.total > 0 ? Math.round((pushProgress.completed / pushProgress.total) * 100) : 0}%`,
                    background: 'var(--accent-amber)', transition: 'width 0.2s linear',
                  }}
                />
              </span>
              <span style={{ color: 'var(--text-muted)' }}>{pushProgress.completed}/{pushProgress.total}</span>
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="ml-auto flex gap-2">
        {status === 'disconnected' && !webMidiSupported && (
          <span className="font-mono-display" style={{ color: 'var(--text-muted)', fontSize: '0.75em' }}>
            Chrome/Edge only
          </span>
        )}
        {status === 'disconnected' && webMidiSupported && (
          <button
            onClick={connect}
            className="font-mono-display text-xs font-bold uppercase px-3 py-1 rounded"
            style={{ border: '1px solid rgba(212,162,78,0.4)', color: 'var(--accent-amber)', background: 'transparent' }}
          >
            Connect GP-200
          </button>
        )}
        {status === 'error' && (
          <button
            onClick={connect}
            className="font-mono-display text-xs font-bold uppercase px-3 py-1 rounded"
            style={{ border: '1px solid rgba(255,80,80,0.4)', color: 'var(--accent-red)', background: 'transparent' }}
          >
            Reconnect
          </button>
        )}
        {status === 'connected' && (
          <>
            <button
              onClick={onPullRequest}
              className="font-mono-display text-xs font-bold px-3 py-1 rounded"
              style={{ border: '1px solid rgba(212,162,78,0.4)', color: 'var(--accent-amber)', background: 'rgba(212,162,78,0.06)' }}
            >
              Load
            </button>
            {onSaveToActiveSlot && currentSlot !== null && hasPreset && (
              <button
                onClick={() => setSaveConfirm(true)}
                className="font-mono-display text-xs font-bold px-3 py-1 rounded"
                style={{ border: '1px solid rgba(74,222,128,0.4)', color: 'var(--accent-green)', background: 'rgba(74,222,128,0.06)' }}
              >
                {`Save to ${slotLabel}`}
              </button>
            )}
            <button
              onClick={onPushRequest}
              disabled={!hasPreset}
              className="font-mono-display text-xs font-bold px-3 py-1 rounded disabled:opacity-40"
              style={{ border: '1px solid rgba(212,162,78,0.4)', color: 'var(--accent-amber)', background: 'rgba(212,162,78,0.06)' }}
            >
              Save
            </button>
            <button
              onClick={disconnect}
              className="font-mono-display text-xs px-2 py-1 rounded"
              style={{ color: 'var(--text-muted)', opacity: 0.5 }}
            >
              ×
            </button>
          </>
        )}
      </div>

      {/* Save confirm overlay */}
      <Dialog
        open={saveConfirm}
        onClose={() => { if (!saving) setSaveConfirm(false); }}
        title="Save to slot"
        closeOnOverlayClick={!saving}
        className="max-w-sm"
      >
        {saving ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-8 h-8 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--accent-green)', borderTopColor: 'transparent' }} />
            <p className="text-sm font-mono-display" style={{ color: 'var(--accent-green)' }}>
              {`Saving to ${slotLabel}…`}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm mb-6" style={{ color: 'var(--text-primary)' }}>
              {`Save »${currentPresetName || '?'}« to slot ${slotLabel}?`}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setSaveConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm transition-colors"
                style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onSaveToActiveSlot!();
                  } finally {
                    setSaving(false);
                    setSaveConfirm(false);
                  }
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                style={{ background: 'var(--accent-green)', color: '#000' }}
              >
                Save
              </button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}
