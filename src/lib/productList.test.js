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
