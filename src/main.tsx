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
    window.location.reload();
  }
});

if ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then(registrations =>
    Promise.all(registrations.map(registration => registration.unregister())),
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
