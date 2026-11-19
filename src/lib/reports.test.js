import { it, expect } from 'vitest';
import { periodRange, salesReport } from './reports.js';

const NOW = new Date(2026, 10, 19, 15).getTime(); // Thursday 19 November 2026, 3 pm
const at = (daysAgo, hour) => { const d = new Date(NOW); d.setDate(d.getDate() - daysAgo); d.setHours(hour, 0, 0, 0); return d.getTime(); };
const line = (productId, name, qty, price) => ({ productId, name, qty, price, total: qty * price });
const bill = (id, when, items, { method = 'cash', phone, discount = 0, seed } = {}) => {
  const sum = items.reduce((s, i) => s + i.total, 0);
  return { id, at: when, total: sum - discount, items, payment: { method }, ...(discount ? { discount } : {}), ...(phone ? { customer: { phone } } : {}), ...(seed ? { seed: true } : {}) };
};

it('the periods end now and the previous period is the same length just before', () => {
  const week = periodRange('7', NOW);
  expect(new Date(week.from).getDate()).toBe(13);
  expect(week.to).toBe(NOW);
  expect(week.prevTo).toBe(week.from);
  expect(week.from - week.prevFrom).toBe(7 * 86400000);

  const month = periodRange('month', NOW);
  expect(new Date(month.from)).toEqual(new Date(2026, 10, 1));
  expect(new Date(month.prevFrom)).toEqual(new Date(2026, 9, 1));
});

it('totals, average bill and growth compare the period with the one before', () => {
  const bills = [
    bill('B1', at(0, 10), [line('P1', 'Milk', 2, 30)]),
    bill('B2', at(1, 18), [line('P2', 'Bread', 1, 40)], { method: 'upi' }),
    bill('B0', at(9, 11), [line('P1', 'Milk', 1, 30)]),
  ];

  const r = salesReport(bills, [], periodRange('7', NOW));

  expect(r).toMatchObject({ total: 100, count: 2, avg: 50, prevTotal: 30 });
  expect(Math.round(r.growthPct)).toBe(233);
  expect(salesReport([], [], periodRange('7', NOW)).growthPct).toBe(null);
});

it('best sellers, best customers and the payment mix, with discounts spread over the lines', () => {
  const bills = [
    bill('B1', at(0, 10), [line('P1', 'Milk', 4, 30), line('P2', 'Bread', 1, 40)], { phone: '9111111111', discount: 16 }),
    bill('B2', at(2, 19), [line('P2', 'Bread', 3, 40)], { method: 'upi', phone: '9111111111' }),
    bill('B3', at(3, 19), [line('P1', 'Milk', 1, 30)], { method: 'card', phone: '9222222222' }),
  ];
  const customers = [{ phone: '9111111111', name: 'Ravi' }];

  const r = salesReport(bills, customers, periodRange('7', NOW));

  expect(r.topProducts.map((p) => [p.name, p.qty, Math.round(p.revenue)])).toEqual([['Bread', 4, 156], ['Milk', 5, 138]]);
  expect(r.topCustomers).toEqual([{ phone: '9111111111', name: 'Ravi', bills: 2, spent: 264 }, { phone: '9222222222', name: '', bills: 1, spent: 30 }]);
  expect(r.payments).toEqual([
    { method: 'cash', total: 144, share: 144 / 294 },
    { method: 'upi', total: 120, share: 120 / 294 },
    { method: 'card', total: 30, share: 30 / 294 },
  ]);
});

it('sales by hour, by weekday and by day', () => {
  const bills = [bill('B1', at(0, 10), [line('P1', 'Milk', 2, 30)]), bill('B2', at(1, 18), [line('P1', 'Milk', 1, 30)])];

  const r = salesReport(bills, [], periodRange('7', NOW));

  expect(r.byHour[10]).toBe(60);
  expect(r.byHour[18]).toBe(30);
  expect(r.byWeekday).toEqual([0, 0, 30, 60, 0, 0, 0]); // Wednesday, Thursday
  expect(r.byDay).toHaveLength(7);
  expect(r.byDay[6]).toMatchObject({ total: 60 });
});

it('the daily summaries of the sample shop count in sales but not as bills', () => {
  const r = salesReport([bill('S1', at(1, 12), [line('P1', 'Milk', 10, 30)], { seed: true })], [], periodRange('7', NOW));
  expect(r).toMatchObject({ total: 300, count: 0, avg: 0 });
});
