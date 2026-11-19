import { it, expect } from 'vitest';
import { weekdayPatterns } from './insights.js';

// Thursday 19 November 2026, 3 pm local time.
const NOW = new Date(2026, 10, 19, 15).getTime();
const day = (daysAgo, hour = 11) => { const d = new Date(NOW); d.setDate(d.getDate() - daysAgo); d.setHours(hour, 0, 0, 0); return d.getTime(); };
const sale = (productId, daysAgo, qty) => ({ productId, qty, date: day(daysAgo) });

/** Four full weeks before today: `perDay(weekday)` units each day (weekday 0 = Monday). */
function fourWeeks(productId, perDay) {
  const out = [];
  for (let ago = 1; ago <= 28; ago++) out.push(sale(productId, ago, perDay((new Date(day(ago)).getDay() + 6) % 7)));
  return out;
}

it('finds the days of the week a product sells most, from the last four weeks', () => {
  const sales = fourWeeks('bread', (wd) => (wd >= 5 ? 30 : 10));

  const bread = weekdayPatterns(sales, NOW).bread;

  expect(bread.avg).toEqual([10, 10, 10, 10, 10, 30, 30]);
  expect(bread.peaks).toEqual([5, 6]);
  expect(bread.today).toBe(3); // Thursday
});

it('a product that sells the same every day has no busiest day', () => {
  expect(weekdayPatterns(fourWeeks('rice', () => 4), NOW).rice.peaks).toEqual([]);
});

it('today\'s sales so far and sales older than four weeks are left out', () => {
  const sales = [...fourWeeks('milk', () => 5), sale('milk', 0, 99), sale('milk', 29, 99)];

  expect(weekdayPatterns(sales, NOW).milk.avg).toEqual([5, 5, 5, 5, 5, 5, 5]);
});

it('a shop with only one week of sales averages over that week, not four', () => {
  const sales = [];
  for (let ago = 1; ago <= 7; ago++) sales.push(sale('eggs', ago, ago === 2 ? 12 : 6)); // Tuesday is busy

  const eggs = weekdayPatterns(sales, NOW).eggs;

  expect(eggs.avg).toEqual([6, 12, 6, 6, 6, 6, 6]);
  expect(eggs.peaks).toEqual([1]);
});
