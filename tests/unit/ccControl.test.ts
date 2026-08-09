import { describe, it, expect, beforeEach } from 'vitest';
import {
  CC,
  DEFAULT_CC_CHANNEL,
  TEMPO_MAX_BPM,
  TEMPO_MIN_BPM,
  bankStep,
  buildCC,
  ctrlTap,
  drumsPlay,
  drumsRhythm,
  drumsShow,
  drumsVolume,
  exp1Position,
  exp1Select,
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
  moduleToggle,
  patchStep,
  patchVolume,
  quickAccessParam,
  quickAccessStep,
  saveCcChannel,
  tapTempo,
  tempoBpm,
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

describe('remote commands (manual MIDI Control Information List)', () => {
  it('taps CTRL 1-8 on CC69-72/76-79', () => {
    expect(ctrlTap(1)).toEqual({ cc: 69, value: 127 });
    expect(ctrlTap(4)).toEqual({ cc: 72, value: 127 });
    expect(ctrlTap(5)).toEqual({ cc: 76, value: 127 });
    expect(ctrlTap(8)).toEqual({ cc: 79, value: 127 });
  });

  it('clamps CTRL numbers into 1-8', () => {
    expect(ctrlTap(0)).toEqual({ cc: 69, value: 127 });
    expect(ctrlTap(99)).toEqual({ cc: 79, value: 127 });
  });

  it('maps block indexes to module CCs in SLOT_MODULES order', () => {
    expect(moduleToggle(0, true)).toEqual({ cc: CC.MODULE_PRE, value: 127 });
    expect(moduleToggle(1, true)).toEqual({ cc: CC.MODULE_WAH, value: 127 });
    expect(moduleToggle(2, false)).toEqual({ cc: CC.MODULE_DST, value: 0 });
    expect(moduleToggle(3, true)).toEqual({ cc: CC.MODULE_AMP, value: 127 });
    expect(moduleToggle(9, false)).toEqual({ cc: CC.MODULE_RVB, value: 0 });
  });

  it('returns null for blocks with no module CC (VOL, FX LOOP)', () => {
    expect(moduleToggle(10, true)).toBeNull();
    expect(moduleToggle(11, true)).toBeNull();
    expect(moduleToggle(-1, true)).toBeNull();
  });

  it('steps banks and patches', () => {
    expect(bankStep('down')).toEqual({ cc: 22, value: 127 });
    expect(bankStep('up')).toEqual({ cc: 23, value: 127 });
    expect(patchStep('down')).toEqual({ cc: 24, value: 127 });
    expect(patchStep('up')).toEqual({ cc: 25, value: 127 });
  });

  it('encodes the low tempo range as CC73=0 + CC74=bpm', () => {
    expect(tempoBpm(40)).toEqual([
      { cc: 73, value: 0 },
      { cc: 74, value: 40 },
    ]);
    expect(tempoBpm(127)).toEqual([
      { cc: 73, value: 0 },
      { cc: 74, value: 127 },
    ]);
  });

  it('encodes the high tempo range as CC73=1 + CC74=bpm-128', () => {
    expect(tempoBpm(128)).toEqual([
      { cc: 73, value: 1 },
      { cc: 74, value: 0 },
    ]);
    expect(tempoBpm(250)).toEqual([
      { cc: 73, value: 1 },
      { cc: 74, value: 122 },
    ]);
  });

  it('clamps tempo into the device 40-250 BPM range', () => {
    expect(tempoBpm(10)).toEqual(tempoBpm(TEMPO_MIN_BPM));
    expect(tempoBpm(999)).toEqual(tempoBpm(TEMPO_MAX_BPM));
  });

  it('sends patch volume and EXP1 position on the 0-100 scale', () => {
    expect(patchVolume(80)).toEqual({ cc: 7, value: 80 });
    expect(patchVolume(127)).toEqual({ cc: 7, value: 100 });
    expect(exp1Position(0)).toEqual({ cc: 11, value: 0 });
    expect(exp1Position(120)).toEqual({ cc: 11, value: 100 });
  });

  it('selects EXP1 A as 0 and B as 127', () => {
    expect(exp1Select('A')).toEqual({ cc: 13, value: 0 });
    expect(exp1Select('B')).toEqual({ cc: 13, value: 127 });
  });

  it('drives the quick access knobs absolutely and by step', () => {
    expect(quickAccessParam(1, 50)).toEqual({ cc: 16, value: 50 });
    expect(quickAccessParam(2, 101)).toEqual({ cc: 18, value: 100 });
    expect(quickAccessParam(3, -1)).toEqual({ cc: 20, value: 0 });
    expect(quickAccessStep(1, 'down')).toEqual({ cc: 17, value: 0 });
    expect(quickAccessStep(2, 'up')).toEqual({ cc: 19, value: 127 });
    expect(quickAccessStep(3, 'up')).toEqual({ cc: 21, value: 127 });
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
