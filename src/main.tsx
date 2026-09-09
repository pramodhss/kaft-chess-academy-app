import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import './index.css';
import App from './App';

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const recoveryKey = 'kaft-preload-recovery';
  const lastRecovery = Number(sessionStorage.getItem(recoveryKey) ?? '0');
  if (Date.now() - lastRecovery > 30_000) {
    sessionStorage.setItem(recoveryKey, String(Date.now()));
    void Promise.all([
      'caches' in window ? caches.keys().then(names => Promise.all(names.map(name => caches.delete(name)))) : Promise.resolve(),
      'serviceWorker' in navigator ? navigator.serviceWorker.getRegistrations().then(registrations =>
        Promise.all(registrations.map(registration => registration.unregister())),
      ) : Promise.resolve(),
    ]).finally(() => window.location.reload());
  }
});

if ('serviceWorker' in navigator) {
  const refreshServiceWorker = () => {
    void navigator.serviceWorker.ready.then(registration => registration.update()).catch(() => undefined);
  };
  window.addEventListener('pageshow', refreshServiceWorker);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshServiceWorker();
  });
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    void navigator.serviceWorker.getRegistrations().then(registrations =>
      Promise.all(registrations.map(registration => registration.unregister())),
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
