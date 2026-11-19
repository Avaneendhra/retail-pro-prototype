// The app's link to Supabase: sign-in (Google, email + password, phone + SMS code) and the
// stokd_* database functions that keep a shop's devices in step (see supabase/migrations).
//
// createSupabaseApi() gives the store engine the same shape it has always used
// (session, createShop, sync, team), so the engine itself does not know about Supabase.
import { ApiError } from './api.js';

// The project's address and its publishable key. Both are public by design: what a
// signed-in person may do is decided by the database functions, not by this key.
export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || 'https://doounmvonecvqjugfiop.supabase.co';
export const SUPABASE_KEY = import.meta.env?.VITE_SUPABASE_KEY || 'sb_publishable_OA60_xyY8GKN5mNxkLA6wA_4rwCS6Oj';

let shared = null;

/** The one Supabase client of the page. It keeps the sign-in in this browser and refreshes it. */
export async function supabaseClient() {
  if (!shared) {
    shared = import('@supabase/supabase-js').then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'stokd_supabase' },
    }));
  }
  return shared;
}

// Errors raised by the database functions, and the HTTP-like status the screens expect.
const STATUS = { unauthorized: 401, forbidden: 403, not_found: 404, invalid_input: 400, too_many_orders: 429, no_shop: 409, already_member: 409 };

/** Any Supabase failure as an ApiError with a `code` the screens turn into words; "offline" is status 0. */
export function toApiError(error) {
  const message = String(error?.message || error || '');
  if (Object.hasOwn(STATUS, message)) return new ApiError(STATUS[message], message, message);
  if (error?.name === 'AuthRetryableFetchError' || /failed to fetch|network|load failed|fetch failed/i.test(message)) {
    return new ApiError(0, 'network', 'Could not reach the server.');
  }
  if (error?.code === 'PGRST301' || /jwt expired|invalid jwt/i.test(message)) return new ApiError(401, 'unauthorized', 'Please sign in again.');
  const code = typeof error?.code === 'string' && error.code ? error.code : 'server_error';
  return new ApiError(Number(error?.status) || 400, code, message || 'Something went wrong.');
}

/** The store engine's server, made of Supabase database functions. `client` may be a promise. */
export function createSupabaseApi(clientOrPromise) {
  const client = () => Promise.resolve(clientOrPromise);
  const rpc = async (fn, args) => {
    let res;
    try {
      res = await (await client()).rpc(fn, args);
    } catch (error) {
      throw toApiError(error);
    }
    if (res.error) throw toApiError(res.error);
    return res.data;
  };
  const signedIn = async () => {
    const { data } = await (await client()).auth.getSession();
    if (!data?.session) throw new ApiError(401, 'unauthorized', 'Please sign in again.');
  };
  return {
    cloud: true,
    health: async () => ({ ok: true }),
    session: (body) => rpc('stokd_session', { p: body }),
    createShop: (body) => rpc('stokd_create_shop', { p: body }),
    sync: async (_token, body) => { await signedIn(); return rpc('stokd_sync', { p: body }); },
    team: {
      list: () => rpc('stokd_team_list'),
      add: (body) => rpc('stokd_team_add', { p: body }),
      update: (body) => rpc('stokd_team_update', { p: body }),
    },
    monthly: () => rpc('stokd_monthly'),
    publicMenu: (shop, code) => rpc('stokd_public_menu', { p_shop: shop, p_code: code }),
    publicOrder: (body) => rpc('stokd_public_order', { p: body }),
  };
}

/** Which sign-in methods the project has switched on, e.g. { google: false, email: true }. */
async function enabledProviders() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } });
  return (await res.json()).external || {};
}

/** Sign-in actions. Every failure is an ApiError; `appUrl` is where Supabase sends people back to. */
export function createSupabaseAuth(clientOrPromise, appUrl = () => `${window.location.origin}${window.location.pathname}`, providers = enabledProviders) {
  const client = () => Promise.resolve(clientOrPromise);
  const run = async (work) => {
    let res;
    try {
      res = await work(await client());
    } catch (error) {
      throw toApiError(error);
    }
    if (res?.error) throw toApiError(res.error);
    return res?.data;
  };
  const phone = (digits) => `+91${String(digits).replace(/\D/g, '').slice(-10)}`;
  return {
    session: async () => (await (await client()).auth.getSession()).data?.session || null,
    onChange: async (fn) => {
      const { data } = (await client()).auth.onAuthStateChange((event, session) => fn(event, session));
      return () => data.subscription.unsubscribe();
    },
    google: async () => {
      // Going to Google leaves the app; with Google off, Supabase would show only a raw error page.
      const on = await providers().then((p) => p.google !== false, () => true);
      if (!on) throw new ApiError(400, 'provider_disabled', 'Google sign-in is not switched on.');
      return run((c) => c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } }));
    },
    signInEmail: (email, password) => run((c) => c.auth.signInWithPassword({ email: email.trim(), password })),
    signUpEmail: async (email, password) => {
      const data = await run((c) => c.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: appUrl() } }));
      return { confirm: !data?.session };
    },
    sendPhoneCode: (digits) => run((c) => c.auth.signInWithOtp({ phone: phone(digits) })),
    verifyPhoneCode: (digits, token) => run((c) => c.auth.verifyOtp({ phone: phone(digits), token: String(token).trim(), type: 'sms' })),
    resetPassword: (email) => run((c) => c.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() })),
    setPassword: (password) => run((c) => c.auth.updateUser({ password })),
    signOut: async () => { try { await (await client()).auth.signOut(); } catch { /* signed out on this device anyway */ } },
  };
}
