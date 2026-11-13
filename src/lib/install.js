import { useEffect, useState } from 'react';

// Captures the browser's install prompt so the app can offer "Install app" itself.
let deferred = null;
const listeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    listeners.forEach(fn => fn());
  });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach(fn => fn()); });
}

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

export const isIOS = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  const installed = isStandalone();
  return {
    installed,
    canPrompt: !!deferred && !installed,
    iosHint: isIOS() && !installed,
    install: async () => {
      if (!deferred) return false;
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      force(n => n + 1);
      return outcome === 'accepted';
    },
  };
}
