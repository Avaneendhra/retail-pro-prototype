import { it, expect, vi } from 'vitest';
import { identifyProduct } from './identifyProduct.js';

const MILK = { id: 'P1', name: 'Milk 500ml', barcode: '8901262010016', price: 30 };
const FRAME = 'data:image/jpeg;base64,frame';

function deps(overrides = {}) {
  return {
    decodeImage: vi.fn(async () => null),
    lookup: vi.fn(async () => null),
    readLabel: vi.fn(async () => null),
    findByBarcode: (code) => (code === MILK.barcode ? MILK : null),
    byId: (id) => (id === MILK.id ? MILK : null),
    matchByName: () => null,
    ...overrides,
  };
}

it('the barcode is read from the photo before anything else', async () => {
  const order = [];
  const d = deps({
    decodeImage: vi.fn(async () => { order.push('barcode'); return { text: '8901725121228', format: 'EAN13' }; }),
    lookup: vi.fn(async () => { order.push('database'); return { name: 'Britannia Bread 400g', category: 'bakery', image: 'img.jpg', source: 'Open Food Facts' }; }),
    readLabel: vi.fn(async () => { order.push('label'); return { name: 'Bread', mrp: 40 }; }),
  });

  const draft = await identifyProduct({ dataUrl: FRAME }, d);

  expect(order[0]).toBe('barcode');
  expect(d.lookup).toHaveBeenCalledWith('8901725121228');
  expect(draft).toMatchObject({ barcode: '8901725121228', name: 'Britannia Bread 400g', category: 'bakery', price: 40 });
  expect(draft.fieldSources).toMatchObject({ barcode: 'barcode', name: 'database', price: 'label' });
});

it('what the barcode says wins over the label', async () => {
  const gs1 = '(01)08901725121228(11)260801(17)261101(10)B9(3922)4200';
  const d = deps({
    lookup: vi.fn(async () => ({ name: 'Britannia Bread 400g', category: 'bakery' })),
    readLabel: vi.fn(async () => ({ name: 'Bread', mrp: 40, mfgDate: '2026-07', expiryDate: '2026-10', batch: 'X1' })),
  });

  const draft = await identifyProduct({ barcode: gs1, format: 'DataMatrix', dataUrl: FRAME }, d);

  expect(draft).toMatchObject({ barcode: '8901725121228', price: 42, mfgDate: '2026-08-01', expiryDate: '2026-11-01', batch: 'B9' });
  expect(draft.fieldSources).toMatchObject({ price: 'barcode', mfgDate: 'barcode', expiryDate: 'barcode', batch: 'barcode' });
  expect(d.readLabel).not.toHaveBeenCalled();
});

it('the label only fills in what the barcode and the database did not give', async () => {
  const d = deps({ readLabel: vi.fn(async () => ({ name: 'Some Biscuit', mrp: 10, mfgDate: '2026-10', expiryDate: '2027-04', batch: 'K7' })) });

  const draft = await identifyProduct({ barcode: '(01)08906010400019(17)270101', dataUrl: FRAME }, d);

  expect(draft).toMatchObject({ barcode: '8906010400019', name: 'Some Biscuit', price: 10, mfgDate: '2026-10', expiryDate: '2027-01-01', batch: 'K7' });
  expect(draft.fieldSources).toMatchObject({ name: 'label', price: 'label', mfgDate: 'label', expiryDate: 'barcode', batch: 'label' });
});

it('a product already in stock is recognised by its barcode, with the dates of this pack', async () => {
  const d = deps({ readLabel: vi.fn(async () => ({ mrp: 30, mfgDate: '2026-11-10' })) });

  const draft = await identifyProduct({ barcode: '8901262010016', format: 'EAN13', dataUrl: FRAME }, d);

  expect(draft).toMatchObject({ productId: 'P1', barcode: '8901262010016', mfgDate: '2026-11-10' });
  expect(d.lookup).not.toHaveBeenCalled();
});

it('without a barcode the label is used, and the numbers printed under the bars count as a barcode', async () => {
  const d = deps({ readLabel: vi.fn(async () => ({ name: 'Milk', barcode: '8901262010016', mrp: 30 })) });

  const draft = await identifyProduct({ dataUrl: FRAME }, d);

  expect(draft).toMatchObject({ productId: 'P1', barcode: '8901262010016' });
  expect(draft.fieldSources.barcode).toBe('label');
});

it('a frame with neither a barcode nor a readable product gives nothing in the automatic loop', async () => {
  const d = deps({ readLabel: vi.fn(async () => ({ name: 'abc', mrp: 0 })) });

  expect(await identifyProduct({ dataUrl: FRAME, quiet: true }, d)).toBe(null);
});

it('a barcode the databases do not know still gives a product to fill in', async () => {
  const draft = await identifyProduct({ barcode: '8906001200099', format: 'EAN13' }, deps());

  expect(draft).toMatchObject({ barcode: '8906001200099', placeholder: true, name: '' });
});

it('a QR code that is not a product (a UPI payment code, a web link) is ignored', async () => {
  const d = deps({ readLabel: vi.fn(async () => null) });

  expect(await identifyProduct({ barcode: 'upi://pay?pa=shop@upi&pn=Shop', format: 'QRCode', quiet: true }, d)).toBe(null);
  expect(await identifyProduct({ barcode: 'https://example.com', format: 'QRCode', quiet: true }, d)).toBe(null);
  expect(d.lookup).not.toHaveBeenCalled();
});

it('a shop\'s own Code 128 label still counts as a barcode', async () => {
  const draft = await identifyProduct({ barcode: 'SKU-00412', format: 'Code128' }, deps());

  expect(draft).toMatchObject({ barcode: 'SKU-00412', placeholder: true });
});

it('when neither the barcode nor the label gives a price, the price is looked up online', async () => {
  const d = deps({
    lookup: vi.fn(async () => ({ name: 'Chupa Chups Lollipop', category: 'snacks' })),
    lookupPrice: vi.fn(async () => ({ price: 10, source: 'Open Prices' })),
  });

  const draft = await identifyProduct({ barcode: '8901393024661', format: 'EAN13' }, d);

  expect(d.lookupPrice).toHaveBeenCalledWith('8901393024661');
  expect(draft).toMatchObject({ price: 10, needsPrice: false });
  expect(draft.fieldSources.price).toBe('prices');
  expect(draft.sources).toContain('prices');
});

it('the MRP printed on the label wins over a price found online', async () => {
  const d = deps({
    lookup: vi.fn(async () => ({ name: 'Britannia Bread 400g', category: 'bakery' })),
    readLabel: vi.fn(async () => ({ name: 'Bread', mrp: 40 })),
    lookupPrice: vi.fn(async () => ({ price: 38, source: 'Open Prices' })),
  });

  const draft = await identifyProduct({ barcode: '8901725121228', format: 'EAN13', dataUrl: FRAME }, d);

  expect(draft.price).toBe(40);
  expect(draft.fieldSources.price).toBe('label');
});

it('a new product with no price found anywhere is marked as needing a price', async () => {
  const draft = await identifyProduct({ barcode: '8906001200099', format: 'EAN13' }, deps({ lookupPrice: vi.fn(async () => null) }));

  expect(draft).toMatchObject({ price: 0, needsPrice: true });
});

it('a product in stock that has no price yet also needs one', async () => {
  const FREE = { id: 'P2', name: 'Loose Rice', barcode: '8906010400019', price: 0 };
  const d = deps({ findByBarcode: (code) => (code === FREE.barcode ? FREE : null), byId: () => FREE });

  const draft = await identifyProduct({ barcode: FREE.barcode, format: 'EAN13' }, d);

  expect(draft).toMatchObject({ productId: 'P2', needsPrice: true });
  expect(await identifyProduct({ barcode: MILK.barcode, format: 'EAN13' }, deps())).toMatchObject({ productId: 'P1', needsPrice: false });
});

const LISTED = { barcode: '8904352005008', name: 'BIOTIQUE Body Oil - Carrot Seed, 120 ml', brand: 'BIOTIQUE', size: '', price: 136, category: 'personal', subCategory: 'bath & hand wash', image: 'oil.jpg', source: 'Product list' };

it('a barcode in the product list gives its name, price and details, without asking online', async () => {
  const d = deps({
    findListed: vi.fn(async (code) => (code === LISTED.barcode ? LISTED : null)),
    lookupPrice: vi.fn(async () => ({ price: 99 })),
  });

  const draft = await identifyProduct({ barcode: LISTED.barcode, format: 'EAN13' }, d);

  expect(draft).toMatchObject({ barcode: LISTED.barcode, name: LISTED.name, price: 136, category: 'personal', image: 'oil.jpg', needsPrice: false, placeholder: false });
  expect(draft.fieldSources).toMatchObject({ name: 'list', price: 'list', category: 'list' });
  expect(draft.sources).toEqual(['barcode', 'list']);
  expect(draft.confirm).toBeFalsy();
  expect(d.lookup).not.toHaveBeenCalled();
  expect(d.lookupPrice).not.toHaveBeenCalled();
});

it('your own products still come before the product list', async () => {
  const d = deps({ findListed: vi.fn(async () => ({ ...LISTED, barcode: MILK.barcode })) });

  expect(await identifyProduct({ barcode: MILK.barcode, format: 'EAN13' }, d)).toMatchObject({ productId: 'P1' });
  expect(d.findListed).not.toHaveBeenCalled();
});

it('a product without a barcode is found in the list by the name on its label, and is shown for checking', async () => {
  const d = deps({
    readLabel: vi.fn(async () => ({ name: 'Haldiram Aloo Bhujia', size: '200g', mrp: 0 })),
    findListedByName: vi.fn(async () => ({ ...LISTED, barcode: '', name: 'Haldiram Aloo Bhujia Namkeen, 200 g', price: 67, category: 'snacks' })),
  });

  const draft = await identifyProduct({ dataUrl: FRAME, quiet: true }, d);

  expect(d.findListedByName).toHaveBeenCalledWith('Haldiram Aloo Bhujia', '200g');
  expect(draft).toMatchObject({ name: 'Haldiram Aloo Bhujia Namkeen, 200 g', price: 67, category: 'snacks', confirm: true, needsPrice: false });
  expect(draft.fieldSources.price).toBe('list');
});
