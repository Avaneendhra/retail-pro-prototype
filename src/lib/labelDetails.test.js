import { it, expect } from 'vitest';
import { parseLabelDetails } from './labelDetails.js';

it('reads MRP, month-and-year dates and the batch number', () => {
  const text = 'AMUL BUTTER\nNet Wt. 100 g\nMRP Rs. 58.00 (Incl. of all taxes)\nMfd: 08/2026\nUse by: 02/2027\nBatch No. AB123';

  expect(parseLabelDetails(text)).toEqual({ mrp: 58, mfgDate: '2026-08', expiryDate: '2027-02', batch: 'AB123' });
});

it('reads full dates written in different ways', () => {
  expect(parseLabelDetails('PKD 12 AUG 2026  EXP 11.02.27')).toMatchObject({ mfgDate: '2026-08-12', expiryDate: '2027-02-11' });
  expect(parseLabelDetails('Date of Mfg. 05-Nov-26\nBest Before 04/05/2027')).toMatchObject({ mfgDate: '2026-11-05', expiryDate: '2027-05-04' });
  expect(parseLabelDetails('MFG DATE: SEP 2026')).toMatchObject({ mfgDate: '2026-09' });
});

it('works out the expiry from "best before N months from manufacture"', () => {
  expect(parseLabelDetails('Mfd. 03/2026\nBest before 9 months from manufacture')).toMatchObject({ mfgDate: '2026-03', expiryDate: '2026-12' });
  expect(parseLabelDetails('PKD 15/01/2026 BEST BEFORE 180 DAYS FROM PACKAGING')).toMatchObject({ mfgDate: '2026-01-15', expiryDate: '2026-07-14' });
});

it('leaves out what is not on the label', () => {
  expect(parseLabelDetails('Parle-G Biscuits 250 g')).toEqual({ mrp: 0 });
  expect(parseLabelDetails('Mfd: 31/02/2026')).toEqual({ mrp: 0 });
});
