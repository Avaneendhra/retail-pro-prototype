import React from 'react';
import { it, expect, beforeEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '../../i18n';
import { ToastProvider } from '../../context/ToastContext';
import { InventoryProvider } from '../../context/InventoryContext';
import { createEngine } from '../../store/engine';
import { memoryStorage } from '../../store/storage';
import Billing from './Billing';
import Bills from '../bills/Bills';

const T = Date.now();
const product = (id, name, code, category, price, quantity) => ({
  id, code, barcode: `89000000${id.slice(1)}`, name, names: {}, aliases: [], category, price, min: 2, coverDays: 7, quantity, needsReview: false, createdAt: T,
});
const seed = () => ({
  data: {
    products: [product('P1', 'Milk 500ml', 'ML', 'dairy', 30, 40), product('P2', 'Bread', 'BR', 'bakery', 40, 10), product('P3', 'Rice 1kg', 'RC', 'grocery', 60, 20)],
    bills: [], purchaseOrders: [], invoices: [], shop: { name: 'Sri Lakshmi Stores' },
  },
  outbox: [], cursor: 0, counters: { bill: 1025, po: 101, sku: 1017 }, device: { id: null, no: 0 },
});

let engine;
async function renderWith(ui) {
  let session = null;
  engine = createEngine({
    storage: memoryStorage(), seed, api: {}, deviceId: 'device-test', defer: () => {},
    sessionStore: { get: () => session, set: (next) => { session = next; } },
  });
  await engine.start();
  render(<MemoryRouter><ToastProvider><InventoryProvider engine={engine}>{ui}</InventoryProvider></ToastProvider></MemoryRouter>);
  return userEvent.setup();
}

const tile = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
const pay = (user) => user.click(screen.getByRole('button', { name: /Complete payment/ }));

beforeEach(() => localStorage.clear());

it('category chips narrow the products shown', async () => {
  const user = await renderWith(<Billing />);

  await user.click(screen.getByRole('button', { name: 'Bakery' }));

  expect(tile('Bread')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Milk 500ml/ })).toBe(null);
  await user.click(screen.getByRole('button', { name: 'All' }));
  expect(tile('Milk 500ml')).toBeInTheDocument();
});

it('typing a code and a quantity in the search box adds that many', async () => {
  const user = await renderWith(<Billing />);

  await user.type(screen.getByRole('combobox'), 'ML 3{Enter}');

  const bill = screen.getByRole('region', { name: 'Current bill' });
  expect(within(bill).getByText('Milk 500ml')).toBeInTheDocument();
  expect(within(bill).getByLabelText('Qty')).toHaveValue('3');
  expect(screen.getByRole('combobox')).toHaveValue('');
});

it('a discount comes off the total and is kept on the bill', async () => {
  const user = await renderWith(<Billing />);
  await user.click(tile('Rice 1kg'));
  await user.click(tile('Rice 1kg'));

  await user.click(screen.getByRole('button', { name: 'Add discount' }));
  await user.type(screen.getByLabelText('Discount'), '10');
  await user.click(screen.getByRole('button', { name: '%' }));
  await pay(user);

  const [bill] = engine.getSnapshot().data.bills;
  expect(bill).toMatchObject({ total: 108, discount: 12 });
  expect(within(screen.getByRole('dialog')).getByText(/₹108/)).toBeInTheDocument();
});

it('a discount can never be more than the bill', async () => {
  const user = await renderWith(<Billing />);
  await user.click(tile('Bread'));

  await user.click(screen.getByRole('button', { name: 'Add discount' }));
  await user.type(screen.getByLabelText('Discount'), '500');
  await pay(user);

  expect(engine.getSnapshot().data.bills[0]).toMatchObject({ total: 0, discount: 40 });
});

it('a bill can be held and resumed later', async () => {
  const user = await renderWith(<Billing />);
  await user.click(tile('Milk 500ml'));
  await user.click(tile('Bread'));

  await user.click(screen.getByRole('button', { name: 'Hold bill' }));
  const emptied = within(screen.getByRole('region', { name: 'Current bill' })).queryByText('Bread');
  await user.click(tile('Rice 1kg'));
  await user.click(screen.getByRole('button', { name: 'Held bills (1)' }));
  await user.click(screen.getByRole('button', { name: /Resume/ }));

  const bill = within(screen.getByRole('region', { name: 'Current bill' }));
  expect(emptied).toBe(null);
  expect(bill.getByText('Milk 500ml')).toBeInTheDocument();
  expect(bill.getByText('Bread')).toBeInTheDocument();
  expect(bill.queryByText('Rice 1kg')).toBe(null);
  expect(screen.getByRole('button', { name: 'Held bills (1)' })).toBeInTheDocument();
});

it('after paying, the receipt can be shared on WhatsApp', async () => {
  const user = await renderWith(<Billing />);
  await user.click(tile('Milk 500ml'));
  await pay(user);

  const link = within(screen.getByRole('dialog')).getByRole('link', { name: 'Share on WhatsApp' });
  const text = decodeURIComponent(link.getAttribute('href').split('text=')[1]);
  expect(text).toContain('Sri Lakshmi Stores');
  expect(text).toContain('Bill #1025');
  expect(text).toContain('Milk 500ml × 1');
  expect(text).toContain('₹30');
});

it('the bills page lists today\'s bills with totals by payment method', async () => {
  const user = await renderWith(<><Billing /><Bills /></>);
  await user.click(tile('Milk 500ml'));
  await pay(user);
  await user.click(screen.getByRole('button', { name: /Start next sale/ }));
  await user.click(tile('Bread'));
  await user.click(screen.getByRole('radio', { name: 'UPI' }));
  await pay(user);
  await user.click(screen.getByRole('button', { name: /Start next sale/ }));

  const summary = screen.getByRole('region', { name: 'Summary' });
  expect(within(summary).getByText('₹70')).toBeInTheDocument();
  expect(within(summary).getByText('Cash ₹30')).toBeInTheDocument();
  expect(within(summary).getByText('UPI ₹40')).toBeInTheDocument();
  const list = screen.getByRole('list', { name: 'Bills' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(2);

  await new Promise((resolve) => setTimeout(resolve, 120)); // the till moves focus back to its own search box after a sale
  await user.type(screen.getByRole('searchbox'), 'bread');
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  await user.click(within(list).getByRole('button', { name: /#1026/ }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText('Bread × 1')).toBeInTheDocument();
  expect(within(dialog).getByRole('link', { name: 'Share on WhatsApp' })).toBeInTheDocument();
});

it('sales figures count a discounted bill at what was paid', async () => {
  const user = await renderWith(<Bills />);

  act(() => { engine.dispatch('sale', { bill: { id: 'B1', billNo: '1', at: Date.now(), total: 50, discount: 10, payment: { method: 'cash' }, items: [{ productId: 'P1', name: 'Milk 500ml', qty: 2, price: 30, total: 60 }] } }); });

  expect(within(screen.getByRole('region', { name: 'Summary' })).getByText('₹50')).toBeInTheDocument();
  expect(user).toBeTruthy();
});
