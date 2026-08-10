import { useCallback, useEffect, useState } from 'react';

import { isUiSoundEnabled, playSwitchClick, preloadSwitchClicks, setUiSoundEnabled } from '@/lib/uiSound';

/**
 * The "does the chassis make noise" preference, remembered in localStorage
 * (`gp200:ui-sound`, matching the key style of hooks/useTheme.ts).
 *
 * The module in src/lib/uiSound.ts stays the source of truth so a click can
 * read it synchronously; this hook only mirrors it into React for the toggle
 * button's rendered state.
 */
export function useUiSound() {
  const [soundOn, setSoundOn] = useState(isUiSoundEnabled);

  useEffect(() => {
    if (soundOn) preloadSwitchClicks();
  }, [soundOn]);

  const toggleSound = useCallback(() => {
    const next = !isUiSoundEnabled();
    setUiSoundEnabled(next);
    setSoundOn(next);
    // Turning sound back on should demonstrate itself; turning it off is
    // self-evidently silent.
    if (next) playSwitchClick(true);
  }, []);

  return { soundOn, toggleSound };
}
