import { it, expect } from 'vitest';
import en from './en.js';
import te from './te.js';
import hi from './hi.js';
import mr from './mr.js';

const keys = (object, prefix = '') => Object.entries(object).flatMap(([key, value]) =>
  (value && typeof value === 'object' ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`]));
const placeholders = (text) => (String(text).match(/\{\{\w+\}\}/g) || []).sort().join(',');
const flat = (object, prefix = '') => Object.fromEntries(Object.entries(object).flatMap(([key, value]) =>
  (value && typeof value === 'object' ? Object.entries(flat(value, `${prefix}${key}.`)) : [[`${prefix}${key}`, value]])));

it('all four languages have the same keys', () => {
  const expected = keys(en).sort();
  for (const [name, language] of Object.entries({ te, hi, mr })) {
    expect(keys(language).sort(), name).toEqual(expected);
  }
});

it('every translation keeps the same placeholders and is not empty', () => {
  const english = flat(en);
  for (const [name, language] of Object.entries({ te, hi, mr })) {
    for (const [key, value] of Object.entries(flat(language))) {
      expect(String(value).trim().length, `${name}.${key}`).toBeGreaterThan(0);
      expect(placeholders(value), `${name}.${key}`).toBe(placeholders(english[key]));
    }
  }
});
