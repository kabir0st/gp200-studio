import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(() => ({
  // Served from the root of its own apex domain (gp200studio.com), so base is
  // '/' in every mode and dev matches production exactly. This used to be
  // '/gp200studio/' at build time, when the app lived in a subfolder of
  // kabirtamari.com; worker/index.js now 301s that path here.
  //
  // Everything that resolves an asset at runtime still goes through
  // import.meta.env.BASE_URL, so the subfolder case remains a one-line change.
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // WSL2 in NAT mode runs the dev server in a separate network namespace from the
  // Windows browser, so Vite's default 127.0.0.1 binding is unreachable from the
  // host. Bind all interfaces so both localhost forwarding and the WSL IP work.
  server: {
    host: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Two entries: the editor SPA, and a near-empty shell for the prerendered
    // guide pages so they don't have to download the whole editor bundle to
    // display static prose. scripts/prerender.mjs consumes both.
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        guide: path.resolve(__dirname, 'guide.html'),
      },
    },
    // Never inline the AudioWorklet as a data: URL. Chromium's
    // audioWorklet.addModule() rejects data: URLs, so it must stay a real,
    // separately-fetchable asset file (see src/hooks/useLooper.ts).
    assetsInlineLimit: (filePath: string) =>
      filePath.endsWith('.worklet.js') ? false : undefined,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
}))
