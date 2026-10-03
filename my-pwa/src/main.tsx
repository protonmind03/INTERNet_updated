import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installSessionGuard } from './lib/sessionGuard'

installSessionGuard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Opening the app clears the unread dot a push notification put on its icon.
const clearAppBadge = () => {
  if (document.visibilityState !== "visible" || !("clearAppBadge" in navigator)) return;
  void (navigator as Navigator & { clearAppBadge: () => Promise<void> })
    .clearAppBadge()
    .catch(() => {});
};
clearAppBadge();
document.addEventListener("visibilitychange", clearAppBadge);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((error) => {
      console.error("SERVICE WORKER REGISTRATION ERROR:", error);
    });
  });
}
