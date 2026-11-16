// Takes the rows a sync returned and folds them into the data on this device.
import { byCreation } from './ops.js';

const newestFirst = (key) => (a, b) => b[key] - a[key] || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/**
 * Replaces rows by id, adds new ones and removes those marked `deleted`.
 * Returns the same array when nothing changes, and keeps untouched rows as they were.
 */
function mergeRows(current, incoming, sort) {
  if (!incoming?.length) return current;
  const byId = new Map(incoming.map((row) => [row.id, row]));
  const next = [];
  for (const row of current) {
    const update = byId.get(row.id);
    if (!update) next.push(row);
    else if (!update.deleted) next.push(update);
    byId.delete(row.id);
  }
  for (const row of byId.values()) if (!row.deleted) next.push(row);
  return sort ? next.sort(sort) : next;
}

/** Drops bills older than `billsSince`. Bills are kept newest first, so this is a cut at the end. */
export function pruneBills(data, billsSince) {
  const { bills } = data;
  if (!bills.length || !(bills[bills.length - 1].at < billsSince)) return data;
  return { ...data, bills: bills.filter((bill) => bill.at >= billsSince) };
}

/**
 * changes: { products, bills, purchaseOrders, invoices } as returned by POST /api/sync.
 * Bills older than `billsSince` are not kept on the device (the server keeps them).
 */
export function mergeChanges(data, changes, { billsSince = 0 } = {}) {
  const products = mergeRows(data.products, changes.products, byCreation);
  const bills = mergeRows(data.bills, changes.bills, newestFirst('at'));
  const purchaseOrders = mergeRows(data.purchaseOrders, changes.purchaseOrders, newestFirst('createdAt'));
  const invoices = mergeRows(data.invoices, changes.invoices, newestFirst('at'));

  const unchanged = products === data.products && bills === data.bills
    && purchaseOrders === data.purchaseOrders && invoices === data.invoices;
  return pruneBills(unchanged ? data : { ...data, products, bills, purchaseOrders, invoices }, billsSince);
}
