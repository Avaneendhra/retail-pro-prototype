// The store engine: the one place that knows what the shop's data is right now.
//
// Without an account ("local mode") changes apply straight to the data on this
// device. With an account the engine keeps three things for the shop:
//   base    the last state the server confirmed
//   outbox  changes made here that the server has not confirmed yet
//   cursor  how far this device has read the shop's changes
// What the screens see is always the outbox applied on top of the base, so a
// sale shows at once, survives being offline, and is never counted twice.
//
// The engine owns no timers and touches no browser API: time, ids, storage,
// the session and the network are all handed in, which is what lets the tests
// run two devices against the real server.
import { normalizeLogin, deriveAuthKey } from '../../shared/auth.js';
import { ApiError } from './api.js';
import { deviceCode } from './ids.js';
import { mergeChanges, pruneBills } from './merge.js';
import { applyOp, emptyDataset } from './ops.js';

const DAY = 86_400_000;
export const ACCOUNT_BILL_DAYS = 60;   // the server keeps the rest
export const LOCAL_BILL_DAYS = 365;    // nothing else keeps them
const MAX_OPS = 25;                    // per request (the server's limit)
const MAX_BATCH_BYTES = 700_000;       // per request; the server refuses bodies over 1 MB
const IMPORT_ROWS = 100;               // per import change (the server's limit)
const IMPORT_BYTES = 150_000;
const SYNC_DELAY_MS = 600;

const encoder = new TextEncoder();
const sizes = new WeakMap();
function byteLength(value) {
  let size = sizes.get(value);
  if (size === undefined) {
    size = encoder.encode(JSON.stringify(value)).length;
    sizes.set(value, size);
  }
  return size;
}

function maxCounters(mine, theirs = {}) {
  const next = {
    bill: Math.max(mine.bill ?? 1, theirs.bill ?? 0),
    po: Math.max(mine.po ?? 1, theirs.po ?? 0),
    sku: Math.max(mine.sku ?? 1, theirs.sku ?? 0),
  };
  return next.bill === mine.bill && next.po === mine.po && next.sku === mine.sku ? mine : next;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createEngine({
  storage, api, sessionStore, deviceId, deviceName = '',
  now = () => Date.now(),
  makeId = () => crypto.randomUUID(),
  seed,
  legacy = null,
  defer = (fn, ms) => setTimeout(fn, ms),
  deriveKey = deriveAuthKey,
}) {
  let stopped = false;
  let ready = false;
  let mode = 'local';
  let session = null;            // { token, user, shop, device: { id, no } }
  let datasetId = 'local';
  let dataset = emptyDataset();
  let view = dataset.data;
  let savedBills;                // the bill list as last written for datasetId; undefined = not known
  let saveError = null;
  let sync = { status: 'off', lastSyncAt: null, error: null };
  let generation = 0;            // goes up whenever the active dataset is swapped; late answers are dropped
  const listeners = new Set();

  /* ── what the screens see ───────────────────────────────────── */

  const unsent = () => {
    if (mode !== 'account') return [];
    if (!dataset.acked?.length) return dataset.outbox;
    const acked = new Set(dataset.acked);
    return dataset.outbox.filter((op) => !acked.has(op.id));
  };

  const buildSnapshot = () => ({
    ready,
    mode,
    data: view,
    account: session && mode === 'account' ? { user: session.user, shop: session.shop, device: session.device } : null,
    storage: storage.kind,
    saveError,
    sync: {
      status: mode === 'account' ? sync.status : 'off',
      pending: unsent().length,
      lastSyncAt: sync.lastSyncAt,
      error: sync.error,
      rejected: (dataset.parked || []).map(({ op, reason }) => ({ id: op.id, type: op.type, reason })),
    },
  });
  let snapshot = buildSnapshot();

  function publish() {
    if (stopped) return;
    snapshot = buildSnapshot();
    for (const listener of [...listeners]) listener();
  }

  const rebuildView = () => {
    view = mode === 'account' ? dataset.outbox.reduce(applyOp, dataset.data) : dataset.data;
  };

  const cutoff = (days) => Math.floor((now() - days * DAY) / DAY) * DAY;
  const billsSince = () => cutoff(mode === 'account' ? ACCOUNT_BILL_DAYS : LOCAL_BILL_DAYS);

  /* ── saving ─────────────────────────────────────────────────── */

  let saving = null;
  let saveQueued = false;

  /** Writes the current dataset. Saves never overlap; a failure is shown, never swallowed. */
  function persist() {
    if (saving) {
      saveQueued = true;
      return saving;
    }
    saving = (async () => {
      do {
        saveQueued = false;
        const id = datasetId;
        const current = dataset;
        try {
          await storage.save(id, current, savedBills);
          if (id === datasetId) savedBills = current.data.bills;
          if (saveError !== null) {
            saveError = null;
            publish();
          }
        } catch (error) {
          if (id === datasetId) savedBills = undefined; // not sure what was written: write every bill next time
          const message = String(error?.message || error);
          if (saveError !== message) {
            saveError = message;
            publish();
          }
        }
      } while (saveQueued && !stopped);
      saving = null;
    })();
    return saving;
  }

  async function settled() {
    while (saving) await saving;
  }

  /* ── changes ────────────────────────────────────────────────── */

  let syncScheduled = false;
  function scheduleSync() {
    if (syncScheduled || mode !== 'account') return;
    syncScheduled = true;
    defer(() => {
      syncScheduled = false;
      syncNow();
    }, SYNC_DELAY_MS);
  }

  /** Makes a change. It shows at once; with an account it is also queued for the server. */
  function dispatch(type, payload = {}) {
    const op = { id: makeId(), type, at: now(), ...payload };
    if (mode === 'account') {
      dataset = { ...dataset, outbox: [...dataset.outbox, op] };
      view = applyOp(view, op);
      scheduleSync();
    } else {
      dataset = { ...dataset, data: applyOp(dataset.data, op) };
      view = dataset.data;
    }
    persist();
    publish();
    return op;
  }

  /** The next bill, order or product number for this device, with the device's letter. */
  function takeNumber(kind) {
    const n = dataset.counters[kind] ?? 1;
    dataset = { ...dataset, counters: { ...dataset.counters, [kind]: n + 1 } };
    persist();
    return { n, code: deviceCode(mode === 'account' ? dataset.device.no : 0) };
  }

  /* ── syncing ────────────────────────────────────────────────── */

  function setSync(patch) {
    sync = { ...sync, ...patch };
    publish();
  }

  /** The next changes to send: oldest first, within the server's count and size limits. */
  function nextBatch() {
    const batch = [];
    let bytes = 0;
    for (const op of unsent()) {
      const size = byteLength(op);
      if (batch.length && (batch.length >= MAX_OPS || bytes + size > MAX_BATCH_BYTES)) break;
      batch.push(op);
      bytes += size;
    }
    return batch;
  }

  /** Changes the server will not take are set aside (and kept), not retried forever. */
  function park(entries) {
    const gone = new Set(entries.map(({ op }) => op.id));
    dataset = {
      ...dataset,
      outbox: dataset.outbox.filter((op) => !gone.has(op.id)),
      parked: [...(dataset.parked || []), ...entries.map(({ op, reason }) => ({ op, reason, at: now() }))],
    };
  }

  function applyResponse(res, batch) {
    const before = dataset;
    const accepted = new Set(res.accepted);
    const reasons = new Map(res.rejected.filter((r) => r.id != null).map((r) => [r.id, r.reason]));
    const unnamed = res.rejected.find((r) => r.id == null)?.reason ?? 'not_acknowledged';

    const refused = batch.filter((op) => !accepted.has(op.id)).map((op) => ({ op, reason: reasons.get(op.id) ?? unnamed }));
    if (refused.length) park(refused);

    // A confirmed change stays in the outbox until its effects have arrived
    // (`more` false means this device has read everything), so the screen never loses it in between.
    const acked = new Set([...(before.acked || []), ...batch.filter((op) => accepted.has(op.id)).map((op) => op.id)]);
    const outbox = res.more ? dataset.outbox : dataset.outbox.filter((op) => !acked.has(op.id));
    const stillAcked = res.more ? outbox.filter((op) => acked.has(op.id)).map((op) => op.id) : [];

    let base = mergeChanges(before.data, res.changes || {}, { billsSince: billsSince() });
    if (res.shop?.name != null && base.shop.name !== res.shop.name) base = { ...base, shop: { ...base.shop, name: res.shop.name } };

    const deviceNo = res.device?.no ?? before.device.no;
    const counters = maxCounters(dataset.counters, res.device?.counters);
    const changed = base !== before.data || outbox.length !== before.outbox.length || refused.length > 0
      || res.cursor !== before.cursor || counters !== before.counters || deviceNo !== before.device.no
      || stillAcked.length !== (before.acked?.length ?? 0);

    if (changed) {
      dataset = { ...dataset, data: base, outbox, acked: stillAcked, cursor: res.cursor, counters, device: { id: deviceId, no: deviceNo } };
      rebuildView();
      persist();
    }

    const nextSession = {
      token: res.token || session.token,
      user: res.user || session.user,
      shop: res.shop || session.shop,
      device: { id: deviceId, no: deviceNo },
    };
    const sessionChanged = !same(nextSession, session);
    if (sessionChanged) {
      session = nextSession;
      sessionStore.set(session);
    }
    if (changed || sessionChanged) publish(); // each page shows as it arrives
  }

  async function runSync() {
    const startedIn = generation;
    const current = () => startedIn === generation && !stopped;
    setSync({ status: 'syncing' });
    try {
      for (;;) {
        const batch = nextBatch();
        const cursorBefore = dataset.cursor;
        let res;
        try {
          res = await api.sync(session.token, {
            deviceId, since: dataset.cursor, billsSince: billsSince(), counters: dataset.counters, ops: batch,
          });
        } catch (error) {
          if (!current()) return;
          if (error?.status === 413 && batch.length === 1) {
            park([{ op: batch[0], reason: 'too_large' }]);
            rebuildView();
            persist();
            continue;
          }
          throw error;
        }
        if (!current()) return;
        applyResponse(res, batch);
        // "More to read" with a cursor that did not move would repeat the same request forever.
        if (res.more && !(res.cursor > cursorBefore)) throw new Error('The server did not send the next changes. It will be tried again.');
        if (!res.more && !unsent().length) break;
      }
      setSync({ status: 'idle', lastSyncAt: now(), error: null });
    } catch (error) {
      if (!current()) return;
      if (error?.status === 0) setSync({ status: 'offline', error: null });
      else if (error?.status === 401) setSync({ status: 'auth', error: error.message });
      else setSync({ status: 'error', error: String(error?.message || error) });
    }
  }

  let running = null;
  /** Sends what is waiting and fetches what is new. Never rejects: the outcome is in `sync.status`. */
  function syncNow() {
    if (mode !== 'account' || !session || stopped) return Promise.resolve();
    if (!running) {
      running = runSync().finally(() => { running = null; });
    }
    return running;
  }

  /** Called regularly by the app (and when the network returns). */
  function tick() {
    if (mode !== 'account' || sync.status === 'auth') return Promise.resolve();
    return syncNow();
  }

  function retryRejected() {
    if (!dataset.parked?.length) return;
    dataset = { ...dataset, outbox: [...dataset.outbox, ...dataset.parked.map(({ op }) => op)], parked: [] };
    rebuildView();
    persist();
    publish();
    scheduleSync();
  }

  function discardRejected() {
    if (!dataset.parked?.length) return;
    dataset = { ...dataset, parked: [] };
    persist();
    publish();
  }

  /* ── opening datasets ───────────────────────────────────────── */

  async function openLocal() {
    mode = 'local';
    datasetId = 'local';
    session = null;
    sync = { status: 'off', lastSyncAt: null, error: null };
    let stored = await storage.load('local');
    let fromLegacy = false;
    savedBills = stored ? stored.data.bills : undefined;
    if (!stored) {
      stored = legacy?.read?.() ?? null;
      fromLegacy = Boolean(stored);
      stored = stored ?? seed(now());
    }
    dataset = { ...stored, data: pruneBills(stored.data, cutoff(LOCAL_BILL_DAYS)) };
    rebuildView();
    if (savedBills === undefined) {
      await persist();
      if (fromLegacy && saveError === null) legacy.clear?.();
    }
  }

  async function openAccount(account, fallback) {
    const id = `shop:${account.shop.id}`;
    // Signing in again to the shop that is already open (after "please sign in again"):
    // what is in memory is the newest copy, even if the last save failed.
    const open = mode === 'account' && datasetId === id ? { dataset, savedBills } : null;
    mode = 'account';
    session = { token: account.token, user: account.user, shop: account.shop, device: { id: deviceId, no: account.device.no } };
    datasetId = id;
    sync = { status: 'idle', lastSyncAt: null, error: null };
    const stored = fallback?.fresh ? null : open ? open.dataset : await storage.load(id);
    savedBills = open ? open.savedBills : stored ? stored.data.bills : undefined;
    const base = stored ?? fallback?.dataset ?? emptyDataset();
    dataset = {
      ...base,
      data: pruneBills(base.data, cutoff(ACCOUNT_BILL_DAYS)),
      device: { id: deviceId, no: account.device.no },
      counters: maxCounters(base.counters, account.device.counters),
    };
    rebuildView();
  }

  async function start() {
    const saved = sessionStore.get();
    if (saved?.token && saved.shop?.id && saved.user) {
      await openAccount({ ...saved, device: { no: saved.device?.no ?? 0, counters: {} } });
    } else {
      await openLocal();
    }
    ready = true;
    publish();
    if (mode === 'account') syncNow();
  }

  /* ── accounts ───────────────────────────────────────────────── */

  function cleanLogin(login) {
    const normalized = normalizeLogin(login);
    if (!normalized) throw new ApiError(400, 'invalid_login', 'Enter a phone number or an email address.');
    return normalized;
  }

  /** Everything on this device, as changes the server can take in pieces. */
  function importOps(data) {
    const ops = [];
    let rows = {};
    let count = 0;
    let bytes = 0;
    const flush = () => {
      if (count) ops.push({ id: makeId(), type: 'import', at: now(), ...rows });
      rows = {};
      count = 0;
      bytes = 0;
    };
    for (const key of ['products', 'purchaseOrders', 'invoices', 'bills']) {
      for (const row of data[key]) {
        const size = byteLength(row);
        if (count && (count >= IMPORT_ROWS || bytes + size > IMPORT_BYTES)) flush();
        (rows[key] ||= []).push(row);
        count += 1;
        bytes += size;
      }
    }
    flush();
    return ops;
  }

  async function enter(account, fallback) {
    await settled();
    generation += 1;
    await openAccount(account, fallback);
    sessionStore.set(session);
    publish();
    await persist();
    syncNow();
  }

  async function signUp({ shopName, name, login, password, keepDeviceData = false }) {
    const cleaned = cleanLogin(login);
    const authKey = await deriveKey(cleaned, password);
    const res = await api.signup({ shopName, name, login: cleaned, authKey, deviceId, deviceName });

    await settled();
    const local = keepDeviceData ? (mode === 'local' ? dataset : await storage.load('local')) : null;
    const fresh = emptyDataset({ counters: local ? local.counters : undefined });
    fresh.data.shop = { name: res.shop.name };
    if (local) fresh.outbox = importOps(local.data);
    await enter(res, { fresh: true, dataset: fresh });

    // The device's own data now belongs to the shop. Keeping a second, ageing copy
    // for "no account" mode would only be mistaken for the real thing later.
    if (local && saveError === null) await storage.drop('local').catch(() => {});
    return { recoveryCode: res.recoveryCode };
  }

  async function signInWithKey(login, authKey) {
    const res = await api.login({ login, authKey, deviceId, deviceName });
    await enter(res);
  }

  async function signIn({ login, password }) {
    const cleaned = cleanLogin(login);
    await signInWithKey(cleaned, await deriveKey(cleaned, password));
  }

  async function recover({ login, recoveryCode, password }) {
    const cleaned = cleanLogin(login);
    const authKey = await deriveKey(cleaned, password);
    const res = await api.recover({ login: cleaned, recoveryCode, authKey });
    await signInWithKey(cleaned, authKey);
    return { recoveryCode: res.recoveryCode };
  }

  /** Leaves the account on this device. Changes not yet sent stay saved and go up at the next sign-in. */
  async function signOut() {
    if (mode !== 'account') return;
    await settled();
    generation += 1;
    sessionStore.set(null);
    await openLocal();
    publish();
  }

  async function changePassword({ current, next }) {
    const { login } = session.user;
    const res = await api.changePassword(session.token, {
      currentAuthKey: await deriveKey(login, current),
      authKey: await deriveKey(login, next),
    });
    session = { ...session, token: res.token };
    sessionStore.set(session);
  }

  const team = {
    list: async () => (await api.team.list(session.token)).members,
    add: async ({ name, login, password }) => {
      const cleaned = cleanLogin(login);
      return (await api.team.add(session.token, { name, login: cleaned, authKey: await deriveKey(cleaned, password) })).member;
    },
    /** A password reset needs the member's `login` (it is part of how the password is stretched). */
    update: async (id, { name, disabled, login, password }) => {
      const body = { name, disabled, ...(password ? { authKey: await deriveKey(cleanLogin(login), password) } : {}) };
      return (await api.team.update(session.token, id, body)).member;
    },
  };

  async function checkServer() {
    try {
      return (await api.health()).ok === true;
    } catch {
      return false;
    }
  }

  async function resetLocal() {
    if (mode !== 'local') return;
    await settled();
    dataset = seed(now());
    savedBills = undefined;
    rebuildView();
    publish();
    await persist();
  }

  function stop() {
    stopped = true;
    listeners.clear();
  }

  return {
    start, stop, getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch, takeNumber, syncNow, tick, settled, retryRejected, discardRejected,
    signUp, signIn, recover, signOut, changePassword, team, checkServer, resetLocal,
  };
}
