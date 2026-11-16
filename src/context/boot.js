// Starts the store engine with the real browser pieces: IndexedDB, the saved
// session, this device's id and the API. Kept apart from React so it runs once
// per page, however many times React mounts things.
import { createApi } from '../store/api';
import { createEngine } from '../store/engine';
import { clearLegacy, readLegacy } from '../store/legacy';
import { openStorage } from '../store/storage';
import { seedDataset } from '../data/seed';

const SESSION_KEY = 'stokd_session';
const DEVICE_KEY = 'stokd_device';
const LOCK_NAME = 'stokd-app';

const attempt = (fn, fallback = null) => {
  try { return fn(); } catch { return fallback; }
};

const randomHex = (bytes) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Only one tab may run the app at a time: two tabs would each save their own
 * copy over the other's. Resolves true when this tab holds the lock (kept for
 * as long as the tab lives), false when another tab already has it.
 */
export function holdTabLock(locks) {
  if (!locks?.request) return Promise.resolve(true);
  return new Promise((resolve) => {
    Promise.resolve(locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
      resolve(Boolean(lock));
      return lock ? new Promise(() => {}) : undefined;
    })).catch(() => resolve(true));
  });
}

function sessionStoreOn(ls) {
  return {
    get: () => attempt(() => JSON.parse(ls.getItem(SESSION_KEY) || 'null')),
    set: (session) => attempt(() => (session ? ls.setItem(SESSION_KEY, JSON.stringify(session)) : ls.removeItem(SESSION_KEY))),
  };
}

/** A stable id for this browser, so the shop gives it the same device letter every time. */
function deviceIdOn(ls) {
  let id = attempt(() => ls.getItem(DEVICE_KEY));
  if (!id || !/^[\w-]{8,64}$/.test(id)) {
    id = `d-${randomHex(12)}`;
    attempt(() => ls.setItem(DEVICE_KEY, id));
  }
  return id;
}

function describeDevice(nav) {
  const ua = nav?.userAgent || '';
  const system = /android/i.test(ua) ? 'Android' : /iphone|ipad|ipod/i.test(ua) ? 'iPhone' : /windows/i.test(ua) ? 'Windows'
    : /mac os/i.test(ua) ? 'Mac' : /linux/i.test(ua) ? 'Linux' : '';
  const browser = /edg\//i.test(ua) ? 'Edge' : /chrome|crios/i.test(ua) ? 'Chrome' : /firefox|fxios/i.test(ua) ? 'Firefox'
    : /safari/i.test(ua) ? 'Safari' : '';
  return [browser, system].filter(Boolean).join(' on ') || 'Browser';
}

/**
 * Returns `boot()`: the first call starts everything, later calls get the same promise.
 * Resolves to `{ engine }`, or `{ blocked: true }` when the app is already open in another tab.
 */
export function createBoot({ apiUrl = '', env = globalThis } = {}) {
  let started = null;

  async function run() {
    if (!(await holdTabLock(env.navigator?.locks))) return { blocked: true };

    const ls = attempt(() => env.localStorage);
    const storage = await openStorage(attempt(() => env.indexedDB));
    // Ask the browser not to clear the shop's data when the device runs low on space.
    attempt(() => env.navigator?.storage?.persist?.()?.catch?.(() => {}));

    const engine = createEngine({
      storage,
      api: createApi(apiUrl),
      sessionStore: sessionStoreOn(ls),
      deviceId: deviceIdOn(ls),
      deviceName: describeDevice(env.navigator),
      makeId: () => randomHex(12),
      seed: seedDataset,
      legacy: { read: () => readLegacy(ls), clear: () => clearLegacy(ls) },
    });
    await engine.start();
    return { engine };
  }

  return () => (started ??= run());
}

export const bootApp = createBoot({ apiUrl: import.meta.env?.VITE_API_URL || '' });
