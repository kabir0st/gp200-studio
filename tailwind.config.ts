import type { Config } from 'tailwindcss'

// Every color here reads from a CSS variable defined in src/index.css so
// theme tweaks stay in one place. See docs/design-system.md for the full
// rationale (incl. why MODULE_COLORS in src/core/effectNames.ts is a
// deliberately separate, per-effect color source, not merged in here).
const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': 'var(--bg-primary)',
        'bg-surface': 'var(--bg-surface)',
        'bg-surface-raised': 'var(--bg-surface-raised)',
        'bg-elevated': 'var(--bg-elevated)',
        'bg-card': 'var(--bg-card)',
        'bg-input': 'var(--bg-input)',
        'bg-deep': 'var(--bg-deep)',
        'bg-hover': 'var(--bg-hover)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'border-subtle': 'var(--border-subtle)',
        'border-active': 'var(--border-active)',
        'accent': 'var(--accent)',
        'accent-dim': 'var(--accent-dim)',
        'accent-red': 'var(--accent-red)',
        'accent-green': 'var(--accent-green)',
      },
      boxShadow: {
        'glow-accent': '0 0 12px var(--glow-accent)',
        'glow-red': '0 0 12px var(--glow-red)',
        'glow-green': '0 0 12px var(--glow-green)',
        card: '0 8px 24px rgba(30,30,35,0.18), inset 0 1px 0 rgba(255,255,255,0.5)',
      },
      fontSize: {
        // Named type scale that replaces ad-hoc text-[8px]/[9px]/[10px]/[11px].
        // See docs/design-system.md "Typography" for usage rules per size.
        micro: ['0.5625rem', { lineHeight: '0.75rem', letterSpacing: '0.04em' }], // 9px
        label: ['0.625rem', { lineHeight: '0.875rem', letterSpacing: '0.03em' }], // 10px
        caption: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }], // 11px
      },
      fontFamily: {
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
