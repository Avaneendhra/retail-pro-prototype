import { it, expect } from 'vitest';
import { expiryInfo, readDateInput, dateInputText } from './expiry.js';

const NOW = new Date(2026, 10, 17, 12).getTime(); // 17 Nov 2026

it('says how many days are left, and whether that is soon', () => {
  expect(expiryInfo('2026-11-20', NOW)).toEqual({ status: 'soon', days: 3 });
  expect(expiryInfo('2026-11-17', NOW)).toEqual({ status: 'soon', days: 0 });
  expect(expiryInfo('2026-11-16', NOW)).toEqual({ status: 'expired', days: -1 });
  expect(expiryInfo('2027-06-01', NOW).status).toBe('ok');
  expect(expiryInfo('', NOW)).toBe(null);
});

it('a month-only expiry runs to the end of that month', () => {
  expect(expiryInfo('2026-11', NOW)).toEqual({ status: 'soon', days: 13 });
  expect(expiryInfo('2026-10', NOW).status).toBe('expired');
});

it('typed dates are read the Indian way and stored as ISO', () => {
  expect(readDateInput('15/08/2026')).toBe('2026-08-15');
  expect(readDateInput('08/2026')).toBe('2026-08');
  expect(readDateInput('Aug 2026')).toBe('2026-08');
  expect(readDateInput('2026-08-15')).toBe('2026-08-15');
  expect(readDateInput('')).toBe('');
  expect(readDateInput('soon')).toBe(null);
});

it('stored dates are shown the way they were typed', () => {
  expect(dateInputText('2026-08-15')).toBe('15/08/2026');
  expect(dateInputText('2026-08')).toBe('08/2026');
  expect(dateInputText('')).toBe('');
});
