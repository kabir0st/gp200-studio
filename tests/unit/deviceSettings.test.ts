import { describe, it, expect, beforeEach } from 'vitest';
import {
  FS_ACTION,
  TAP_MENU,
  HOLD_MENU,
  FS_MODES,
  fsActionLabel,
  ctrlActionForFs,
  defaultDeviceSettings,
  loadDeviceSettings,
  saveDeviceSettings,
  type DeviceSettings,
} from '@/core/deviceSettings';

describe('FS action tables', () => {
  it('TAP menu has 26 unique entries ending in Tap and None', () => {
    expect(TAP_MENU).toHaveLength(26);
    expect(new Set(TAP_MENU).size).toBe(26);
    expect(TAP_MENU[TAP_MENU.length - 2]).toBe(FS_ACTION.TAP_TEMPO);
    expect(TAP_MENU[TAP_MENU.length - 1]).toBe(FS_ACTION.NONE);
  });

  it('HOLD menu is the TAP menu minus CTRL 1-8 and Tap (17 entries)', () => {
    expect(HOLD_MENU).toHaveLength(17);
    expect(HOLD_MENU).not.toContain(FS_ACTION.TAP_TEMPO);
    expect(HOLD_MENU).not.toContain(FS_ACTION.CTRL1);
    expect(HOLD_MENU).not.toContain(FS_ACTION.CTRL8);
    expect(HOLD_MENU).toContain(FS_ACTION.NONE);
    expect(HOLD_MENU).toContain(FS_ACTION.TUNER);
  });

  it('every menu entry has a human label', () => {
    for (const actionId of TAP_MENU) {
      expect(fsActionLabel(actionId)).not.toMatch(/^0x/);
    }
  });

  it('maps footswitches to their same-numbered CTRL action', () => {
    expect(ctrlActionForFs(1)).toBe(FS_ACTION.CTRL1);
    expect(ctrlActionForFs(4)).toBe(FS_ACTION.CTRL4);
    expect(ctrlActionForFs(5)).toBe(FS_ACTION.CTRL5);
    expect(ctrlActionForFs(8)).toBe(FS_ACTION.CTRL8);
  });

  it('has three FS modes matching the capture value order', () => {
    expect([...FS_MODES]).toEqual(['Patch', 'Stomp', 'User']);
  });
});

describe('device settings persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const sample: DeviceSettings = {
    fsMode: 2,
    taps: [FS_ACTION.CTRL1, 0, 0, 0, 0, 0, 0, FS_ACTION.TAP_TEMPO],
    holds: Array.from({ length: 8 }, () => FS_ACTION.NONE),
    combos: [FS_ACTION.TUNER, 0, 0, 0],
    autoCabMatch: false,
  };

  it('round-trips a settings model', () => {
    saveDeviceSettings(sample);
    expect(loadDeviceSettings()).toEqual(sample);
  });

  it('returns null on missing, malformed, or out-of-range data', () => {
    expect(loadDeviceSettings()).toBeNull();
    localStorage.setItem('gp200:deviceSettings', 'not json');
    expect(loadDeviceSettings()).toBeNull();

    saveDeviceSettings(sample);
    const raw = JSON.parse(localStorage.getItem('gp200:deviceSettings')!);
    raw.settings.taps[0] = 999;
    localStorage.setItem('gp200:deviceSettings', JSON.stringify(raw));
    expect(loadDeviceSettings()).toBeNull();
  });

  it('has sane defaults (Patch mode, everything None, auto cab on)', () => {
    expect(defaultDeviceSettings.fsMode).toBe(0);
    expect(defaultDeviceSettings.taps.every((actionId) => actionId === FS_ACTION.NONE))
      .toBe(true);
    expect(defaultDeviceSettings.autoCabMatch).toBe(true);
  });
});
