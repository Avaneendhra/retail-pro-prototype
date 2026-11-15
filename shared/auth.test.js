import { describe, it, expect } from 'vitest';
import { normalizeLogin, deriveAuthKey } from './auth.js';

describe('normalizeLogin', () => {
  it('treats "+91 98765 43210", "09876543210" and "9876543210" as the same login', () => {
    expect(normalizeLogin('+91 98765 43210')).toBe('9876543210');
    expect(normalizeLogin('09876543210')).toBe('9876543210');
    expect(normalizeLogin('98765-43210')).toBe('9876543210');
    expect(normalizeLogin('9876543210')).toBe('9876543210');
  });

  it('lowercases and trims emails', () => {
    expect(normalizeLogin('  Lakshmi@Example.COM ')).toBe('lakshmi@example.com');
  });

  it('rejects things that are neither a phone number nor an email', () => {
    expect(normalizeLogin('abc')).toBeNull();
    expect(normalizeLogin('12345')).toBeNull();
    expect(normalizeLogin('a@b')).toBeNull();
    expect(normalizeLogin('lakshmi @example.com')).toBeNull();
    expect(normalizeLogin('')).toBeNull();
    expect(normalizeLogin(undefined)).toBeNull();
  });
});

describe('deriveAuthKey', () => {
  it('gives the same 43-character key for the same login and password', async () => {
    const a = await deriveAuthKey('9876543210', 'correct horse', 1000);
    const b = await deriveAuthKey('9876543210', 'correct horse', 1000);

    expect(a).toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('gives a different key for a different login or password', async () => {
    const base = await deriveAuthKey('9876543210', 'correct horse', 1000);

    expect(await deriveAuthKey('9876543211', 'correct horse', 1000)).not.toBe(base);
    expect(await deriveAuthKey('9876543210', 'correct horsE', 1000)).not.toBe(base);
  });

  it('matches a known PBKDF2-HMAC-SHA256 vector', async () => {
    // salt is "stokd:v1:" + login; checked against Node's crypto.pbkdf2Sync
    const { pbkdf2Sync } = await import('node:crypto');
    const expected = pbkdf2Sync('correct horse', 'stokd:v1:a@b.co', 1000, 32, 'sha256').toString('base64url');

    expect(await deriveAuthKey('a@b.co', 'correct horse', 1000)).toBe(expected);
  });
});
