import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Served from a subfolder of the kabirtamari.com name domain
  // (kabirtamari.com/gp200studio). Base rewrites asset URLs; outDir nests the build
  // under the same path so Cloudflare Workers Assets serves it by request path.
  // A more-specific Worker route (kabirtamari.com/gp200studio*) wins over the
  // resume worker's custom domain on kabirtamari.com.
  //
  // Build-only: in dev there is no subfolder to mirror, so serve from the root
  // and keep the dev URL a plain http://localhost:5173/. Everything that resolves
  // an asset at runtime goes through import.meta.env.BASE_URL, so both work.
  base: command === 'build' ? '/gp200studio/' : '/',
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
    outDir: 'dist/gp200studio',
    emptyOutDir: true,
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
