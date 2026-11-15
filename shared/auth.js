// Shared by the web app, the API and the tests. Uses only Web Crypto, so it
// runs in browsers, Node and Cloudflare Workers.

const encoder = new TextEncoder();

export const KDF_ITERATIONS = 600_000;

export function toBase64Url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Turns what a person types into the login we store: a lowercased email, or a
 * phone number reduced to its digits (Indian country code and leading 0 dropped).
 * Returns null when it is neither.
 */
export function normalizeLogin(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  if (text.includes('@')) {
    return text.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : null;
  }

  if (!/^[+\d][\d\s\-().]*$/.test(text)) return null;
  let digits = text.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(-10);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/**
 * Stretches a password in the browser before it is sent. The server only ever
 * sees this key, never the password. `login` must already be normalised.
 */
export async function deriveAuthKey(login, password, iterations = KDF_ITERATIONS) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(`stokd:v1:${login}`), iterations },
    material,
    256,
  );
  return toBase64Url(bits);
}
