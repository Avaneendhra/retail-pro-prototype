// Sales analysis for one shop: totals and growth, best sellers, best customers, payment mix,
// and sales by hour, weekday and day. Plain sums over the shop's bills, nothing hidden.
import { startOfDay } from './insights.js';

const DAY = 86400000;

/** A period ending now, and the one of the same length just before it. kind: '7' | '30' | '90' | 'month'. */
export function periodRange(kind, now = Date.now()) {
  if (kind === 'month') {
    const d = new Date(now);
    const from = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const prevFrom = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
    return { kind, from, to: now, prevFrom, prevTo: from };
  }
  const days = Number(kind) || 7;
  const from = startOfDay(days - 1, now);
  return { kind, from, to: now, prevFrom: from - days * DAY, prevTo: from };
}

const weekdayOf = (time) => (new Date(time).getDay() + 6) % 7; // 0 = Monday

/** bills: the shop's bills; customers: to put names to phone numbers; range: from periodRange(). */
export function salesReport(bills, customers, { from, to, prevFrom, prevTo }) {
  const inRange = bills.filter((b) => b.at >= from && b.at <= to);
  const total = inRange.reduce((s, b) => s + b.total, 0);
  const real = inRange.filter((b) => !b.seed); // the sample shop's daily summaries are sales, not bills
  const prevTotal = bills.filter((b) => b.at >= prevFrom && b.at < prevTo).reduce((s, b) => s + b.total, 0);

  const products = new Map();
  const people = new Map();
  const payments = new Map([['cash', 0], ['upi', 0], ['card', 0]]);
  const byHour = new Array(24).fill(0);
  const byWeekday = new Array(7).fill(0);
  const days = [];
  for (let t = startOfDay(0, from); t <= to; t = startOfDay(-1, t + DAY / 2)) days.push({ start: t, total: 0 });

  for (const b of inRange) {
    // A discount is spread over the bill's lines, so product figures add up to what was paid.
    const share = b.discount ? b.total / (b.total + b.discount) : 1;
    for (const item of b.items || []) {
      const p = products.get(item.productId) || { productId: item.productId, name: item.name, qty: 0, revenue: 0 };
      p.qty += item.qty;
      p.revenue += item.total * share;
      products.set(item.productId, p);
    }
    const phone = b.customer?.phone;
    if (phone) {
      const c = people.get(phone) || { phone, bills: 0, spent: 0 };
      c.bills += 1;
      c.spent += b.total;
      people.set(phone, c);
    }
    const method = b.payment?.method || 'cash';
    payments.set(method, (payments.get(method) || 0) + b.total);
    byHour[new Date(b.at).getHours()] += b.total;
    byWeekday[weekdayOf(b.at)] += b.total;
    const day = days.find((d) => d.start === startOfDay(0, b.at));
    if (day) day.total += b.total;
  }

  const names = new Map(customers.map((c) => [c.phone, c.name]));
  const paid = [...payments.values()].reduce((s, v) => s + v, 0);
  return {
    total,
    count: real.length,
    avg: real.length ? real.reduce((s, b) => s + b.total, 0) / real.length : 0,
    prevTotal,
    growthPct: prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null,
    topProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    topCustomers: [...people.values()].sort((a, b) => b.spent - a.spent).slice(0, 5).map((c) => ({ ...c, name: names.get(c.phone) || '' })),
    payments: [...payments.entries()].map(([method, value]) => ({ method, total: value, share: paid ? value / paid : 0 })),
    byHour,
    byWeekday,
    byDay: days,
  };
}
