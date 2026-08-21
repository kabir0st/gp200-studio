import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LandingStickyCta } from '@/components/landing/LandingStickyCta';
import type { UseMidiDeviceReturn } from '@/hooks/useMidiDevice';

/**
 * The bar's whole job is picking the right action for the device's state, and
 * the one that used to be wrong: while disconnected it opened a blank preset —
 * the hero's ghost escape hatch — instead of running the handshake the primary
 * button beside it runs.
 */

type DeviceState = Pick<UseMidiDeviceReturn, 'status' | 'handshakeStep'>;

/** Only the read surface the bar touches, cast like src/prerender/stubMidiDevice.ts. */
function device(state: Partial<DeviceState>, connect = vi.fn()) {
  return {
    status: 'disconnected',
    handshakeStep: null,
    ...state,
    connect,
  } as unknown as UseMidiDeviceReturn;
}

function renderBar(state: Partial<DeviceState> = {}) {
  const connect = vi.fn();
  const onOpenBlank = vi.fn();
  const onOpenCurrent = vi.fn();
  render(
    <LandingStickyCta
      midiDevice={device(state, connect)}
      onOpenBlank={onOpenBlank}
      onOpenCurrent={onOpenCurrent}
    />,
  );
  // The `Guide` anchor is the only other control in the pill.
  const button = screen.getByRole('button');
  return { button, connect, onOpenBlank, onOpenCurrent };
}

const hadWebMidi = 'requestMIDIAccess' in navigator;

function setWebMidi(supported: boolean) {
  if (supported) {
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      value: () => Promise.resolve({}),
      configurable: true,
    });
  } else if ('requestMIDIAccess' in navigator) {
    Reflect.deleteProperty(navigator, 'requestMIDIAccess');
  }
}

describe('LandingStickyCta', () => {
  beforeEach(() => setWebMidi(true));
  afterEach(() => setWebMidi(hadWebMidi));

  it('runs the handshake while disconnected instead of opening a blank preset', () => {
    const { button, connect, onOpenBlank } = renderBar();
    expect(button).toHaveTextContent('CONNECT YOUR GP-200');
    fireEvent.click(button);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(onOpenBlank).not.toHaveBeenCalled();
  });

  it('falls back to a blank preset where Web MIDI is missing', () => {
    setWebMidi(false);
    const { button, connect, onOpenBlank } = renderBar();
    expect(button).toHaveTextContent('OPEN THE EDITOR');
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onOpenBlank).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
  });

  it('shows the live handshake step and locks the button while busy', () => {
    const { button, connect } = renderBar({
      status: 'handshaking',
      handshakeStep: 'Slot A1 · Pink Run',
    });
    expect(button).toHaveTextContent('Slot A1 · Pink Run');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(connect).not.toHaveBeenCalled();
  });

  it('offers a retry in place after a failed handshake', () => {
    const { button, connect } = renderBar({ status: 'error' });
    expect(button).toHaveTextContent('RETRY CONNECT');
    fireEvent.click(button);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('opens the device preset once connected', () => {
    const { button, connect, onOpenCurrent } = renderBar({ status: 'connected' });
    expect(button).toHaveTextContent('OPEN CURRENT PRESET');
    fireEvent.click(button);
    expect(onOpenCurrent).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
  });
});
