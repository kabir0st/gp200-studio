import { describe, it, expect, beforeEach } from 'vitest';
import {
  CC,
  DEFAULT_CC_CHANNEL,
  buildCC,
  drumsPlay,
  drumsRhythm,
  drumsShow,
  drumsVolume,
  loadCcChannel,
  looperAutoRecord,
  looperDelete,
  looperHalfSpeed,
  looperPlacement,
  looperPlay,
  looperPlaybackVolume,
  looperRecVolume,
  looperRecord,
  looperReverse,
  looperShow,
  saveCcChannel,
  tapTempo,
  tunerShow,
} from '../../src/core/ccControl';

describe('buildCC', () => {
  it('ORs the channel into the status byte', () => {
    expect(buildCC(0, 93, 127)).toEqual([0xb0, 93, 127]);
    expect(buildCC(2, 93, 127)).toEqual([0xb2, 93, 127]);
    expect(buildCC(15, 58, 0)).toEqual([0xbf, 58, 0]);
  });

  it('clamps channel, cc, and value into MIDI range', () => {
    expect(buildCC(99, 93, 127)).toEqual([0xbf, 93, 127]);
    expect(buildCC(-3, 93, 127)).toEqual([0xb0, 93, 127]);
    expect(buildCC(0, 300, 200)).toEqual([0xb0, 127, 127]);
    expect(buildCC(0, -1, -1)).toEqual([0xb0, 0, 0]);
  });
});

describe('looper commands', () => {
  it('matches the gp2-controller CC map', () => {
    expect(looperShow(true)).toEqual({ cc: 59, value: 127 });
    expect(looperShow(false)).toEqual({ cc: 59, value: 0 });
    expect(looperRecord()).toEqual({ cc: 60, value: 0 });
    expect(looperAutoRecord(true)).toEqual({ cc: 61, value: 127 });
    expect(looperAutoRecord(false)).toEqual({ cc: 61, value: 0 });
    expect(looperPlay(true)).toEqual({ cc: 62, value: 127 });
    expect(looperPlay(false)).toEqual({ cc: 62, value: 0 });
    expect(looperDelete()).toEqual({ cc: 65, value: 127 });
  });

  it('sends half-speed as 0 and full-speed as 127', () => {
    expect(looperHalfSpeed(true)).toEqual({ cc: 63, value: 0 });
    expect(looperHalfSpeed(false)).toEqual({ cc: 63, value: 127 });
  });

  it('sends reverse as 0 and normal as 127', () => {
    expect(looperReverse(true)).toEqual({ cc: 64, value: 0 });
    expect(looperReverse(false)).toEqual({ cc: 64, value: 127 });
  });

  it('sends placement front as 127 and rear as 0', () => {
    expect(looperPlacement('front')).toEqual({ cc: 68, value: 127 });
    expect(looperPlacement('rear')).toEqual({ cc: 68, value: 0 });
  });

  it('clamps volumes to the device 0-100 range', () => {
    expect(looperRecVolume(50)).toEqual({ cc: 66, value: 50 });
    expect(looperRecVolume(127)).toEqual({ cc: 66, value: 100 });
    expect(looperPlaybackVolume(-5)).toEqual({ cc: 67, value: 0 });
    expect(looperPlaybackVolume(100)).toEqual({ cc: 67, value: 100 });
  });
});

describe('drum machine commands', () => {
  it('matches the gp2-controller CC map', () => {
    expect(drumsShow(true)).toEqual({ cc: 92, value: 127 });
    expect(drumsShow(false)).toEqual({ cc: 92, value: 0 });
    expect(drumsPlay(true)).toEqual({ cc: 93, value: 127 });
    expect(drumsPlay(false)).toEqual({ cc: 93, value: 0 });
  });

  it('clamps rhythm index to 0-99 and volume to 0-100', () => {
    expect(drumsRhythm(42)).toEqual({ cc: 94, value: 42 });
    expect(drumsRhythm(150)).toEqual({ cc: 94, value: 99 });
    expect(drumsRhythm(-1)).toEqual({ cc: 94, value: 0 });
    expect(drumsVolume(100)).toEqual({ cc: 95, value: 100 });
    expect(drumsVolume(127)).toEqual({ cc: 95, value: 100 });
  });
});

describe('tuner and tempo commands', () => {
  it('toggles the tuner via CC 58 and taps tempo via CC 75', () => {
    expect(tunerShow(true)).toEqual({ cc: CC.TUNER, value: 127 });
    expect(tunerShow(false)).toEqual({ cc: CC.TUNER, value: 0 });
    expect(tapTempo()).toEqual({ cc: 75, value: 0 });
  });
});

describe('channel persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a stored channel', () => {
    saveCcChannel(5);
    expect(loadCcChannel()).toBe(5);
  });

  it('defaults on missing or damaged values', () => {
    expect(loadCcChannel()).toBe(DEFAULT_CC_CHANNEL);
    localStorage.setItem('gp200:ccChannel', 'garbage');
    expect(loadCcChannel()).toBe(DEFAULT_CC_CHANNEL);
    localStorage.setItem('gp200:ccChannel', '3.5');
    expect(loadCcChannel()).toBe(DEFAULT_CC_CHANNEL);
    localStorage.setItem('gp200:ccChannel', '16');
    expect(loadCcChannel()).toBe(DEFAULT_CC_CHANNEL);
    localStorage.setItem('gp200:ccChannel', '-1');
    expect(loadCcChannel()).toBe(DEFAULT_CC_CHANNEL);
  });

  it('refuses to persist out-of-range channels', () => {
    saveCcChannel(7);
    saveCcChannel(16);
    saveCcChannel(-1);
    saveCcChannel(2.5);
    expect(loadCcChannel()).toBe(7);
  });
});
