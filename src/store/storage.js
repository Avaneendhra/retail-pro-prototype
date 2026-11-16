// Where the shop's data lives on this device: IndexedDB, with a clear fallback.
//
// A dataset is saved as one small record (products, orders, unsent changes,
// counters) plus one record per bill, so a sale writes one bill instead of
// rewriting the whole history. If IndexedDB cannot be used the app still works
// from memory, and `kind` says so, so the screen can warn that nothing is kept.

const DB_NAME = 'stokd';
const DB_VERSION = 1;
const newestFirst = (a, b) => b.at - a.at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

export function memoryStorage(reason = null) {
  const datasets = new Map();
  return {
    kind: 'memory',
    reason,
    async load(id) { return datasets.get(id) ?? null; },
    async save(id, dataset) { datasets.set(id, dataset); },
    async drop(id) { datasets.delete(id); },
  };
}

function openDb(factory, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      fn(value);
      return true;
    };
    const timer = setTimeout(() => finish(reject, new Error('The browser database did not open.')), timeoutMs);

    let request;
    try {
      request = factory.open(DB_NAME, DB_VERSION);
    } catch (error) {
      finish(reject, error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('datasets', { keyPath: 'id' });
      db.createObjectStore('bills', { keyPath: ['dataset', 'id'] }).createIndex('dataset', 'dataset');
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close(); // a newer version of the app is opening it
      if (!finish(resolve, db)) db.close();
    };
    request.onerror = () => finish(reject, request.error || new Error('The browser database could not be opened.'));
  });
}

/** Runs `work` in one transaction; resolves when everything in it is safely written. */
function transact(db, mode, work) {
  return new Promise((resolve, reject) => {
    const failed = (tx) => () => reject(tx.error || new Error('The data could not be saved on this device.'));
    let tx;
    try {
      tx = db.transaction(['datasets', 'bills'], mode);
    } catch (error) {
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = failed(tx);
    tx.onabort = failed(tx);
    try {
      work(tx.objectStore('datasets'), tx.objectStore('bills'));
    } catch (error) {
      try { tx.abort(); } catch { /* already finished */ }
      reject(error);
    }
  });
}

function idbStorage(db) {
  return {
    kind: 'idb',
    reason: null,

    async load(id) {
      let core;
      let bills = [];
      await transact(db, 'readonly', (datasets, billStore) => {
        datasets.get(id).onsuccess = (event) => { core = event.target.result; };
        billStore.index('dataset').getAll(id).onsuccess = (event) => { bills = event.target.result; };
      });
      if (!core) return null;
      const { id: _id, ...dataset } = core;
      return { ...dataset, data: { ...dataset.data, bills: bills.map(({ dataset: _owner, ...bill }) => bill).sort(newestFirst) } };
    },

    /**
     * `prevBills` is the bill list as it was last saved (the same array object).
     * With it, only bills that are new, changed or gone are written.
     */
    async save(id, dataset, prevBills) {
      const { data, ...rest } = dataset;
      const { bills, ...core } = data;
      await transact(db, 'readwrite', (datasets, billStore) => {
        datasets.put({ ...rest, id, data: core });
        const keep = new Set(bills.map((bill) => bill.id));
        if (prevBills) {
          const before = new Set(prevBills);
          for (const bill of bills) if (!before.has(bill)) billStore.put({ ...bill, dataset: id });
          for (const bill of prevBills) if (!keep.has(bill.id)) billStore.delete([id, bill.id]);
        } else {
          billStore.index('dataset').getAllKeys(id).onsuccess = (event) => {
            for (const key of event.target.result) if (!keep.has(key[1])) billStore.delete(key);
          };
          for (const bill of bills) billStore.put({ ...bill, dataset: id });
        }
      });
    },

    async drop(id) {
      await transact(db, 'readwrite', (datasets, billStore) => {
        datasets.delete(id);
        billStore.index('dataset').getAllKeys(id).onsuccess = (event) => {
          for (const key of event.target.result) billStore.delete(key);
        };
      });
    },
  };
}

/** Opens the device database, or a memory stand-in when the browser will not allow one. */
export async function openStorage(factory = globalThis.indexedDB, { timeoutMs = 4000 } = {}) {
  if (!factory) return memoryStorage('This browser has no database.');
  try {
    return idbStorage(await openDb(factory, timeoutMs));
  } catch (error) {
    return memoryStorage(String(error?.message || error));
  }
}
