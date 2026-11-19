import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../i18n';
import { ToastProvider } from '../../context/ToastContext';
import { InventoryProvider } from '../../context/InventoryContext';
import { createEngine } from '../../store/engine';
import { ApiError } from '../../store/api';
import { memoryStorage } from '../../store/storage';
import AccountButton from './AccountButton';

const emptyShop = () => ({
  data: { products: [], bills: [], purchaseOrders: [], invoices: [], shop: { name: 'My Store' } },
  outbox: [], cursor: 0, counters: { bill: 1, po: 1, sku: 1 }, device: { id: null, no: 0 },
});

/** Supabase as the screens see it: sign-in actions, and the shop functions behind the engine. */
function fakeCloud({ hasShop = false } = {}) {
  const state = { signedIn: false, shop: hasShop ? { id: 's1', name: 'Sri Lakshmi Stores' } : null, members: [] };
  const session = () => ({
    user: { id: 'u1', name: 'Lakshmi', login: 'lakshmi@example.com', role: 'owner' }, shop: state.shop, device: { id: 'device-test', no: 1, counters: {} },
  });
  const api = {
    cloud: true,
    health: async () => ({ ok: true }),
    session: async () => (state.shop ? session() : { needsShop: true, logins: ['lakshmi@example.com'] }),
    createShop: async (body) => { state.shop = { id: 's1', name: body.shopName }; return session(); },
    sync: async (_t, body) => ({
      accepted: body.ops.map((o) => o.id), rejected: [], cursor: 0, more: false,
      changes: { products: [], bills: [], purchaseOrders: [], invoices: [] }, ...session(),
    }),
    team: {
      list: async () => [{ login: 'lakshmi@example.com', name: 'Lakshmi', role: 'owner', disabled: false, joined: true }, ...state.members],
      add: async (body) => { const m = { login: body.login.toLowerCase(), name: body.name, role: 'staff', disabled: false, joined: false }; state.members.push(m); return m; },
      update: async () => ({}),
    },
    monthly: async () => [],
  };
  const auth = {
    session: async () => (state.signedIn ? { access_token: 't' } : null),
    onChange: async () => () => {},
    google: vi.fn(async () => { throw new ApiError(400, 'validation_failed', 'Unsupported provider: provider is not enabled'); }),
    signInEmail: vi.fn(async (email, password) => {
      if (password !== 'correct horse') throw new ApiError(400, 'invalid_credentials', 'Invalid login credentials');
      state.signedIn = true;
    }),
    signUpEmail: vi.fn(async () => ({ confirm: true })),
    sendPhoneCode: vi.fn(async () => { throw new ApiError(400, 'phone_provider_disabled', 'Unsupported phone provider'); }),
    verifyPhoneCode: vi.fn(),
    resetPassword: vi.fn(async () => {}),
    setPassword: vi.fn(async () => {}),
    signOut: vi.fn(async () => { state.signedIn = false; }),
  };
  return { state, api, auth };
}

async function setup(options) {
  const cloud = fakeCloud(options);
  let box = null;
  const engine = createEngine({
    storage: memoryStorage(), seed: emptyShop, api: cloud.api, deviceId: 'device-test', defer: () => {},
    sessionStore: { get: () => box, set: (next) => { box = next; } },
  });
  await engine.start();
  render(<ToastProvider><InventoryProvider engine={engine} cloud={{ api: cloud.api, auth: cloud.auth }}><AccountButton /></InventoryProvider></ToastProvider>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  return { ...cloud, engine, user, dialog: await screen.findByRole('dialog') };
}

it('a first email sign-in asks for the shop, then opens it on this device', async () => {
  const { dialog, user, engine, auth } = await setup();

  expect(within(dialog).getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText('Email address'), 'lakshmi@example.com');
  await user.type(within(dialog).getByLabelText('Password'), 'wrong one');
  await user.click(within(dialog).getByRole('button', { name: 'Sign in' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('That email and password do not match.');

  await user.clear(within(dialog).getByLabelText('Password'));
  await user.type(within(dialog).getByLabelText('Password'), 'correct horse');
  await user.click(within(dialog).getByRole('button', { name: 'Sign in' }));
  const create = await screen.findByRole('dialog', { name: 'Create your shop' });
  expect(create).toHaveTextContent('lakshmi@example.com');
  await user.type(within(create).getByLabelText('Shop name'), 'Sri Lakshmi Stores');
  await user.type(within(create).getByLabelText('Your name'), 'Lakshmi');
  await user.click(within(create).getByRole('button', { name: 'Create shop' }));

  expect(await screen.findByText('Sri Lakshmi Stores')).toBeInTheDocument();
  expect(engine.getSnapshot()).toMatchObject({ mode: 'account', account: { shop: { name: 'Sri Lakshmi Stores' } } });
  expect(auth.signInEmail).toHaveBeenLastCalledWith('lakshmi@example.com', 'correct horse');
});

it('signing in to an account that already has a shop opens it straight away', async () => {
  const { dialog, user, engine } = await setup({ hasShop: true });

  await user.type(within(dialog).getByLabelText('Email address'), 'lakshmi@example.com');
  await user.type(within(dialog).getByLabelText('Password'), 'correct horse');
  await user.click(within(dialog).getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByText('Sri Lakshmi Stores')).toBeInTheDocument();
  expect(engine.getSnapshot().mode).toBe('account');
});

it('creating an email account asks to confirm the email first', async () => {
  const { dialog, user, auth } = await setup();

  await user.click(within(dialog).getByRole('button', { name: 'New here? Create an account' }));
  await user.type(within(dialog).getByLabelText('Email address'), 'new@example.com');
  await user.type(within(dialog).getByLabelText('Password'), 'long enough');
  await user.click(within(dialog).getByRole('button', { name: 'Create account' }));

  expect(await within(dialog).findByRole('status')).toHaveTextContent('open the link sent to new@example.com');
  expect(auth.signUpEmail).toHaveBeenCalledWith('new@example.com', 'long enough');
});

it('Google and SMS say plainly when they are not switched on yet', async () => {
  const { dialog, user } = await setup();

  await user.click(within(dialog).getByRole('button', { name: 'Continue with Google' }));
  expect(await within(dialog).findByText('Google sign-in is not switched on yet. Use email for now.')).toBeInTheDocument();

  await user.click(within(dialog).getByRole('tab', { name: 'Phone' }));
  await user.type(within(dialog).getByLabelText('Mobile number'), '98765 43210');
  await user.click(within(dialog).getByRole('button', { name: 'Send code' }));
  expect(await within(dialog).findByText('SMS codes are not switched on for this shop app yet. Use Google or email.')).toBeInTheDocument();
});

it('the owner adds staff by email and sees them as invited', async () => {
  const { dialog, user } = await setup({ hasShop: true });
  await user.type(within(dialog).getByLabelText('Email address'), 'lakshmi@example.com');
  await user.type(within(dialog).getByLabelText('Password'), 'correct horse');
  await user.click(within(dialog).getByRole('button', { name: 'Sign in' }));
  await screen.findByText('Sri Lakshmi Stores');

  await user.type(screen.getByLabelText('Name'), 'Ravi');
  await user.type(screen.getByLabelText('Email or mobile number'), 'Ravi@Example.com');
  await user.click(screen.getByRole('button', { name: 'Add' }));

  expect(await screen.findByText(/ravi@example.com · Staff · invited/)).toBeInTheDocument();
});
