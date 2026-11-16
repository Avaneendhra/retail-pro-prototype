import { it, expect } from 'vitest';
import { deviceCode, billNo, billId, productId, poNo, poId } from './ids.js';

it('device 1 is A, 26 is Z, 27 is AA', () => {
  expect([1, 2, 26, 27, 52, 53, 702, 703].map(deviceCode)).toEqual(['A', 'B', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA']);
  expect(deviceCode(0)).toBe('');
  expect(deviceCode(undefined)).toBe('');
});

it('local bills are numbered 1025, account bills A1025', () => {
  expect(billNo('', 1025)).toBe('1025');
  expect(billId('', 1025)).toBe('B1025');
  expect(billNo('A', 1025)).toBe('A1025');
  expect(billId('A', 1025)).toBe('BA1025');
});

it('products and orders follow the same pattern', () => {
  expect(productId('', 1017)).toBe('P1017');
  expect(productId('B', 3)).toBe('PB3');
  expect(poNo('', 101)).toBe('101');
  expect(poId('', 101)).toBe('PO101');
  expect(poNo('C', 7)).toBe('C7');
  expect(poId('C', 7)).toBe('POC7');
});
