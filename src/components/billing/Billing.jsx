import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Fuse from 'fuse.js';
import { useInventory } from '../../context/InventoryContext';
import { useToast } from '../../context/ToastContext';
import { useOnline, useSettings } from '../../lib/settings';
import { inr, pname, fmtDate, fmtTime } from '../../lib/format';
import Modal from '../common/Modal';
import BarcodeScanModal from './BarcodeScanModal';
import InstallBanner from '../layout/InstallBanner';

const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

export default function Billing() {
  const { t, i18n } = useTranslation();
  const { products, sales, bills, nextBillNo, byId, findByCode, findByBarcode, checkout } = useInventory();
  const { showToast } = useToast();
  const online = useOnline();
  const [settings] = useSettings();

  const [cart, setCart] = useState([]);            // [{ productId, qty }]
  const [flashId, setFlashId] = useState(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [method, setMethod] = useState('cash');
  const [received, setReceived] = useState('');
  const [result, setResult] = useState(null);       // completed bill
  const [scanOpen, setScanOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  const searchRef = useRef(null);
  const codeRef = useRef(null);
  const nextSaleRef = useRef(null);

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);

  // Keyboard shortcuts: "/" search, F2 code entry
  useEffect(() => {
    const onKey = (e) => {
      if (result || scanOpen) return;
      if (e.key === 'F2') { e.preventDefault(); codeRef.current?.focus(); }
      else if (e.key === '/' && !isTyping(document.activeElement)) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result, scanOpen]);

  // Quick-access buttons: best sellers over the history, fixed order while billing.
  const quickIds = useMemo(() => {
    const qty = {};
    for (const s of sales) qty[s.productId] = (qty[s.productId] || 0) + s.qty;
    return [...products].sort((a, b) => (qty[b.id] || 0) - (qty[a.id] || 0)).slice(0, 12).map(p => p.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length]);

  const fuse = useMemo(() => new Fuse(products, {
    keys: [{ name: 'name', weight: 2 }, 'names.te', 'names.hi', 'names.mr', 'aliases', { name: 'code', weight: 2 }, 'id', 'barcode'],
    threshold: 0.34, ignoreLocation: true,
  }), [products]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const exact = findByCode(q);
    const found = fuse.search(q, { limit: 7 }).map(r => r.item);
    return exact ? [exact, ...found.filter(p => p.id !== exact.id)].slice(0, 7) : found;
  }, [query, fuse, findByCode]);

  useEffect(() => { setActive(0); }, [query]);

  const inCart = useCallback((id) => cart.find(c => c.productId === id)?.qty || 0, [cart]);

  const add = useCallback((product, n = 1) => {
    if (!product) return false;
    const p = byId(product.id) || product;
    const already = cart.find(c => c.productId === p.id)?.qty || 0;
    if (p.quantity <= 0) { showToast(t('billing.outOfStock') + ': ' + pname(p), 'error'); return false; }
    if (already + n > p.quantity) { showToast(t('billing.maxStock', { qty: p.quantity }) + ' · ' + pname(p), 'error'); return false; }
    setCart(prev => {
      const found = prev.find(c => c.productId === p.id);
      return found
        ? prev.map(c => c.productId === p.id ? { ...c, qty: c.qty + n } : c)
        : [...prev, { productId: p.id, qty: n }];
    });
    setFlashId(p.id);
    setTimeout(() => setFlashId(id => (id === p.id ? null : id)), 600);
    return true;
  }, [byId, cart, showToast, t]);

  const setQty = (id, qty) => {
    const p = byId(id);
    if (qty <= 0) { setCart(prev => prev.filter(c => c.productId !== id)); return; }
    if (p && qty > p.quantity) { showToast(t('billing.maxStock', { qty: p.quantity }), 'error'); qty = p.quantity; }
    setCart(prev => prev.map(c => c.productId === id ? { ...c, qty } : c));
  };

  const submitCode = (e) => {
    e.preventDefault();
    const raw = code.trim();
    if (!raw) return;
    // "ML 2", "ML x2", "P1025 3", "ML2"
    const m = raw.match(/^(\S+?)(?:\s*[x×*]\s*|\s+)(\d+)$/i) || raw.match(/^(\S+)$/);
    let token = m ? m[1] : raw, qty = m && m[2] ? parseInt(m[2], 10) : 1;
    let product = findByCode(token);
    if (!product) {
      const glued = raw.match(/^([A-Za-z]+)(\d{1,3})$/);  // "ML2"
      if (glued && findByCode(glued[1])) { product = findByCode(glued[1]); qty = parseInt(glued[2], 10); }
    }
    if (!product) { setCodeError(t('billing.codeNotFound', { code: token })); return; }
    setCodeError('');
    if (add(product, Math.max(1, qty))) setCode('');
  };

  const onSearchKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); if (add(results[active])) setQuery(''); }
    else if (e.key === 'Escape') setQuery('');
  };

  const lines = cart.map(c => ({ ...c, p: byId(c.productId) })).filter(l => l.p);
  const total = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);
  const receivedNum = Number(received) || 0;
  const change = receivedNum - total;

  const pay = () => {
    const res = checkout(cart, { method, received: method === 'cash' && receivedNum ? receivedNum : null });
    if (!res.ok) { showToast(res.error, 'error'); return; }
    setResult(res);
    setCart([]); setReceived(''); setQuery(''); setCode('');
  };

  const nextSale = () => { setResult(null); setMethod('cash'); setTimeout(() => searchRef.current?.focus(), 50); };
  useEffect(() => { if (result) setTimeout(() => nextSaleRef.current?.focus(), 80); }, [result]);

  const methodLabel = (m) => t(`billing.${m}`);
  const todayBills = bills.filter(b => b.date >= new Date().setHours(0, 0, 0, 0));

  return (
    <div className="billing">
      <InstallBanner />
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6 mt-2">
        <div>
          <p className="eyebrow mb-3 font-mono tracking-[0.08em]">{t('billing.billNo', { no: nextBillNo })}</p>
          <h1 className="page-title">{t('billing.title')}</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className={`status-pill ${online ? 'is-online' : 'is-offline'}`}>
            <span className="dot" />{online ? t('common.online') : t('common.offline')}
          </span>
          <span className="text-[var(--text-secondary)] font-mono">{fmtDate(now, { day: 'numeric', month: 'short' })} · {fmtTime(now)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6 items-start">
        {/* ── Left: product entry ── */}
        <div className="space-y-6 min-w-0">
          <div className="card p-5 sm:p-6">
            <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-4">
              {/* Method 2 — search */}
              <div className="relative">
                <label className="field-label" htmlFor="bill-search">{t('billing.search')}</label>
                <div className="relative">
                  <svg className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M21 21l-5-5m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <input id="bill-search" ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onSearchKey}
                    placeholder={t('billing.searchPlaceholder')} className="form-input pl-11" autoComplete="off" autoFocus />
                </div>
                {query.trim() && (
                  <ul className="search-results" role="listbox">
                    {results.length === 0 && <li className="px-4 py-3 text-sm text-[var(--text-muted)]">{t('billing.noResults')}</li>}
                    {results.map((p, i) => (
                      <li key={p.id}>
                        <button role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)}
                          onClick={() => { if (add(p)) { setQuery(''); searchRef.current?.focus(); } }}
                          className={`search-result ${i === active ? 'active' : ''}`} disabled={p.quantity <= 0}>
                          <span className="min-w-0">
                            <span className="block font-medium truncate">{pname(p)}</span>
                            <span className="block text-xs text-[var(--text-muted)] font-mono mt-0.5">{p.code} · {p.id}</span>
                          </span>
                          <span className="text-right shrink-0">
                            <span className="block font-semibold">{inr(p.price)}</span>
                            <span className={`block text-xs ${p.quantity <= (p.min ?? 0) ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]'}`}>
                              {p.quantity > 0 ? t('billing.left', { qty: p.quantity }) : t('billing.outOfStock')}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Method 3 — code / ID */}
              <form onSubmit={submitCode}>
                <label className="field-label" htmlFor="bill-code">{t('billing.codeEntry')} <kbd className="kbd">F2</kbd></label>
                <div className="flex gap-2">
                  <input id="bill-code" ref={codeRef} value={code} onChange={e => { setCode(e.target.value); setCodeError(''); }}
                    placeholder={t('billing.codePlaceholder')} className="form-input font-mono uppercase" autoComplete="off" spellCheck="false" />
                  <button type="button" className="icon-pill !w-[46px] !h-[46px] !rounded-[14px] shrink-0" onClick={() => setScanOpen(true)} title={t('billing.scan')} aria-label={t('billing.scan')}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={1.8} d="M4 7V5a1 1 0 011-1h2M17 4h2a1 1 0 011 1v2M20 17v2a1 1 0 01-1 1h-2M7 20H5a1 1 0 01-1-1v-2M8 8v8M11 8v8M14 8v8M17 8v8" /></svg>
                  </button>
                </div>
                <p className={`text-xs mt-2 ${codeError ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'}`}>{codeError || t('billing.codeHint')}</p>
              </form>
            </div>
          </div>

          {/* Method 1 — quick access */}
          <section>
            <div className="flex items-baseline justify-between mb-3 px-1">
              <h2 className="eyebrow">{t('billing.quick')}</h2>
              <span className="text-xs text-[var(--text-muted)] hidden sm:block">{t('billing.keyboardHint')}</span>
            </div>
            <div className="quick-grid">
              {quickIds.map(id => byId(id)).filter(Boolean).map(p => {
                const n = inCart(p.id);
                const out = p.quantity <= 0;
                const low = !out && p.quantity <= (p.min ?? 0);
                return (
                  <button key={p.id} onClick={() => add(p)} disabled={out}
                    className={`quick-btn ${n ? 'in-cart' : ''} ${flashId === p.id ? 'flash' : ''}`}>
                    {n > 0 && <span className="quick-count">{n}</span>}
                    <span className="quick-name">{pname(p)}</span>
                    <span className="flex items-end justify-between gap-2 w-full mt-auto">
                      <span className="quick-price">{inr(p.price)}</span>
                      <span className={`text-[11px] font-mono ${out ? 'text-[var(--danger)]' : low ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]'}`}>
                        {out ? t('billing.outOfStock') : `${p.code} · ${p.quantity}`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Recent bills */}
          <section className="card p-5 sm:p-6">
            <h2 className="eyebrow mb-4">{t('billing.recent')}</h2>
            {todayBills.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">{t('billing.noBills')}</p>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {todayBills.slice(0, 5).map(b => (
                  <div key={b.id} className="flex items-center justify-between py-3 text-sm gap-4">
                    <span className="font-mono text-[var(--text-secondary)] w-16">#{b.billNo}</span>
                    <span className="flex-1 truncate text-[var(--text-secondary)]">{b.items.map(i => `${pname(i)} ×${i.qty}`).join(', ')}</span>
                    <span className="text-[var(--text-muted)] hidden sm:inline">{methodLabel(b.payment?.method || 'cash')}</span>
                    <span className="font-semibold w-20 text-right">{inr(b.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── Right: current bill ── */}
        <aside id="bill-panel" className="card bill-panel xl:sticky xl:top-[104px] scroll-mt-24">
          <div className="flex items-center justify-between px-6 pt-6 pb-4">
            <div>
              <h2 className="font-display text-[20px] font-bold tracking-tight">{t('billing.cartTitle')}</h2>
              <p className="text-xs text-[var(--text-muted)] mt-1">{t('billing.items', { count: itemCount })}</p>
            </div>
            {lines.length > 0 && <button className="text-sm text-[var(--text-muted)] hover:text-[var(--danger)]" onClick={() => setCart([])}>{t('billing.clear')}</button>}
          </div>

          <div className="bill-lines custom-scrollbar">
            {lines.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="font-medium">{t('billing.cartEmpty')}</p>
                <p className="text-sm text-[var(--text-muted)] mt-1">{t('billing.cartEmptyHint')}</p>
              </div>
            ) : lines.map(({ p, qty }) => (
              <div key={p.id} className={`bill-line ${flashId === p.id ? 'flash' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{pname(p)}</p>
                  <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">{inr(p.price)} × {qty}</p>
                </div>
                <div className="stepper">
                  <button onClick={() => setQty(p.id, qty - 1)} aria-label="−">−</button>
                  <input value={qty} inputMode="numeric" aria-label={t('common.qty')}
                    onChange={e => setQty(p.id, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)} />
                  <button onClick={() => setQty(p.id, qty + 1)} aria-label="+">+</button>
                </div>
                <p className="w-20 text-right font-semibold">{inr(p.price * qty)}</p>
              </div>
            ))}
          </div>

          <div className="px-6 pt-4 pb-6 border-t border-[var(--border)]">
            <div className="flex items-baseline justify-between mb-5">
              <span className="eyebrow">{t('billing.grandTotal')}</span>
              <span className="metric text-[44px]">{inr(total)}</span>
            </div>

            <p className="field-label">{t('billing.payment')}</p>
            <div className="segmented mb-4" role="radiogroup" aria-label={t('billing.payment')}>
              {['cash', 'upi', 'card'].map(m => (
                <button key={m} role="radio" aria-checked={method === m} className={method === m ? 'active' : ''} onClick={() => setMethod(m)}>{methodLabel(m)}</button>
              ))}
            </div>

            {method === 'cash' && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="field-label" htmlFor="cash-recv">{t('billing.received')}</label>
                  <input id="cash-recv" className="form-input font-mono" inputMode="numeric" placeholder={String(total || '')}
                    value={received} onChange={e => setReceived(e.target.value.replace(/[^\d.]/g, ''))} />
                </div>
                <div>
                  <p className="field-label">{t('billing.change')}</p>
                  <p className={`h-[46px] flex items-center font-mono text-lg font-semibold ${receivedNum && change < 0 ? 'text-[var(--danger)]' : ''}`}>
                    {receivedNum ? inr(Math.max(0, change)) : '—'}
                  </p>
                </div>
              </div>
            )}

            <button className="btn btn-cta w-full !py-4 text-base" disabled={!lines.length} onClick={pay}>
              {t('billing.pay', { amount: inr(total) })}
            </button>
            <p className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)] mt-3">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M4 4v6h6M20 20v-6h-6M5.5 15a7 7 0 0012.4 2M18.5 9A7 7 0 006.1 7" /></svg>
              {t('billing.autoUpdate')}
            </p>
          </div>
        </aside>
      </div>

      {/* Phone: sticky bar with the running total, jumps to the bill */}
      {lines.length > 0 && !result && createPortal(
        <div className="mobile-pay-bar xl:hidden">
          <div className="min-w-0">
            <p className="text-xs text-[var(--text-muted)]">{t('billing.items', { count: itemCount })}</p>
            <p className="font-display font-bold text-[22px] leading-tight">{inr(total)}</p>
          </div>
          <button className="btn btn-cta" onClick={() => document.getElementById('bill-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            {t('billing.reviewPay')} →
          </button>
        </div>,
        document.body,
      )}

      {/* Payment complete */}
      <Modal open={!!result} onClose={nextSale} title={t('billing.paid')} width={560}
        footer={<>
          <button className="btn btn-secondary" onClick={() => window.print()}>{t('billing.printReceipt')}</button>
          <button ref={nextSaleRef} className="btn btn-cta" onClick={nextSale}>{t('billing.nextSale')}</button>
        </>}>
        {result && (
          <>
            <p className="text-[var(--text-secondary)] -mt-3 mb-5">
              {t('billing.paidSub', { no: result.bill.billNo, method: methodLabel(result.bill.payment.method), amount: inr(result.bill.total) })}
              {result.bill.payment.received ? ` · ${t('billing.change')}: ${inr(result.bill.payment.received - result.bill.total)}` : ''}
            </p>
            <div className="card-inset p-4">
              <p className="eyebrow mb-3 flex items-center gap-2"><span className="status-dot" />{t('billing.invUpdated')}</p>
              <div className="divide-y divide-[var(--border)]">
                {result.changes.map(ch => {
                  const low = ch.after <= ch.min;
                  return (
                    <div key={ch.productId} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className="flex-1 truncate font-medium">{pname(ch)}</span>
                      <span className="font-mono text-[var(--text-muted)]">{ch.before}</span>
                      <span className="text-[var(--text-muted)]">→</span>
                      <span className={`font-mono font-semibold w-10 ${low ? 'text-[var(--warning)]' : ''}`}>{ch.after}</span>
                      <span className="font-mono text-xs text-[var(--danger)] w-10 text-right">−{ch.qty}</span>
                    </div>
                  );
                })}
              </div>
              {result.changes.some(ch => ch.after <= ch.min) && (
                <p className="text-xs text-[var(--warning)] mt-3">{t('dashboard.lowStock')}: {result.changes.filter(ch => ch.after <= ch.min).map(ch => pname(ch)).join(', ')}</p>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* Printable receipt */}
      {result && (
        <div className="print-area" aria-hidden="true">
          <h2>{settings.shopName}</h2>
          <p>#{result.bill.billNo} · {fmtDate(result.bill.date)} {fmtTime(result.bill.date)}</p>
          <table>
            <tbody>
              {result.bill.items.map(i => (
                <tr key={i.productId}><td>{pname(i, i18n.language)} × {i.qty}</td><td style={{ textAlign: 'right' }}>{inr(i.total)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="receipt-total"><span>{t('billing.grandTotal')}</span><span>{inr(result.bill.total)}</span></p>
          <p>{methodLabel(result.bill.payment.method)}</p>
          <p>{t('billing.receiptThanks')}</p>
        </div>
      )}

      <BarcodeScanModal open={scanOpen} onClose={() => setScanOpen(false)}
        onCode={(text) => {
          const p = findByBarcode(text) || findByCode(text);
          if (p) { if (add(p)) showToast(t('billing.added', { name: pname(p) }), 'success'); }
          else showToast(t('billing.codeNotFound', { code: text }), 'error');
        }} />
    </div>
  );
}
