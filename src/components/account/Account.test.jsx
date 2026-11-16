import React from 'react';
import { it, expect } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../i18n';
import { ToastProvider } from '../../context/ToastContext';
import { InventoryProvider } from '../../context/InventoryContext';
import { createEngine } from '../../store/engine';
import { ApiError } from '../../store/api';
import { memoryStorage } from '../../store/storage';
import AccountButton from './AccountButton';

const CODE = 'ABCD-EFGH-JKLM-NPQR';
const emptyShop = () => ({
  data: { products: [], bills: [], purchaseOrders: [], invoices: [], shop: { name: 'My Store' } },
  outbox: [], cursor: 0, counters: { bill: 1, po: 1, sku: 1 }, device: { id: null, no: 0 },
});

/** A stand-in server: enough of the API for the screens, with a switch for "no network". */
function fakeApi() {
  const state = { online: true, users: new Map(), members: [], current: null };
  const reach = () => { if (!state.online) throw new ApiError(0, 'network', 'Could not reach the server.'); };
  const session = (u) => {
    state.current = { user: { id: u.id, name: u.name, login: u.login, role: u.role }, shop: { id: 's1', name: u.shopName } };
    return { token: `token-${u.id}`, ...state.current, device: { id: 'device-test', no: 1, counters: {} } };
  };
  return {
    state,
    health: async () => { reach(); return { ok: true }; },
    signup: async (body) => {
      reach();
      if (state.users.has(body.login)) throw new ApiError(409, 'login_taken', 'taken');
      const user = { ...body, id: 'u1', role: 'owner' };
      state.users.set(body.login, user);
      state.members = [{ id: 'u1', name: body.name, login: body.login, role: 'owner', disabled: false, createdAt: 1 }];
      return { ...session(user), recoveryCode: CODE };
    },
    login: async (body) => {
      reach();
      const user = state.users.get(body.login);
      if (!user || user.authKey !== body.authKey) throw new ApiError(401, 'bad_credentials', 'no');
      return session(user);
    },
    recover: async () => { reach(); throw new ApiError(401, 'bad_credentials', 'no'); },
    changePassword: async () => { reach(); return { ok: true, token: 'token-new' }; },
    sync: async (token, body) => {
      reach();
      return {
        accepted: body.ops.map((op) => op.id), rejected: [], cursor: body.since, more: false,
        changes: { products: [], bills: [], purchaseOrders: [], invoices: [] },
        ...state.current, device: { id: 'device-test', no: 1, counters: {} },
      };
    },
    team: {
      list: async () => { reach(); return { members: state.members }; },
      add: async (token, body) => {
        reach();
        const member = { id: `u${state.members.length + 1}`, name: body.name, login: body.login, role: 'staff', disabled: false, createdAt: 2 };
        state.members = [...state.members, member];
        state.users.set(body.login, { ...body, id: member.id, role: 'staff', shopName: 'Sri Lakshmi Stores' });
        return { member };
      },
      update: async (token, id, body) => {
        reach();
        state.members = state.members.map((m) => (m.id === id ? { ...m, ...(body.disabled !== undefined ? { disabled: body.disabled } : {}) } : m));
        return { member: state.members.find((m) => m.id === id) };
      },
    },
  };
}

async function setup({ signedUp = false } = {}) {
  const api = fakeApi();
  let session = null;
  const engine = createEngine({
    storage: memoryStorage(), seed: emptyShop, api, deviceId: 'device-test', defer: () => {},
    sessionStore: { get: () => session, set: (next) => { session = next; } },
    deriveKey: async (login, password) => `${login}/${password}`,
  });
  await engine.start();
  if (signedUp) {
    await engine.signUp({ shopName: 'Sri Lakshmi Stores', name: 'Lakshmi', login: '9876543210', password: 'correct horse' });
    await engine.syncNow();
  }
  render(<ToastProvider><InventoryProvider engine={engine}><AccountButton /></InventoryProvider></ToastProvider>);
  return { api, engine, user: userEvent.setup() };
}

const open = async (user, name) => {
  await user.click(screen.getByRole('button', { name }));
  return screen.findByRole('dialog');
};

it('when the API cannot be reached the modal says cloud sync is not set up', async () => {
  const { api, user } = await setup();
  api.state.online = false;

  const dialog = await open(user, 'Sign in');

  expect(await within(dialog).findByText('Cloud sync is not set up')).toBeInTheDocument();
  expect(within(dialog).queryByLabelText('Password')).toBe(null);
});

it('the sign-in form reports a wrong password in words', async () => {
  const { user } = await setup();
  const dialog = await open(user, 'Sign in');

  await user.type(await within(dialog).findByLabelText('Phone number or email'), '98765 43210');
  await user.type(within(dialog).getByLabelText('Password'), 'wrong horse');
  await user.click(within(dialog).getByRole('button', { name: 'Sign in' }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent('That login and password do not match.');
});

it('a login that is not a phone number or email, or a short password, is explained before anything is sent', async () => {
  const { user } = await setup();
  const dialog = await open(user, 'Sign in');
  await user.click(await within(dialog).findByRole('tab', { name: 'Create account' }));

  await user.type(within(dialog).getByLabelText('Your name'), 'Lakshmi');
  await user.type(within(dialog).getByLabelText('Phone number or email'), 'lakshmi');
  await user.type(within(dialog).getByLabelText('Password'), 'short');
  await user.click(within(dialog).getByRole('button', { name: 'Create account' }));
  const first = within(dialog).getByRole('alert').textContent;
  await user.type(within(dialog).getByLabelText('Password'), 'er password');
  await user.click(within(dialog).getByRole('button', { name: 'Create account' }));

  expect(first).toBe('Use at least 8 characters for the password.');
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Enter a phone number or an email address.');
});

it('creating an account shows the recovery code and will not close until it is acknowledged', async () => {
  const { engine, user } = await setup();
  const dialog = await open(user, 'Sign in');
  await user.click(await within(dialog).findByRole('tab', { name: 'Create account' }));

  await user.clear(within(dialog).getByLabelText('Shop name'));
  await user.type(within(dialog).getByLabelText('Shop name'), 'Sri Lakshmi Stores');
  await user.type(within(dialog).getByLabelText('Your name'), 'Lakshmi');
  await user.type(within(dialog).getByLabelText('Phone number or email'), '98765 43210');
  await user.type(within(dialog).getByLabelText('Password'), 'correct horse');
  await user.click(within(dialog).getByRole('button', { name: 'Create account' }));

  const shown = await screen.findByRole('dialog', { name: 'Write down your recovery code' });
  expect(within(shown).getByText(CODE)).toBeInTheDocument();
  const done = within(shown).getByRole('button', { name: 'Done' });
  expect(done).toBeDisabled();
  await user.keyboard('{Escape}');
  expect(screen.getByText(CODE)).toBeInTheDocument();
  await user.click(within(shown).getByRole('checkbox', { name: 'I have written it down' }));
  await user.click(done);

  expect(screen.queryByText(CODE)).toBe(null);
  expect(engine.getSnapshot().mode).toBe('account');
  expect(engine.getSnapshot().account.shop.name).toBe('Sri Lakshmi Stores');
});

it('the account button says Synced after a sync', async () => {
  await setup({ signedUp: true });

  expect(screen.getByRole('button', { name: /Synced/ })).toBeInTheDocument();
});

it('the account button says Offline with the number of waiting changes', async () => {
  const { api, engine } = await setup({ signedUp: true });

  api.state.online = false;
  await act(async () => {
    engine.dispatch('shop.update', { name: 'One' });
    engine.dispatch('shop.update', { name: 'Two' });
    await engine.syncNow();
  });

  expect(screen.getByRole('button', { name: 'Offline · 2 waiting' })).toBeInTheDocument();
});

it('the owner sees the team list and can add a staff login; staff do not see it', async () => {
  const { api, engine, user } = await setup({ signedUp: true });
  const dialog = await open(user, /Synced/);

  expect(await within(dialog).findByText('Logins for your staff')).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText('Name'), 'Ravi');
  await user.type(within(dialog).getByLabelText('Phone number or email'), 'ravi@example.com');
  await user.type(within(dialog).getByLabelText('Password'), 'staff password');
  await user.click(within(dialog).getByRole('button', { name: 'Add' }));
  expect(await within(dialog).findByText('ravi@example.com')).toBeInTheDocument();
  expect(api.state.members.map((m) => m.name)).toEqual(['Lakshmi', 'Ravi']);

  await act(async () => {
    await engine.signOut();
    await engine.signIn({ login: 'ravi@example.com', password: 'staff password' });
    await engine.syncNow();
  });
  expect(screen.getByRole('dialog')).toHaveTextContent('Staff');
  expect(within(screen.getByRole('dialog')).queryByText('Logins for your staff')).toBe(null);
});

it('signing out asks first when changes are still waiting', async () => {
  const { api, engine, user } = await setup({ signedUp: true });
  api.state.online = false;
  await act(async () => {
    engine.dispatch('shop.update', { name: 'One' });
    await engine.syncNow();
  });
  const asked = [];
  window.confirm = (message) => { asked.push(message); return false; };

  const dialog = await open(user, /Offline/);
  await user.click(within(dialog).getByRole('button', { name: 'Sign out' }));

  expect(asked[0]).toMatch(/1 changes have not been sent yet/);
  expect(engine.getSnapshot().mode).toBe('account');
});
