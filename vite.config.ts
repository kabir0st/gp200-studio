import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
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
