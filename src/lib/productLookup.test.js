import { it, expect, vi, afterEach } from 'vitest';
import { lookupPrice, lookupBarcode } from './productLookup.js';

afterEach(() => vi.unstubAllGlobals());

const reply = (body) => ({ ok: true, json: async () => body });

it('takes the printed price (before discount) of the latest Indian price report', async () => {
  const fetch = vi.fn(async () => reply({ items: [
    { price: 46, price_without_discount: 50, currency: 'INR', date: '2026-11-16' },
    { price: 48, currency: 'INR', date: '2026-10-01' },
  ] }));
  vi.stubGlobal('fetch', fetch);

  expect(await lookupPrice('8901393024661')).toEqual({ price: 50, source: 'Open Prices', date: '2026-11-16' });
  expect(fetch.mock.calls[0][0]).toContain('product_code=8901393024661');
  expect(fetch.mock.calls[0][0]).toContain('currency=INR');
});

it('gives nothing when no one has reported a price', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply({ items: [] })));
  expect(await lookupPrice('8906001200099')).toBe(null);
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
  expect(await lookupPrice('8906001200099')).toBe(null);
});

it('asks all the product databases at once and keeps the first that knows the barcode', async () => {
  const fetch = vi.fn(async (url) => (url.includes('openbeautyfacts')
    ? reply({ status: 1, product: { product_name: 'Neem Face Wash', brands: 'Himalaya', quantity: '100 ml' } })
    : reply({ status: 0 })));
  vi.stubGlobal('fetch', fetch);

  const found = await lookupBarcode('8901138511555');

  expect(fetch).toHaveBeenCalledTimes(3);
  expect(found).toMatchObject({ source: 'Open Beauty Facts', name: 'Himalaya Neem Face Wash 100ml', category: 'personal' });
});
