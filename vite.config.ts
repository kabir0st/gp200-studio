import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  // Served from a subfolder of the afterhour.uk umbrella domain
  // (afterhour.uk/gp200studio). Base rewrites asset URLs; outDir nests the build
  // under the same path so Cloudflare Workers Assets serves it by request path.
  base: '/gp200studio/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist/gp200studio',
    emptyOutDir: true,
    // Never inline the AudioWorklet as a data: URL — Chromium's
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
})
