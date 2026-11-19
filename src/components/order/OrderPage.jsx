import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { decodeOrder, distanceKm, orderMessage, whatsappLink } from '../../lib/customers';
import { inr } from '../../lib/format';
import Logo from '../layout/Logo';

const PREFIX = '#/order/';
const remember = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private window */ } };
const recall = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };

async function postJson(url, body, ms = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What a loyal customer sees when they open their personal link: the shop's
 * items, + and − buttons, their address, and Send, which opens WhatsApp to the
 * shop with the order written out (and also sends it to the shop's app when the
 * shop has its server running).
 */
export default function OrderPage() {
  const { t } = useTranslation();
  const [order, setOrder] = useState(undefined); // undefined while reading, null when the link is broken
  const [items, setItems] = useState([]);
  const [qty, setQty] = useState({});
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ name: '', address: '', note: '' });
  const [location, setLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null); // { inApp: boolean | null }

  useEffect(() => {
    decodeOrder(window.location.hash.slice(PREFIX.length)).then((o) => {
      setOrder(o);
      if (!o) return;
      setItems(o.items);
      const saved = recall(`stokd_order_${o.sid || o.shop}`);
      setForm({ name: saved?.name || o.name || '', address: saved?.address || '', note: '' });
      document.title = o.shop;
    });
  }, []);

  // With the shop's server running, today's items and prices replace the ones in the link.
  useEffect(() => {
    if (!order?.api || !order.sid) return;
    fetch(`${order.api}/api/public/menu?shop=${encodeURIComponent(order.sid)}&code=${encodeURIComponent(order.code || '')}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((menu) => { if (menu?.items?.length) setItems(menu.items); })
      .catch(() => {});
  }, [order]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter(([, name]) => name.toLowerCase().includes(q)) : items;
  }, [items, query]);

  if (order === undefined) return <div className="order-page" />;
  if (!order) {
    return (
      <main className="order-page">
        <Logo />
        <h1 className="text-2xl font-bold mt-8">{t('order.brokenTitle')}</h1>
        <p className="text-[var(--text-secondary)] mt-2">{t('order.brokenBody')}</p>
      </main>
    );
  }

  const lines = items.filter(([id]) => qty[id] > 0).map(([id, name, price]) => ({ productId: id, name, price, qty: qty[id] }));
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const km = distanceKm(order.loc, location);
  const far = km != null && order.radius && km > order.radius;
  const change = (id, by) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(99, (q[id] || 0) + by)) }));

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const send = async () => {
    if (!lines.length || !form.name.trim()) return;
    setSending(true);
    remember(`stokd_order_${order.sid || order.shop}`, { name: form.name.trim(), address: form.address.trim() });
    let inApp = null;
    if (order.api && order.sid) {
      inApp = await postJson(`${order.api}/api/public/orders`, {
        shop: order.sid, code: order.code || '', name: form.name.trim(), address: form.address.trim(), note: form.note.trim(),
        items: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
        ...(location ? { location } : {}),
      });
    }
    const message = orderMessage({
      shop: order.shop, name: form.name.trim(), code: order.code, lines,
      address: form.address.trim(), note: form.note.trim(), location, km,
    });
    setSending(false);
    setSent({ inApp });
    window.location.href = whatsappLink(order.phone, message);
  };

  return (
    <main className="order-page">
      <header className="flex items-center justify-between gap-3">
        <span className="text-sm text-[var(--text-muted)]">{t('order.via')}</span>
        <Logo />
      </header>
      <h1 className="text-[28px] leading-tight font-bold mt-5">{order.shop}</h1>
      <p className="text-[var(--text-secondary)] mt-1">{order.name ? t('order.hello', { name: order.name }) : t('order.helloAnon')}</p>

      {sent && (
        <p className="storage-notice mt-4" role="status">{sent.inApp ? t('order.sentBoth') : t('order.sentWhatsapp')}</p>
      )}

      {items.length > 12 && (
        <input type="search" className="form-input mt-5" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('order.search')} aria-label={t('order.search')} />
      )}

      <ul className="mt-4 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        {shown.map(([id, name, price]) => (
          <li key={id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex-1 min-w-0">
              <span className="block font-medium leading-snug">{name}</span>
              <span className="block text-sm text-[var(--text-secondary)]">{inr(price)}</span>
            </span>
            {qty[id] > 0 ? (
              <span className="order-stepper">
                <button type="button" onClick={() => change(id, -1)} aria-label={t('order.less', { name })}>−</button>
                <span aria-live="polite">{qty[id]}</span>
                <button type="button" onClick={() => change(id, 1)} aria-label={t('order.more', { name })}>+</button>
              </span>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => change(id, 1)}>{t('order.add')}</button>
            )}
          </li>
        ))}
        {shown.length === 0 && <li className="px-4 py-4 text-[var(--text-secondary)]">{t('order.noItems')}</li>}
      </ul>

      <section className="mt-6 grid gap-4" aria-label={t('order.details')}>
        <div>
          <label className="field-label" htmlFor="order-name">{t('order.name')}</label>
          <input id="order-name" className="form-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoComplete="name" />
        </div>
        <div>
          <label className="field-label" htmlFor="order-address">{t('order.address')}</label>
          <textarea id="order-address" className="form-input" rows={2} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} autoComplete="street-address" />
        </div>
        <div>
          <label className="field-label" htmlFor="order-note">{t('order.note')}</label>
          <input id="order-note" className="form-input" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder={t('order.notePlaceholder')} />
        </div>
        <div>
          <button type="button" className="btn btn-secondary w-full" onClick={locate} disabled={locating}>
            {locating ? t('order.locating') : location ? t('order.locationShared') : t('order.shareLocation')}
          </button>
          {km != null && <p className={`text-sm mt-2 ${far ? 'text-[var(--warning)]' : 'text-[var(--text-secondary)]'}`}>{far ? t('order.far', { km: km.toFixed(1), radius: order.radius }) : t('order.near', { km: km.toFixed(1) })}</p>}
        </div>
      </section>

      <div className="order-foot"><div className="order-foot-inner">
        <div className="flex items-baseline justify-between">
          <span className="text-[var(--text-secondary)]">{t('order.items', { count: lines.reduce((s, l) => s + l.qty, 0) })}</span>
          <span className="text-2xl font-bold">{inr(total)}</span>
        </div>
        <button type="button" className="btn btn-cta w-full mt-3" onClick={send} disabled={!lines.length || !form.name.trim() || sending}>
          {sending ? t('order.sending') : t('order.send')}
        </button>
        {!form.name.trim() && lines.length > 0 && <p className="text-xs text-[var(--text-muted)] mt-2 text-center">{t('order.needName')}</p>}
      </div></div>
    </main>
  );
}
