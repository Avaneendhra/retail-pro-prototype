// Turns loose sales lines (one product, one quantity, one time) into one
// summary bill per day. Used for the sample history and for sales lines saved
// by older versions of the app whose bills are gone.

const MAX_ITEMS = 200;
const pad = (n) => String(n).padStart(2, '0');

export const dayKey = (time) => {
  const d = new Date(time);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};

/**
 * lines: [{ productId, productName, qty, price, total, date }]
 * Returns summary bills, newest first, marked `seed: true` so they count in
 * sales figures without being listed as bills.
 */
export function dayBills(lines) {
  const days = new Map();
  for (const line of lines) {
    if (!(line.qty > 0)) continue;
    const key = dayKey(line.date);
    const day = days.get(key) || { at: 0, items: new Map() };
    const itemKey = `${line.productId}|${line.price}`;
    const item = day.items.get(itemKey) || { productId: line.productId, name: line.productName || line.productId, qty: 0, price: line.price, total: 0 };
    item.qty += line.qty;
    item.total += line.total;
    day.items.set(itemKey, item);
    day.at = Math.max(day.at, line.date);
    days.set(key, day);
  }

  const bills = [];
  for (const [key, day] of days) {
    const items = [...day.items.values()];
    for (let start = 0, part = 1; start < items.length; start += MAX_ITEMS, part++) {
      const chunk = items.slice(start, start + MAX_ITEMS);
      const id = part === 1 ? `H${key}` : `H${key}-${part}`;
      bills.push({
        id, billNo: id, at: day.at, total: chunk.reduce((sum, item) => sum + item.total, 0),
        payment: { method: 'cash' }, items: chunk, seed: true,
      });
    }
  }
  return bills.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
}
