import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  // Served from a subfolder of the kabirtamari.com name domain
  // (kabirtamari.com/gp200studio). Base rewrites asset URLs; outDir nests the build
  // under the same path so Cloudflare Workers Assets serves it by request path.
  // A more-specific Worker route (kabirtamari.com/gp200studio*) wins over the
  // resume worker's custom domain on kabirtamari.com.
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
