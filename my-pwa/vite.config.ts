import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
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
            ],
          },
        })

  return {
    // Shown in crash reports so a fault can be tied to a build. Vercel supplies
    // the commit; a local build says "local".
    define: {
      __APP_VERSION__: JSON.stringify(
        (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'local'
      ),
    },
    plugins: [react(), tailwindcss(), serviceWorker, ...(phone ? [basicSsl()] : [])],
    server: phone
      ? { host: true, proxy: { '/api': { target: backend, changeOrigin: true } } }
      : undefined,
  }
})
