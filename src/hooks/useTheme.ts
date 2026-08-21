import { useCallback, useEffect, useState } from 'react';

export type ThemeName = 'light' | 'dark';

const STORAGE_KEY = 'gp200:theme';

/** Browser chrome color per theme (matches --bg-primary in src/index.css). */
const THEME_COLOR: Record<ThemeName, string> = {
  light: '#e8e9eb',
  dark: '#17181a',
};

/**
 * The theme the document is already showing. index.html sets `data-theme`
 * before first paint (no flash of the wrong stage), so React must adopt that
 * value rather than re-deciding it and re-painting.
 *
 * Dark is the fallback, and the check is written against 'light' so that any
 * value the pre-paint script did not set — a missing attribute, a typo, a
 * blocked localStorage — lands on the default rather than on the exception.
 */
function readInitialTheme(): ThemeName {
  if (typeof document === 'undefined') return 'dark';
  if (document.documentElement.dataset.theme === 'light') return 'light';
  return 'dark';
}

/**
 * Light/dark stage theme. Both palettes are CSS custom properties in
 * src/index.css selected by `:root[data-theme]`, so switching is one attribute
 * write and every component (Tailwind tokens, board.css, mobile.css) follows.
 *
 * Dark by default. The board is a stage instrument, the landing page it is
 * reached through is a dark stage end to end, and lights-down is the room a
 * pedalboard is usually in. The light stage is still there on the power
 * rocker, and once flipped it is remembered.
 *
 * The choice is remembered in localStorage. It is deliberately NOT seeded from
 * `prefers-color-scheme`: the board's light environment is a design decision,
 * and OS light mode shouldn't silently change how a pedalboard looks under
 * stage lights.
 */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeName>(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLOR[theme]);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private mode / blocked storage: the theme still applies for this session.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, setTheme, toggleTheme };
}
