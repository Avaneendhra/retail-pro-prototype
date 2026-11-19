import { it, expect } from 'vitest';
import {
  normalizePhone, distanceKm, visitsByPhone, loyalSuggestions, menuForLink,
  encodeOrder, decodeOrder, orderMessage, whatsappLink, newCustomerCode,
} from './customers.js';

const NOW = new Date(2026, 10, 19, 15).getTime();
const DAY = 86400000;

it('phone numbers are kept as the last 10 digits of an Indian mobile number', () => {
  expect(normalizePhone('+91 98765 43210')).toBe('9876543210');
  expect(normalizePhone('098765-43210')).toBe('9876543210');
  expect(normalizePhone('9876543210')).toBe('9876543210');
  expect(normalizePhone('12345')).toBe('');
  expect(normalizePhone('')).toBe('');
});

it('the distance between two places is worked out along the earth\'s surface', () => {
  // Charminar to Secunderabad railway station is about 8.5 km in a straight line.
  const km = distanceKm({ lat: 17.3616, lng: 78.4747 }, { lat: 17.4337, lng: 78.5016 });
  expect(km).toBeGreaterThan(8.3);
  expect(km).toBeLessThan(8.8);
  expect(distanceKm({ lat: 17.36, lng: 78.47 }, { lat: 17.36, lng: 78.47 })).toBe(0);
  expect(distanceKm(null, { lat: 1, lng: 1 })).toBe(null);
});

const bill = (phone, daysAgo, total = 100) => ({ id: `B${phone}${daysAgo}`, at: NOW - daysAgo * DAY, total, items: [], customer: phone ? { phone } : undefined });

it('counts each customer\'s bills and spending over the last 30 days', () => {
  const bills = [bill('9876543210', 1, 120), bill('9876543210', 5, 80), bill('9876543210', 40), bill('', 2), bill('9000000001', 3)];

  const visits = visitsByPhone(bills, NOW);

  expect(visits['9876543210']).toEqual({ visits: 2, spent: 200, last: NOW - DAY });
  expect(visits['9000000001'].visits).toBe(1);
  expect(Object.keys(visits)).toHaveLength(2);
});

it('suggests as loyal anyone with 4 or more bills in 30 days who is not loyal yet', () => {
  const bills = [1, 3, 8, 12].map((d) => bill('9876543210', d)).concat([1, 2, 3, 4].map((d) => bill('9111111111', d)), [1, 2].map((d) => bill('9222222222', d)));
  const customers = [{ id: 'C1', phone: '9111111111', name: 'Ravi', loyal: true }];

  expect(loyalSuggestions(customers, bills, NOW)).toEqual([{ phone: '9876543210', visits: 4, spent: 400, name: '' }]);
});

it('the order link carries the best-selling items in stock, at most 60', () => {
  const products = Array.from({ length: 70 }, (_, i) => ({ id: `P${i}`, name: `Item ${i}`, price: 10 + i, quantity: i === 3 ? 0 : 5 }));
  const stats = Object.fromEntries(products.map((p, i) => [p.id, { avg7: i }]));

  const menu = menuForLink(products, stats);

  expect(menu).toHaveLength(60);
  expect(menu[0]).toEqual(['P69', 'Item 69', 79]);
  expect(menu.some(([id]) => id === 'P3')).toBe(false);
});

it('an order link survives being written into a URL and read back', async () => {
  const order = { v: 1, shop: 'Lakshmi Stores', phone: '9876543210', name: 'Ravi', code: 'K7Q2M9XA', items: [['P1', 'Milk 500ml', 30], ['P2', 'Bread', 40]], at: { lat: 17.36, lng: 78.47 } };

  const text = await encodeOrder(order);

  expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(await decodeOrder(text)).toEqual(order);
  expect(await decodeOrder('not-a-real-order')).toBe(null);
});

it('the WhatsApp message lists the order, the total, the address and a map link', () => {
  const text = orderMessage({
    shop: 'Lakshmi Stores', name: 'Ravi', code: 'K7Q2M9XA',
    lines: [{ name: 'Milk 500ml', qty: 2, price: 30 }, { name: 'Bread', qty: 1, price: 40 }],
    address: 'Flat 4, Sai Residency', note: 'Ring twice', location: { lat: 17.36123, lng: 78.47456 }, km: 1.24,
  });

  expect(text).toContain('Milk 500ml × 2 = ₹60');
  expect(text).toContain('Bread × 1 = ₹40');
  expect(text).toContain('Total: ₹100');
  expect(text).toContain('Flat 4, Sai Residency');
  expect(text).toContain('Ring twice');
  expect(text).toContain('https://maps.google.com/?q=17.36123,78.47456');
  expect(text).toContain('1.2 km');
  expect(text).toContain('K7Q2M9XA');
});

it('a WhatsApp link goes to the number with India\'s country code', () => {
  expect(whatsappLink('9876543210', 'Hi there')).toBe('https://wa.me/919876543210?text=Hi%20there');
});

it('customer codes are 8 letters and digits that are easy to read', () => {
  const code = newCustomerCode();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  expect(newCustomerCode()).not.toBe(code);
});
