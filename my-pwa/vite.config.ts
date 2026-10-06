import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

/*
 * `npm run dev`        the usual local server, http://localhost:5173.
 *
 * `npm run dev:phone`  the same app, reachable from a phone on the same Wi-Fi.
 *   A phone only lets a page use the camera over https, and "localhost" on a
 *   phone is the phone itself. So this mode serves the app over https with a
 *   throwaway certificate (the phone shows a warning once; choose to proceed)
 *   and passes /api calls through to the backend on this computer, so the
 *   phone needs only the one address Vite prints as "Network".
 */
export default defineConfig(({ mode }) => {
  const phone = mode === 'phone'
  // Where the backend runs on this computer: the address normal development uses.
  const backend =
    loadEnv('development', process.cwd(), 'VITE_').VITE_API_URL || 'http://localhost:5000'

  return {
    plugins: [react(), tailwindcss(), ...(phone ? [basicSsl()] : [])],
    server: phone
      ? { host: true, proxy: { '/api': { target: backend, changeOrigin: true } } }
      : undefined,
  }
})
