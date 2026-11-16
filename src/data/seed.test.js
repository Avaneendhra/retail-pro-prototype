import { it, expect } from 'vitest';
import { seedDataset, SEED_PRODUCTS } from './seed.js';

const NOW = new Date(2026, 10, 16, 15, 30).getTime();
const DAY = 86_400_000;

it('the sample shop has every product in stock and numbering that continues after the samples', () => {
  const dataset = seedDataset(NOW);

  expect(dataset.data.products).toHaveLength(SEED_PRODUCTS.length);
  expect(dataset.data.products[0]).toEqual({
    id: 'P1001', code: 'ML', barcode: '8901262010016', category: 'dairy', price: 30, quantity: 40, min: 20, coverDays: 2,
    name: 'Milk 500ml', names: { te: 'పాలు 500ml', hi: 'दूध 500ml', mr: 'दूध 500ml' }, aliases: ['milk', 'doodh', 'paalu'], needsReview: false, createdAt: NOW,
  });
  expect(dataset.counters).toEqual({ bill: 1025, po: 101, sku: 1017 });
  expect(dataset.device).toEqual({ id: null, no: 0 });
  expect(dataset.outbox).toEqual([]);
  expect(dataset.data.shop).toEqual({ name: 'My Store' });
});

it('the sample history is one seed bill a day for four weeks, newest first, none in the future', () => {
  const { bills } = seedDataset(NOW).data;
  const startToday = new Date(2026, 10, 16).getTime();

  expect(bills).toHaveLength(28);
  expect(bills.every((b) => b.seed === true && b.at <= NOW && b.items.length > 0)).toBe(true);
  expect(bills.map((b) => b.at)).toEqual([...bills.map((b) => b.at)].sort((a, b) => b - a));
  expect(bills[0].at).toBeGreaterThanOrEqual(startToday);
  expect(bills.at(-1).at).toBeLessThan(startToday - 26 * DAY);
  expect(new Set(bills.map((b) => b.id)).size).toBe(28);
  for (const bill of bills) {
    expect(bill.total).toBe(bill.items.reduce((sum, item) => sum + item.total, 0));
    expect(bill.items.every((item) => Number.isInteger(item.qty) && item.qty >= 1)).toBe(true);
  }
});

it('the sample history is the same every time for the same moment', () => {
  expect(seedDataset(NOW)).toEqual(seedDataset(NOW));
});
