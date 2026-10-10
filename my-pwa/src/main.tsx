import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installSessionGuard } from './lib/sessionGuard'
import { purgeOrphanedOfflineData } from './lib/offlineStore'
import { LaunchGate } from './brand'
import ErrorBoundary from './components/ErrorBoundary'
import { registerServiceWorker } from './lib/serviceWorker'

installSessionGuard()
// Erase offline data left behind by an account no longer signed in here.
void purgeOrphanedOfflineData()

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
