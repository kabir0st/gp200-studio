import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Serves the prerendered guide pages during `npm run dev`.
 *
 * The guide has no client-side router: src/guide-main.ts renders nothing, and
 * the DOM inside #root is written at build time by scripts/prerender.mjs. In
 * dev that step has not run, so `/guide` was an empty shell and every deep
 * `/guide/<slug>` fell through Vite's SPA fallback to index.html — the editor's
 * landing page, served at a guide URL. Both looked like a broken link.
 *
 * This calls the same render() the build calls, per request, so the dev server
 * shows what production will and guide copy can be edited without a build.
 * `apply: 'serve'` because the build already has prerender.mjs for this.
 *
 * Only guide-shell routes are intercepted. '/' and '/editor' are the editor
 * SPA, which the normal dev pipeline already serves correctly, and taking them
 * over here would put an SSR pass in front of every hot reload.
 */
function guideDevServer(): Plugin {
  return {
    name: 'gp200-guide-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '/').split('?')[0].replace(/\/+$/, '') || '/'
        try {
          const mod = await server.ssrLoadModule('/src/prerender/entry-server.tsx')
          if (!(mod.ROUTE_PATHS as string[]).includes(url)) return next()
          const page = mod.render(url) as { head: string; body: string; shell: string }
          if (page.shell !== 'guide') return next()

          const shellPath = path.resolve(__dirname, 'guide.html')
          const raw = readFileSync(shellPath, 'utf8')
          const html = (await server.transformIndexHtml(url, raw, shellPath))
            .replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/, page.head)
            .replace('<div id="root"></div>', `<div id="root">${page.body}</div>`)

          res.setHeader('Content-Type', 'text/html')
          res.end(html)
        } catch (error) {
          next(error)
        }
      })
    },
  }
}

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
  plugins: [react(), guideDevServer()],
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
