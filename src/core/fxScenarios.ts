/**
 * FX-loop scenarios: one-click rig configurations.
 *
 * Getting a GP-200 to play nicely with a real amp means setting the loop's
 * routing mode and then remembering to switch the modelled AMP and CAB blocks
 * out of the way — per patch, every time. A scenario bundles those decisions
 * under the name of the rig you are actually plugging into.
 *
 * Scenarios deliberately leave the SEND/RETURN chain positions alone: where the
 * loop sits in the chain is a per-patch tone decision, while the amp/cab
 * question is a per-venue one, and conflating them would stomp on routing the
 * user set on purpose.
 */

import { SLOT_MODULES } from './effectNames';
import type { GP200Preset } from './types';

export interface FxScenario {
  id: string;
  /** Short label for the picker. */
  name: string;
  /** What rig this is for, in one line. */
  description: string;
  /** FX-loop routing mode: 0 = parallel, 1 = serial. */
  mode: number;
  /** Force the AMP block on (true) or off (false); undefined leaves it alone. */
  amp?: boolean;
  /** Force the CAB block on (true) or off (false); undefined leaves it alone. */
  cab?: boolean;
}

export const FX_SCENARIOS: readonly FxScenario[] = [
  {
    id: 'preamp',
    name: 'Amp preamp (4CM)',
    description: "Your amp's preamp runs inside the loop. Serial, with the modelled amp and cab out of the way.",
    mode: 1,
    amp: false,
    cab: false,
  },
  {
    id: 'power-amp',
    name: 'Into a power amp',
    description: 'Modelled amp, no cab: the real speaker does the cab.',
    mode: 0,
    amp: true,
    cab: false,
  },
  {
    id: 'direct',
    name: 'Direct to FOH',
    description: 'Full modelled rig, amp and cab both on, straight to the desk or your headphones.',
    mode: 0,
    amp: true,
    cab: true,
  },
] as const;

export function findFxScenario(id: string): FxScenario | undefined {
  return FX_SCENARIOS.find((scenario) => scenario.id === id);
}

/** Block index of a module in the fixed chain, e.g. 'AMP' → 3. */
function blockIndexOf(module: string): number {
  return SLOT_MODULES.indexOf(module as (typeof SLOT_MODULES)[number]);
}

/**
 * Returns a copy of `preset` with the scenario applied. Pure: callers own the
 * state update, and nothing here touches the device.
 */
export function applyFxScenario(preset: GP200Preset, scenario: FxScenario): GP200Preset {
  const ampBlock = blockIndexOf('AMP');
  const cabBlock = blockIndexOf('CAB');

  return {
    ...preset,
    fxLoopMode: scenario.mode === 1 ? 1 : 0,
    effects: preset.effects.map((slot) => {
      if (scenario.amp !== undefined && slot.slotIndex === ampBlock) {
        return { ...slot, enabled: scenario.amp };
      }
      if (scenario.cab !== undefined && slot.slotIndex === cabBlock) {
        return { ...slot, enabled: scenario.cab };
      }
      return slot;
    }),
  };
}

/**
 * Which scenario a preset currently matches, if any. Used to show the active
 * choice in the picker; a patch the user has since hand-edited matches none.
 */
export function matchFxScenario(preset: GP200Preset): FxScenario | undefined {
  const ampBlock = blockIndexOf('AMP');
  const cabBlock = blockIndexOf('CAB');
  const amp = preset.effects.find((slot) => slot.slotIndex === ampBlock)?.enabled;
  const cab = preset.effects.find((slot) => slot.slotIndex === cabBlock)?.enabled;

  return FX_SCENARIOS.find((scenario) =>
    scenario.mode === preset.fxLoopMode
    && (scenario.amp === undefined || scenario.amp === amp)
    && (scenario.cab === undefined || scenario.cab === cab));
}
