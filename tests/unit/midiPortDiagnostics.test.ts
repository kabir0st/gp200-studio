import { describe, it, expect } from 'vitest';
import {
  describeMissingDevice,
  needsAlsaSequencerHint,
  summarisePortNames,
} from '@/core/midiPortDiagnostics';
import { errorCode } from '@/core/analyticsEvents';

/**
 * The connect-failure message is the only diagnostic a user gets when the
 * pedal is plugged in and the browser still cannot see it, so its two jobs are
 * asserted here: name the ports that WERE found, and offer the Linux fix on
 * exactly the platforms where it applies.
 *
 * The last block guards the coupling to analyticsEvents.errorCode — this
 * string is fed to it verbatim, and a rewording that trips an earlier branch
 * of that matcher would silently retitle the connect_error funnel.
 */

const LINUX_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';
const CROS_UA =
  'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

describe('needsAlsaSequencerHint', () => {
  it('fires on desktop Linux, where the modprobe is the actual fix', () => {
    expect(needsAlsaSequencerHint(LINUX_UA)).toBe(true);
  });

  it('stays quiet on platforms with no ALSA sequencer to load', () => {
    expect(needsAlsaSequencerHint(MAC_UA)).toBe(false);
    expect(needsAlsaSequencerHint(WINDOWS_UA)).toBe(false);
    expect(needsAlsaSequencerHint('')).toBe(false);
  });

  // Both report "Linux" in the UA but reach USB-MIDI through their own stack,
  // and neither gives the user a root shell to run the advice in.
  it('stays quiet on Android and ChromeOS despite the Linux token', () => {
    expect(needsAlsaSequencerHint(ANDROID_UA)).toBe(false);
    expect(needsAlsaSequencerHint(CROS_UA)).toBe(false);
  });
});

describe('summarisePortNames', () => {
  it('drops nulls, blanks and duplicates, keeping first-seen order', () => {
    expect(
      summarisePortNames(['GP-200', null, '  ', 'Midi Through Port-0', 'GP-200', '  GP-200  ']),
    ).toEqual(['GP-200', 'Midi Through Port-0']);
  });

  it('truncates a verbose vendor name rather than flooding the message', () => {
    const long = 'A'.repeat(80);
    const [only] = summarisePortNames([long]);
    expect(only).toHaveLength(40);
    expect(only.endsWith('…')).toBe(true);
  });

  it('returns nothing for a machine with no MIDI at all', () => {
    expect(summarisePortNames([])).toEqual([]);
    expect(summarisePortNames([null, null])).toEqual([]);
  });
});

describe('describeMissingDevice', () => {
  it('names the ports the browser did see', () => {
    const message = describeMissingDevice({
      portNames: ['Midi Through Port-0', 'Midi Through Port-0'],
      userAgent: MAC_UA,
    });
    expect(message).toContain('Midi Through Port-0');
    // De-duplicated: inputs and outputs share names, and listing each twice
    // reads as two devices.
    expect(message.match(/Midi Through Port-0/g)).toHaveLength(1);
  });

  it('says so plainly when there are no ports rather than listing nothing', () => {
    const message = describeMissingDevice({ portNames: [], userAgent: MAC_UA });
    expect(message).toContain('no MIDI ports at all');
    expect(message).not.toContain('can see:');
  });

  it('collapses a long port list into a count', () => {
    const message = describeMissingDevice({
      portNames: ['one', 'two', 'three', 'four', 'five', 'six'],
      userAgent: WINDOWS_UA,
    });
    expect(message).toContain('and 2 more');
    expect(message).not.toContain('five');
  });

  it('appends the modprobe fix on Linux and nowhere else', () => {
    const linux = describeMissingDevice({ portNames: ['Midi Through Port-0'], userAgent: LINUX_UA });
    expect(linux).toContain('sudo modprobe snd-seq-midi');

    for (const ua of [MAC_UA, WINDOWS_UA, ANDROID_UA, CROS_UA]) {
      expect(describeMissingDevice({ portNames: ['Midi Through Port-0'], userAgent: ua }))
        .not.toContain('modprobe');
    }
  });

  it('still buckets as device_not_found for analytics, on every platform', () => {
    for (const ua of [LINUX_UA, MAC_UA, WINDOWS_UA, ANDROID_UA, CROS_UA, '']) {
      for (const portNames of [[], ['Midi Through Port-0', 'GP-200 Audio']]) {
        expect(errorCode(describeMissingDevice({ portNames, userAgent: ua })))
          .toBe('device_not_found');
      }
    }
  });
});
