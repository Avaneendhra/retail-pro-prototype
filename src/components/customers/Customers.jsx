import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccount, useInventory } from '../../context/InventoryContext';
import { useToast } from '../../context/ToastContext';
import { inr, fmtDate, fmtTime } from '../../lib/format';
import {
  distanceKm, encodeOrder, loyalSuggestions, menuForLink, normalizePhone, orderPageUrl, visitsByPhone, whatsappLink,
} from '../../lib/customers';
import PageHeader from '../layout/PageHeader';

const RADII = [1, 2, 3, 5, 10];
const contactsSupported = () => typeof navigator !== 'undefined' && 'contacts' in navigator && typeof navigator.contacts?.select === 'function';
const appAddress = () => `${window.location.origin}${window.location.pathname}`;
const apiAddress = () => import.meta.env?.VITE_API_URL || window.location.origin;

/** Where the shop is and its WhatsApp number: the number is needed before order links can be sent. */
function DeliverySettings() {
  const { t } = useTranslation();
  const { shop, setShopDelivery } = useInventory();
  const { showToast } = useToast();
  const [phone, setPhone] = useState(shop.phone || '');
  const [locating, setLocating] = useState(false);
  const phoneOk = normalizePhone(phone);

  const savePhone = () => {
    if (!phoneOk) { showToast(t('customers.errPhone'), 'error'); return; }
    setShopDelivery({ phone: phoneOk });
    showToast(t('customers.saved'), 'success');
  };

  const locate = () => {
    if (!navigator.geolocation) { showToast(t('customers.errLocation'), 'error'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setShopDelivery({ location: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
        showToast(t('customers.locationSaved'), 'success');
      },
      () => { setLocating(false); showToast(t('customers.errLocation'), 'error'); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <section className="card p-6 mb-4" aria-labelledby="delivery-settings">
      <h2 id="delivery-settings" className="eyebrow">{t('customers.settings')}</h2>
      <div className="grid gap-5 mt-4 md:grid-cols-3">
        <div>
          <label className="field-label" htmlFor="shop-phone">{t('customers.shopPhone')}</label>
          <div className="flex gap-2">
            <input id="shop-phone" className="form-input" inputMode="tel" value={phone} placeholder="98765 43210" onChange={(e) => setPhone(e.target.value)} />
            <button className="btn btn-secondary" onClick={savePhone} disabled={!phone || phoneOk === (shop.phone || '')}>{t('common.save')}</button>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1.5">{t('customers.shopPhoneHint')}</p>
        </div>
        <div>
          <span className="field-label">{t('customers.shopLocation')}</span>
          <button className="btn btn-secondary w-full" onClick={locate} disabled={locating}>
            {locating ? t('customers.locating') : t(shop.location ? 'customers.updateLocation' : 'customers.useLocation')}
          </button>
          <p className="text-xs text-[var(--text-muted)] mt-1.5">{shop.location ? t('customers.locationSet') : t('customers.locationHint')}</p>
        </div>
        <div>
          <label className="field-label" htmlFor="shop-radius">{t('customers.radius')}</label>
          <select id="shop-radius" className="form-input" value={shop.radiusKm || 2} onChange={(e) => setShopDelivery({ radiusKm: Number(e.target.value) })}>
            {RADII.map((km) => <option key={km} value={km}>{t('customers.km', { n: km })}</option>)}
          </select>
          <p className="text-xs text-[var(--text-muted)] mt-1.5">{t('customers.radiusHint')}</p>
        </div>
      </div>
    </section>
  );
}

/** Orders customers sent through their link while the shop's server was running. */
function DeliveryOrders() {
  const { t } = useTranslation();
  const { orders, acceptOrder, declineOrder } = useInventory();
  const { showToast } = useToast();
  if (!orders.length) return null;
  const fresh = orders.filter((o) => o.status === 'new');
  const done = orders.filter((o) => o.status !== 'new').slice(0, 8);

  const accept = (order) => {
    const res = acceptOrder(order);
    if (res.ok) showToast(t('customers.accepted', { no: res.bill.billNo }), 'success');
    else showToast(res.error, 'error');
  };

  const card = (o) => {
    const total = o.items.reduce((s, i) => s + i.qty * i.price, 0);
    return (
      <li key={o.id} className="py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-semibold text-[17px]">{o.name || o.phone}</span>
          <span className="text-sm text-[var(--text-muted)]">{fmtDate(o.at, { day: 'numeric', month: 'short' })} {fmtTime(o.at)}</span>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mt-1">{o.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}</p>
        <p className="text-sm mt-1"><b>{inr(total)}</b>{o.km != null && <> · {t('customers.away', { km: o.km.toFixed(1) })}</>}</p>
        {o.address && <p className="text-sm text-[var(--text-secondary)] mt-1">{o.address}</p>}
        {o.note && <p className="text-sm text-[var(--text-secondary)] mt-1">“{o.note}”</p>}
        {o.status === 'new' ? (
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn btn-primary btn-sm" onClick={() => accept(o)}>{t('customers.accept')}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => declineOrder(o)}>{t('customers.decline')}</button>
            {o.location && <a className="btn btn-ghost btn-sm" href={`https://maps.google.com/?q=${o.location.lat},${o.location.lng}`} target="_blank" rel="noreferrer">{t('customers.map')}</a>}
            {o.phone && <a className="btn btn-ghost btn-sm" href={`tel:+91${o.phone}`}>{t('customers.call')}</a>}
          </div>
        ) : (
          <span className={`badge mt-2 ${o.status === 'accepted' ? 'badge-success' : ''}`}>{t(`customers.status.${o.status}`)}</span>
        )}
      </li>
    );
  };

  return (
    <section className="card p-6 mb-4" aria-labelledby="delivery-orders">
      <div className="flex items-center justify-between gap-3">
        <h2 id="delivery-orders" className="eyebrow">{t('customers.orders')}</h2>
        {fresh.length > 0 && <span className="badge badge-danger">{t('customers.newCount', { count: fresh.length })}</span>}
      </div>
      <ul className="divide-y divide-[var(--border)] mt-2">{[...fresh, ...done].map(card)}</ul>
    </section>
  );
}

export default function Customers() {
  const { t } = useTranslation();
  const { customers, bills, products, stats, shop, shopName, saveCustomer, deleteCustomer } = useInventory();
  const account = useAccount();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(null); // null, or { name, phone }

  const visits = useMemo(() => visitsByPhone(bills), [bills]);
  const suggestions = useMemo(() => loyalSuggestions(customers, bills), [customers, bills]);
  const ready = Boolean(shop.phone);

  const addByHand = () => {
    const saved = saveCustomer({ name: adding.name, phone: adding.phone, loyal: true, source: 'manual' });
    if (!saved) { showToast(t('customers.errPhone'), 'error'); return; }
    setAdding(null);
    showToast(t('customers.added', { name: saved.name || saved.phone }), 'success');
  };

  const addFromContacts = async () => {
    try {
      const picked = await navigator.contacts.select(['name', 'tel'], { multiple: true });
      let n = 0;
      for (const c of picked || []) {
        const phone = (c.tel || []).map(normalizePhone).find(Boolean);
        if (phone && saveCustomer({ phone, name: c.name?.[0] || '', loyal: true, source: 'contacts' })) n += 1;
      }
      if (n) showToast(t('customers.addedMany', { count: n }), 'success');
    } catch { /* the picker was closed */ }
  };

  /** The customer's personal order link: this shop's items and prices, and their own code. */
  const linkFor = async (c) => {
    const order = {
      v: 1, shop: shopName, phone: shop.phone, name: c.name, code: c.code,
      items: menuForLink(products, stats),
      ...(shop.location ? { loc: shop.location, radius: shop.radiusKm || 2 } : {}),
      ...(account?.account?.shop?.id ? { api: apiAddress(), sid: account.account.shop.id } : {}),
    };
    return orderPageUrl(appAddress(), await encodeOrder(order));
  };

  const sendLink = async (c) => {
    const url = await linkFor(c);
    window.open(whatsappLink(c.phone, t('customers.linkMessage', { name: c.name || '', shop: shopName, url })), '_blank', 'noopener');
  };

  const copyLink = async (c) => {
    try {
      await navigator.clipboard.writeText(await linkFor(c));
      showToast(t('customers.copied'), 'success');
    } catch {
      showToast(t('customers.errCopy'), 'error');
    }
  };

  return (
    <div>
      <PageHeader title={t('nav.customers')} subtitle={t('customers.subtitle')} />

      <DeliverySettings />
      <DeliveryOrders />

      {suggestions.length > 0 && (
        <section className="card p-6 mb-4" aria-labelledby="loyal-suggest">
          <h2 id="loyal-suggest" className="eyebrow">{t('customers.suggested')}</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{t('customers.suggestedHint')}</p>
          <ul className="divide-y divide-[var(--border)] mt-3">
            {suggestions.map((s) => (
              <li key={s.phone} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex-1 min-w-0">
                  <span className="block font-medium">{s.name || s.phone}</span>
                  <span className="block text-sm text-[var(--text-secondary)]">{t('customers.visits', { count: s.visits })} · {inr(s.spent)}</span>
                </span>
                <button className="btn btn-primary btn-sm" onClick={() => saveCustomer({ phone: s.phone, loyal: true, source: 'bills' })}>{t('customers.addLoyal')}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-6" aria-labelledby="loyal-list">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="loyal-list" className="eyebrow">{t('customers.list', { count: customers.length })}</h2>
          <div className="flex flex-wrap gap-2">
            {contactsSupported() && <button className="btn btn-secondary btn-sm" onClick={addFromContacts}>{t('customers.fromContacts')}</button>}
            <button className="btn btn-secondary btn-sm" onClick={() => setAdding({ name: '', phone: '' })}>{t('customers.addByHand')}</button>
          </div>
        </div>

        {!ready && <p className="storage-notice mt-4" role="note">{t('customers.needPhone')}</p>}

        {adding && (
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end mt-4" onSubmit={(e) => { e.preventDefault(); addByHand(); }}>
            <div>
              <label className="field-label" htmlFor="new-name">{t('customers.name')}</label>
              <input id="new-name" className="form-input" value={adding.name} autoFocus onChange={(e) => setAdding((a) => ({ ...a, name: e.target.value }))} />
            </div>
            <div>
              <label className="field-label" htmlFor="new-phone">{t('customers.phone')}</label>
              <input id="new-phone" className="form-input" inputMode="tel" value={adding.phone} onChange={(e) => setAdding((a) => ({ ...a, phone: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary" type="submit">{t('common.save')}</button>
              <button className="btn btn-ghost" type="button" onClick={() => setAdding(null)}>{t('common.cancel')}</button>
            </div>
          </form>
        )}

        {customers.length === 0 ? <p className="text-[var(--text-secondary)] mt-4">{t('customers.empty')}</p> : (
          <ul className="divide-y divide-[var(--border)] mt-3">
            {customers.map((c) => {
              const v = visits[c.phone];
              const km = distanceKm(shop.location, c.location);
              const details = [
                c.name ? c.phone : null,
                v ? t('customers.visits', { count: v.visits }) : t('customers.noVisits'),
                km != null ? t('customers.away', { km: km.toFixed(1) }) : null,
                t(`customers.source.${c.source || 'manual'}`),
              ].filter(Boolean).join(' · ');
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="insight-tile shrink-0" aria-hidden="true"><span>{(c.name || '#').charAt(0).toUpperCase()}</span></span>
                  <span className="flex-1 min-w-[160px]">
                    <span className="block font-medium">{c.name || c.phone}</span>
                    <span className="block text-sm text-[var(--text-secondary)]">{details}</span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <button className="btn btn-primary btn-sm" onClick={() => sendLink(c)} disabled={!ready}>{t('customers.sendLink')}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => copyLink(c)} disabled={!ready}>{t('customers.copyLink')}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(t('customers.confirmRemove', { name: c.name || c.phone }))) deleteCustomer(c.id); }}>{t('customers.remove')}</button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
