import { it, expect, vi } from 'vitest';
import { createSupabaseAuth } from './supabase.js';

const fakeClient = () => ({ auth: { signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })) } });

it('Google sign-in stops with a clear error, instead of leaving the app, while Google is switched off', async () => {
  const client = fakeClient();
  const auth = createSupabaseAuth(client, () => 'https://app.test/', async () => ({ google: false, email: true }));

  await expect(auth.google()).rejects.toMatchObject({ code: 'provider_disabled' });
  expect(client.auth.signInWithOAuth).not.toHaveBeenCalled();
});

it('Google sign-in goes to Google when it is switched on, or when the settings cannot be read', async () => {
  const on = fakeClient();
  await createSupabaseAuth(on, () => 'https://app.test/', async () => ({ google: true })).google();
  expect(on.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'https://app.test/' } });

  const unknown = fakeClient();
  await createSupabaseAuth(unknown, () => 'https://app.test/', async () => { throw new Error('offline'); }).google();
  expect(unknown.auth.signInWithOAuth).toHaveBeenCalled();
});
