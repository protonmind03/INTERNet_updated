import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installSessionGuard } from './lib/sessionGuard'
import { purgeOrphanedOfflineData } from './lib/offlineStore'
import { watchOfflineQueue } from './lib/offlineQueue'
import { LaunchGate } from './brand'
import ErrorBoundary from './components/ErrorBoundary'
import { registerServiceWorker } from './lib/serviceWorker'
import { watchInstallPrompt } from './lib/useInstallPrompt'

installSessionGuard()
// The browser offers installation once, early: listen before anything renders.
watchInstallPrompt()
// Erase offline data left behind by an account no longer signed in here.
// Then send any attendance steps recorded offline that are still waiting.
void purgeOrphanedOfflineData().then(watchOfflineQueue)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LaunchGate>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </LaunchGate>
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

registerServiceWorker()
