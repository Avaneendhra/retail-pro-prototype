import { it, expect } from 'vitest';
import { createProductList, normalizeCode } from './productList.js';

const DATA = {
  v: 1,
  imageBase: 'https://img.example/s/',
  subs: ['bath & hand wash', 'snacks & namkeen', 'dairy'],
  rows: [
    ['8904352005008', 'BIOTIQUE Anti-Ageing After-Bath Body Oil - Carrot Seed, 120 ml', 'BIOTIQUE', '', 136, 'personal', 0, '40120583_13-biotique.jpg'],
    ['04902430000000', 'Imported Thing 1 kg', 'Acme', '1 kg', 0, 'other', 1, ''],
    ['', 'Haldiram\'s Namkeen - Aloo Bhujia, 200 g', 'Haldiram\'s', '200 g', 55, 'snacks', 1, 'h.jpg'],
    ['', 'Haldiram\'s Namkeen - Aloo Bhujia, 1 kg', 'Haldiram\'s', '1 kg', 230, 'snacks', 1, ''],
    ['', 'Amul Butter - Pasteurised, 100 g', 'Amul', '100 g', 58, 'dairy', 2, ''],
  ],
};

it('finds a product by the scanned barcode, with its price and details', () => {
  const list = createProductList(DATA);

  expect(list.findByBarcode('8904352005008')).toEqual({
    barcode: '8904352005008',
    name: 'BIOTIQUE Anti-Ageing After-Bath Body Oil - Carrot Seed, 120 ml',
    brand: 'BIOTIQUE', size: '', price: 136, category: 'personal', subCategory: 'bath & hand wash',
    image: 'https://img.example/s/40120583_13-biotique.jpg', source: 'Product list',
  });
  expect(list.findByBarcode('8901262010016')).toBe(null);
  expect(list.size).toBe(5);
});

it('a 12-digit UPC and a 14-digit GTIN find the same product as its 13-digit code', () => {
  expect(normalizeCode('890435200500')).toBe('0890435200500');
  expect(normalizeCode('08904352005008')).toBe('8904352005008');
  expect(normalizeCode(' 8904352005008 ')).toBe('8904352005008');
  expect(createProductList(DATA).findByBarcode('08904352005008')?.price).toBe(136);
});

it('a product without a barcode is found by the name read from its label, the right pack size first', () => {
  const list = createProductList(DATA);

  expect(list.findByName('HALDIRAM\'S ALOO BHUJIA', '200g')).toMatchObject({ name: 'Haldiram\'s Namkeen - Aloo Bhujia, 200 g', price: 55, barcode: '' });
  expect(list.findByName('Haldirams Aloo Bhujia 1kg', '1kg')?.price).toBe(230);
  expect(list.findByName('Amul Butter', '')).toMatchObject({ price: 58, category: 'dairy' });
});

it('a name that only shares a word or two with a product finds nothing', () => {
  const list = createProductList(DATA);

  expect(list.findByName('Amul Cheese Slices', '')).toBe(null);
  expect(list.findByName('Butter', '')).toBe(null);
  expect(list.findByName('Haldiram Aloo Bhujia', '400g')).toBe(null);
  expect(list.findByName('', '')).toBe(null);
});

it('a single packet is never matched to a multipack, whose price is for several', () => {
  const list = createProductList({ ...DATA, rows: [
    ['', 'MAGGI 2-Minute Instant Noodles Masala, 70 g (Pack of 24)', 'MAGGI', '', 320, 'snacks', 1, ''],
    ['', 'Dettol Bathing Soap - Original, 4x125 g Multi Pack', 'Dettol', '', 184, 'personal', 0, ''],
    ['', 'MAGGI 2-Minute Instant Noodles - Masala, 70 g', 'MAGGI', '', 14, 'snacks', 1, ''],
  ] });

  expect(list.findByName('Maggi 2 Minute Masala Noodles', '70g')?.price).toBe(14);
  expect(list.findByName('Dettol Original Soap', '125g')).toBe(null);
  expect(list.findByName('Dettol Original Soap 4x125g multi pack', '125g')?.price).toBe(184);
});

const BRANDS = {
  ...DATA,
  rows: [
    ['8904004403770', 'Haldiram\'s Namkeen - Moong Dal, 1 kg Pouch', 'Haldiram\'s', '', 260, 'snacks', 1, ''],
    ['8904004400601', 'Haldiram\'s Aloo Bhujia, 400 g', 'Haldiram\'s', '', 110, 'snacks', 1, ''],
    ['', 'Haldiram  Moong Dal Namkeen, 200 g', 'Haldiram', '', 67, 'snacks', 1, 'md.jpg'],
    ['', 'Haldiram\'s Namkeen - Moong Dal, 3x150 g Multipack', 'Haldiram\'s', '3x150 g', 165, 'snacks', 1, ''],
    ['', 'Haldiram\'s Soan Papdi, 250 g', 'Haldiram\'s', '', 90, 'snacks', 1, ''],
    ['8901396323303', 'Dettol Liquid Handwash - Skincare, 200 ml', 'Dettol', '', 75, 'personal', 0, ''],
    ['', 'Dettol Original Soap, 125 g', 'Dettol', '', 45, 'personal', 0, ''],
  ],
};

it('the first digits of a barcode tell the brand, even when that exact barcode is not in the list', () => {
  const list = createProductList(BRANDS);

  expect(list.brandsOfBarcode('8904004424430')).toEqual(['Haldiram\'s']);
  expect(list.brandsOfBarcode('8901396999990')).toEqual(['Dettol']);
  expect(list.brandsOfBarcode('8906001200178')).toEqual([]);
});

it('a company that makes several brands gives all of them, the most common first', () => {
  const list = createProductList({ ...BRANDS, rows: [
    ...BRANDS.rows,
    ['8901396100004', 'Harpic Toilet Cleaner, 500 ml', 'Harpic', '', 99, 'household', 0, ''],
  ] });

  expect(list.brandsOfBarcode('8901396999990')).toEqual(['Dettol', 'Harpic']);
});

it('lists the brands\' products, those matching words read from the pack first, multipacks last', () => {
  const list = createProductList(BRANDS);

  const picks = list.productsOfBrands(['Haldiram\'s'], 'moong dal');

  expect(picks.map((p) => p.name)).toEqual([
    'Haldiram\'s Namkeen - Moong Dal, 1 kg Pouch',
    'Haldiram  Moong Dal Namkeen, 200 g',
    'Haldiram\'s Namkeen - Moong Dal, 3x150 g Multipack',
    'Haldiram\'s Aloo Bhujia, 400 g',
    'Haldiram\'s Soan Papdi, 250 g',
  ]);
  expect(picks[1]).toMatchObject({ price: 67, image: 'https://img.example/s/md.jpg' });
});

it('searches every product by the start of each word typed', () => {
  const list = createProductList(BRANDS);

  expect(list.search('moong').map((p) => p.price)).toEqual([260, 67, 165]);
  expect(list.search('dett hand').map((p) => p.name)).toEqual(['Dettol Liquid Handwash - Skincare, 200 ml']);
  expect(list.search('x')).toEqual([]);
});
