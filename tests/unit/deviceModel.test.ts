import { describe, expect, it, beforeEach } from 'vitest';
import {
  CTRL_RECORDS_IN_FILE,
  DEFAULT_DEVICE_MODEL,
  ctrlCountFor,
  isDeviceModelId,
  loadDeviceModel,
  saveDeviceModel,
} from '@/core/deviceModel';

describe('deviceModel', () => {
  beforeEach(() => localStorage.clear());

  it('draws 8 footswitches for the GP-200 and 4 for the LT', () => {
    expect(ctrlCountFor('gp200')).toBe(8);
    expect(ctrlCountFor('gp200lt')).toBe(4);
  });

  it('keeps all 8 CTRL records in the file regardless of the model', () => {
    // The LT showing fewer switches must never shrink what the .prst carries,
    // or a patch edited on an LT would lose its CTRL 5-8 assignments.
    expect(CTRL_RECORDS_IN_FILE).toBe(8);
  });

  it('defaults to the 8-switch model', () => {
    expect(loadDeviceModel()).toBe(DEFAULT_DEVICE_MODEL);
    expect(ctrlCountFor(DEFAULT_DEVICE_MODEL)).toBe(8);
  });

  it('remembers the choice', () => {
    saveDeviceModel('gp200lt');
    expect(loadDeviceModel()).toBe('gp200lt');
  });

  it('ignores a stored value it does not recognise', () => {
    localStorage.setItem('gp200-studio:device-model', 'gp500');
    expect(loadDeviceModel()).toBe(DEFAULT_DEVICE_MODEL);
  });

  it('validates model ids', () => {
    expect(isDeviceModelId('gp200lt')).toBe(true);
    expect(isDeviceModelId('nope')).toBe(false);
    expect(isDeviceModelId(undefined)).toBe(false);
  });
});
