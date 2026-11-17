import { it, expect } from 'vitest';
import { parseBarcode } from './barcodeData.js';

const GS = '\x1d';

it('an ordinary retail barcode carries only the product number', () => {
  expect(parseBarcode('8901262010016', 'EAN13')).toEqual({ code: '8901262010016', gtin: '08901262010016', kind: 'retail' });
});

it('reads product number, dates, batch and price from a GS1 DataMatrix', () => {
  const raw = `0108901262010016${'11'}260815${'17'}270214${'10'}AB123${GS}39224500`;

  expect(parseBarcode(raw, 'DataMatrix')).toEqual({
    kind: 'gs1', code: '8901262010016', gtin: '08901262010016',
    mfgDate: '2026-08-15', expiryDate: '2027-02-14', batch: 'AB123', price: 45,
  });
});

it('reads the bracketed form the scanner may return', () => {
  expect(parseBarcode('(01)08901262010016(15)271100(10)L-77(11)260500', 'DataBarExp')).toEqual({
    kind: 'gs1', code: '8901262010016', gtin: '08901262010016', expiryDate: '2027-11-30', batch: 'L-77', mfgDate: '2026-05-31',
  });
});

it('a day of 00 means the end of that month', () => {
  expect(parseBarcode('(01)08901262010016(17)280200').expiryDate).toBe('2028-02-29');
});

it('reads a GS1 QR code web link', () => {
  expect(parseBarcode('https://id.gs1.org/01/08901262010016/10/B42?17=270630&3922=12550', 'QRCode')).toEqual({
    kind: 'gs1', code: '8901262010016', gtin: '08901262010016', batch: 'B42', expiryDate: '2027-06-30', price: 125.5,
  });
});

it('also reads the packing date and the price with a currency code', () => {
  expect(parseBarcode(`010890126201001613261101${GS}3932356${'09900'}`)).toMatchObject({ mfgDate: '2026-11-01', price: 99 });
});

it('keeps a 14-digit number that is not a retail code as it is', () => {
  expect(parseBarcode('(01)18901262010013').code).toBe('18901262010013');
});

it('anything else is kept as plain text', () => {
  expect(parseBarcode('SHELF-A12', 'Code128')).toEqual({ code: 'SHELF-A12', kind: 'other' });
  expect(parseBarcode('https://example.com/menu', 'QRCode')).toEqual({ code: 'https://example.com/menu', kind: 'other' });
});

it('a damaged GS1 code is not mistaken for dates', () => {
  expect(parseBarcode('(01)0890126201(17)99')).toEqual({ code: '(01)0890126201(17)99', kind: 'other' });
  expect(parseBarcode('(01)08901262010016(17)261345').expiryDate).toBeUndefined();
});

it('accepts the separator written out as <GS>, as some readers report it', () => {
  expect(parseBarcode(']d201089012620100161726110110B9<GS>39224200', 'DataMatrix')).toMatchObject({ code: '8901262010016', expiryDate: '2026-11-01', batch: 'B9', price: 42 });
});
