import fs from 'node:fs'
import path from 'node:path'
import { createServer, defineConfig, loadEnv, type Connect, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

/*
 * `npm run dev`        the usual local server, http://localhost:5173.
 *
 * `npm run dev:phone`  the same app, reachable from a phone on the same Wi-Fi.
 *   A phone only lets a page use the camera over https, and "localhost" on a
 *   phone is the phone itself. So this mode serves the app over https with a
 *   throwaway certificate (the phone shows a warning once; choose to proceed)
 *   and passes /api calls through to the backend on this computer, so the
 *   phone needs only the one address Vite prints as "Network".
 *
 * `npm run build`      also builds the service worker, src/service-worker.ts,
 *   into dist/service-worker.js with the list of files it keeps for offline
 *   use. The worker exists only in a build: test it with `npm run preview`.
 */

/**
 * Emergency only: with SW_KILLSWITCH=true the build publishes
 * public/service-worker-killswitch.js as /service-worker.js, which removes
 * the service worker and everything it stored from every device. See
 * DEPLOY.md, "If the service worker goes wrong".
 */
function killSwitch(): Plugin {
  let outDir = 'dist'
  return {
    name: 'internet-sw-killswitch',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      fs.copyFileSync(
        path.resolve('public/service-worker-killswitch.js'),
        path.join(outDir, 'service-worker.js')
      )
    },
  }
}

/**
 * Iteration 23: two pages. index.html is the public landing page at "/",
 * rendered to plain HTML when the site is built (src/landing/render.tsx,
 * marked <!--landing--> in index.html) and enhanced by a small script of its
 * own. app.html is the app: every other address that is not a file. Vercel
 * does the same (vercel.json); this does it for `npm run dev` and `preview`.
 */
const APP_VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'local'

function isAppAddress(url: string): boolean {
  const pathname = url.split(/[?#]/)[0]
  if (pathname === '/' || pathname === '/index.html') return false
  if (/^\/(@|src\/|node_modules\/|api\/)/.test(pathname)) return false
  return !/\.[a-z0-9]+$/i.test(pathname)
}

const appPages: Connect.NextHandleFunction = (req, res, next) => {
  const url = req.url || '/'
  if (url.split(/[?#]/)[0] === '/login') {
    res.statusCode = 307
    res.setHeader('Location', '/#doors')
    return res.end()
  }
  if ((req.method === 'GET' || req.method === 'HEAD') && isAppAddress(url)) {
    req.url = '/app.html' + (url.includes('?') ? url.slice(url.indexOf('?')) : '')
  }
  next()
}

function landingPage(): Plugin {
  let root = process.cwd()
  let dev: ViteDevServer | null = null
  let renderer: ViteDevServer | null = null
  return {
    name: 'internet-landing',
    configResolved(config) {
      root = config.root
    },
    configureServer(server) {
      dev = server
      server.middlewares.use(appPages)
    },
    configurePreviewServer(server) {
      server.middlewares.use(appPages)
    },
    transformIndexHtml: {
      // Before Vite reads the page for its files, so the seal's <img> in the
      // rendered markup is bundled like any other.
      order: 'pre',
      async handler(html) {
        if (!html.includes('<!--landing-->')) return html
        const loader =
          dev ??
          (renderer ??= await createServer({
            configFile: false,
            root,
            logLevel: 'error',
            appType: 'custom',
            server: { middlewareMode: true, hmr: false, ws: false },
            define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
            plugins: [react(), tailwindcss()],
          }))
        const module = (await loader.ssrLoadModule('/src/landing/render.tsx')) as { render: () => string }
        return html.replace('<!--landing-->', module.render())
      },
    },
    async closeBundle() {
      await renderer?.close()
      renderer = null
    },
  }
}

export default defineConfig(({ mode }) => {
  const phone = mode === 'phone'
  // Where the backend runs on this computer: the address normal development uses.
  const backend =
    loadEnv('development', process.cwd(), 'VITE_').VITE_API_URL || 'http://localhost:5000'

  const serviceWorker =
    process.env.SW_KILLSWITCH === 'true'
      ? killSwitch()
      : VitePWA({
          strategies: 'injectManifest',
          srcDir: 'src',
          filename: 'service-worker.ts',
          // Registered by src/lib/serviceWorker.ts; the manifest is public/manifest.json.
          injectRegister: false,
          manifest: false,
          injectManifest: {
            // What the app needs to open with no connection.
            globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
            globIgnores: [
              // Large and versioned separately: kept on first use by the worker.
              'mediapipe/**',
              'models/**',
              // Only for the coordinator's PDF export, which needs a connection anyway.
              '**/analyticsPdf-*.js',
              '**/html2canvas-*.js',
              '**/index.es-*.js',
              '**/purify.es-*.js',
              // Alphabets the interface does not use.
              '**/*-latin-ext-*.woff2',
              '**/*-vietnamese-*.woff2',
              'service-worker-killswitch.js',
              // Only the browser's install dialog uses these.
              'screenshots/**',
              // Only an iPhone opening from the Home Screen uses these, once each.
              'startup/**',
              // Only the install dialog and the Home Screen use the role apps' icons.
              'icons/**',
              // The PSU marks (internet-revisions, Section 2): only the 128 px copies and the
              // university seal are kept for offline use; the 512 px ones load when shown.
              'brand/psu/college-*[!8].png',
              'brand/psu/org-*[!8].png',
            ],
          },
        })

  return {
    // Shown in crash reports so a fault can be tied to a build. Vercel supplies
    // the commit; a local build says "local".
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
    },
    plugins: [react(), tailwindcss(), landingPage(), serviceWorker, ...(phone ? [basicSsl()] : [])],
    build: {
      rollupOptions: {
        // The landing page (index.html) and the app (app.html): two pages, two scripts.
        input: { index: path.resolve('index.html'), app: path.resolve('app.html') },
      },
    },
    server: phone
      ? { host: true, proxy: { '/api': { target: backend, changeOrigin: true } } }
      : undefined,
  }
})
