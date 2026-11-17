import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Fuse from 'fuse.js';
import { useInventory } from '../../context/InventoryContext';
import { useToast } from '../../context/ToastContext';
import { inr, pname, fmtTime } from '../../lib/format';
import { receiptText, whatsappLink } from '../../lib/receipt';
import { SearchIcon, ScanIcon, PauseIcon, CloseIcon, ShareIcon, PrintIcon } from '../../lib/icons';
import { CATEGORIES } from '../../data/seed';
import Modal from '../common/Modal';
import Receipt from '../common/Receipt';
import BarcodeScanModal from './BarcodeScanModal';
import InstallBanner from '../layout/InstallBanner';

const HELD_KEY = 'stokd_held_bills';
const loadHeld = () => { try { return JSON.parse(localStorage.getItem(HELD_KEY) || '[]'); } catch { return []; } };
const saveHeld = (held) => { try { localStorage.setItem(HELD_KEY, JSON.stringify(held)); } catch { /* the held list is only a convenience */ } };

const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

/** "ML 2", "ML x2", "P1025 3", "ML2" → candidate { token, qty } readings, most likely first. */
function parseEntry(raw) {
  const spaced = raw.match(/^(\S+?)(?:\s*[x×*]\s*|\s+)(\d{1,4})$/i);
  if (spaced) return [{ token: spaced[1], qty: parseInt(spaced[2], 10) }];
  const glued = raw.match(/^([A-Za-z]+)(\d{1,3})$/);
  return [{ token: raw, qty: 1 }, ...(glued ? [{ token: glued[1], qty: parseInt(glued[2], 10) }] : [])];
}

export default function Billing() {
  const { t } = useTranslation();
  const { products, sales, bills, nextBillNo, shopName, byId, findByCode, findByBarcode, checkout } = useInventory();
  const { showToast } = useToast();

  const [cart, setCart] = useState([]);              // [{ productId, qty }]
  const [flashId, setFlashId] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [method, setMethod] = useState('cash');
  const [received, setReceived] = useState('');
  const [discount, setDiscount] = useState(null);    // null, or { mode: 'amount' | 'pct', value: '' }
  const [held, setHeld] = useState(loadHeld);
  const [heldOpen, setHeldOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false); // the bill, on phones
  const [result, setResult] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);

  const searchRef = useRef(null);
  const nextSaleRef = useRef(null);

  // "/" or F2 jumps to the search box from anywhere on the page.
  useEffect(() => {
    const onKey = (e) => {
      if (result || scanOpen) return;
      if (e.key === 'F2' || (e.key === '/' && !isTyping(document.activeElement))) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result, scanOpen]);

  // Best sellers first; the order stays put while billing so tiles do not jump under a finger.
  const rank = useMemo(() => {
    const qty = {};
    for (const s of sales) qty[s.productId] = (qty[s.productId] || 0) + s.qty;
    return qty;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length]);

  const usedCategories = useMemo(() => CATEGORIES.filter((c) => products.some((p) => p.category === c)), [products]);
  const fuse = useMemo(() => new Fuse(products, {
    keys: [{ name: 'name', weight: 2 }, 'names.te', 'names.hi', 'names.mr', 'aliases', { name: 'code', weight: 2 }, 'id', 'barcode'],
    threshold: 0.34, ignoreLocation: true,
  }), [products]);

  const shown = useMemo(() => {
    const q = query.trim();
    let list;
    if (q) {
      const exact = parseEntry(q).map((e) => findByCode(e.token)).find(Boolean);
      const found = fuse.search(q).map((r) => r.item);
      list = exact ? [exact, ...found.filter((p) => p.id !== exact.id)] : found;
    } else {
      list = [...products].sort((a, b) => (rank[b.id] || 0) - (rank[a.id] || 0));
    }
    return category === 'all' ? list : list.filter((p) => p.category === category);
  }, [query, category, products, fuse, findByCode, rank]);

  const inCart = (id) => cart.find((c) => c.productId === id)?.qty || 0;

  const add = useCallback((product, n = 1) => {
    if (!product) return false;
    const p = byId(product.id) || product;
    const already = cart.find((c) => c.productId === p.id)?.qty || 0;
    if (p.quantity <= 0) { showToast(`${t('billing.outOfStock')}: ${pname(p)}`, 'error'); return false; }
    if (already + n > p.quantity) { showToast(`${t('billing.maxStock', { qty: p.quantity })}: ${pname(p)}`, 'error'); return false; }
    setCart((prev) => (prev.some((c) => c.productId === p.id)
      ? prev.map((c) => (c.productId === p.id ? { ...c, qty: c.qty + n } : c))
      : [...prev, { productId: p.id, qty: n }]));
    setFlashId(p.id);
    setTimeout(() => setFlashId((id) => (id === p.id ? null : id)), 600);
    return true;
  }, [byId, cart, showToast, t]);

  const setQty = (id, qty) => {
    const p = byId(id);
    if (qty <= 0) { setCart((prev) => prev.filter((c) => c.productId !== id)); return; }
    if (p && qty > p.quantity) { showToast(t('billing.maxStock', { qty: p.quantity }), 'error'); qty = p.quantity; }
    setCart((prev) => prev.map((c) => (c.productId === id ? { ...c, qty } : c)));
  };

  /** Enter in the search box: a code (with an optional quantity) first, otherwise the top match. */
  const submitSearch = (e) => {
    e.preventDefault();
    const raw = query.trim();
    if (!raw) return;
    for (const entry of parseEntry(raw)) {
      const p = findByCode(entry.token) || findByBarcode(entry.token);
      if (p) { if (add(p, Math.max(1, entry.qty))) setQuery(''); return; }
    }
    if (shown[0]) { if (add(shown[0])) setQuery(''); return; }
    showToast(t('billing.codeNotFound', { code: raw }), 'error');
  };

  const lines = cart.map((c) => ({ ...c, p: byId(c.productId) })).filter((l) => l.p);
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const discountValue = Number(discount?.value) || 0;
  const off = Math.min(subtotal, Math.max(0, discount?.mode === 'pct' ? (subtotal * Math.min(100, discountValue)) / 100 : discountValue));
  const total = Math.round((subtotal - off) * 100) / 100;
  const receivedNum = Number(received) || 0;
  const change = receivedNum - total;

  const resetBill = () => { setCart([]); setReceived(''); setDiscount(null); setQuery(''); };

  const pay = () => {
    const res = checkout(cart, { method, received: method === 'cash' && receivedNum ? receivedNum : null }, { discount: off });
    if (!res.ok) { showToast(res.error, 'error'); return; }
    setResult(res);
    setSheetOpen(false);
    resetBill();
  };

  const nextSale = () => { setResult(null); setMethod('cash'); setTimeout(() => searchRef.current?.focus(), 50); };
  useEffect(() => { if (result) setTimeout(() => nextSaleRef.current?.focus(), 80); }, [result]);

  /* Held bills: park a customer's bill, serve the next one, come back to it. */
  const updateHeld = (next) => { setHeld(next); saveHeld(next); };
  const hold = () => {
    if (!cart.length) return;
    updateHeld([{ id: `h${Date.now()}`, at: Date.now(), cart, discount }, ...held].slice(0, 20));
    resetBill();
    setSheetOpen(false);
    showToast(t('sell.heldToast'), 'success');
  };
  const resume = (entry) => {
    const rest = held.filter((h) => h.id !== entry.id);
    updateHeld(cart.length ? [{ id: `h${Date.now()}`, at: Date.now(), cart, discount }, ...rest] : rest);
    setCart(entry.cart.filter((c) => byId(c.productId)));
    setDiscount(entry.discount || null);
    setHeldOpen(false);
  };
  const heldTotal = (entry) => entry.cart.reduce((s, c) => s + (byId(c.productId)?.price || 0) * c.qty, 0);

  const methodLabel = (m) => t(`billing.${m}`);
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayBills = bills.filter((b) => b.at >= todayStart);

  return (
    <div className="sell">
      <div className="sell-main">
        <InstallBanner />

        <form className="sell-search" onSubmit={submitSearch} role="search">
          <SearchIcon className="sell-search-icon" />
          <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
            role="combobox" aria-expanded={Boolean(query.trim())} aria-controls="sell-grid" aria-autocomplete="list"
            aria-label={t('billing.search')} placeholder={t('sell.searchPlaceholder')} autoComplete="off" spellCheck="false" autoFocus />
          <button type="button" className="sell-scan" onClick={() => setScanOpen(true)} aria-label={t('billing.scan')} title={t('billing.scan')}><ScanIcon /></button>
        </form>
        <p className="sell-hint">{t('sell.searchHint')}</p>

        <div className="chip-row" role="group" aria-label={t('common.category')}>
          <button className={`chip ${category === 'all' ? 'active' : ''}`} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>{t('common.all')}</button>
          {usedCategories.map((c) => (
            <button key={c} className={`chip ${category === c ? 'active' : ''}`} aria-pressed={category === c} onClick={() => setCategory(c)}>{t(`cat.${c}`)}</button>
          ))}
          {held.length > 0 && (
            <div className="relative chip-held">
              <button className="chip chip-accent" aria-expanded={heldOpen} onClick={() => setHeldOpen((o) => !o)}>{t('sell.heldCount', { count: held.length })}</button>
              {heldOpen && (
                <ul className="menu-pop held-pop">
                  {held.map((h) => (
                    <li key={h.id}>
                      <button className="menu-item" onClick={() => resume(h)}>
                        <span className="min-w-0">
                          <span className="block font-medium truncate">{h.cart.map((c) => `${pname(byId(c.productId))} ×${c.qty}`).join(', ')}</span>
                          <span className="block text-xs text-[var(--text-muted)]">{fmtTime(h.at)} · {inr(heldTotal(h))}</span>
                        </span>
                        <span className="font-semibold text-[var(--primary)] shrink-0">{t('sell.resume')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div id="sell-grid" className="product-grid">
          {shown.length === 0 && <p className="product-empty">{query ? t('billing.noResults') : t('sell.noProducts')}</p>}
          {shown.map((p, i) => {
            const n = inCart(p.id);
            const out = p.quantity <= 0;
            const low = !out && p.quantity <= (p.min ?? 0);
            return (
              <button key={p.id} onClick={() => { if (add(p) && query) setQuery(''); }} disabled={out}
                className={`tile ${n ? 'in-cart' : ''} ${flashId === p.id ? 'flash' : ''} ${query && i === 0 ? 'is-next' : ''}`}>
                <span className="tile-name">{pname(p)}</span>
                <span className="tile-price">{inr(p.price)}</span>
                <span className={`tile-stock ${out ? 'is-out' : low ? 'is-low' : ''}`}>
                  {out ? t('billing.outOfStock') : t('billing.left', { qty: p.quantity })}<span className="tile-code">{p.code}</span>
                </span>
                {n > 0 && <span className="tile-count" aria-label={t('sell.inBill', { count: n })}>{n}</span>}
              </button>
            );
          })}
        </div>

        <p className="today-strip">{t('sell.today', { count: todayBills.length, amount: inr(todayBills.reduce((s, b) => s + b.total, 0)) })}</p>
      </div>

      {/* ── The bill: a column on wide screens, a sheet on phones ── */}
      {sheetOpen && <div className="sheet-backdrop" onClick={() => setSheetOpen(false)} aria-hidden="true" />}
      <section className={`bill ${sheetOpen ? 'is-open' : ''}`} aria-label={t('billing.cartTitle')}>
        <header className="bill-head">
          <div>
            <h2 className="bill-title">{t('billing.cartTitle')}</h2>
            <p className="bill-meta">{t('sell.billNo', { no: nextBillNo })} · {t('billing.items', { count: itemCount })}</p>
          </div>
          <div className="flex items-center gap-1">
            {lines.length > 0 && <button className="text-btn hold-btn" onClick={hold} aria-label={t('sell.hold')} title={t('sell.hold')}><PauseIcon className="icon" /><span className="hold-label">{t('sell.hold')}</span></button>}
            {lines.length > 0 && <button className="text-btn danger" onClick={() => setCart([])}>{t('billing.clear')}</button>}
            <button className="icon-btn sheet-close" onClick={() => setSheetOpen(false)} aria-label={t('common.close')}><CloseIcon /></button>
          </div>
        </header>

        <div className="bill-lines custom-scrollbar">
          {lines.length === 0 ? (
            <div className="bill-empty">
              <p className="font-medium">{t('billing.cartEmpty')}</p>
              <p>{t('sell.cartEmptyHint')}</p>
            </div>
          ) : lines.map(({ p, qty }) => (
            <div key={p.id} className={`bill-line ${flashId === p.id ? 'flash' : ''}`}>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{pname(p)}</p>
                <p className="bill-line-sub">{inr(p.price)} × {qty}</p>
              </div>
              <div className="stepper">
                <button onClick={() => setQty(p.id, qty - 1)} aria-label={t('sell.less')}>−</button>
                <input value={qty} inputMode="numeric" aria-label={t('common.qty')}
                  onChange={(e) => setQty(p.id, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)} />
                <button onClick={() => setQty(p.id, qty + 1)} aria-label={t('sell.more')}>+</button>
              </div>
              <p className="bill-line-total">{inr(p.price * qty)}</p>
            </div>
          ))}
        </div>

        <footer className="bill-foot">
          {discount ? (
            <div className="discount-row">
              <label htmlFor="bill-discount">{t('receipt.discount')}</label>
              <input id="bill-discount" className="form-input" inputMode="decimal" value={discount.value} autoFocus
                onChange={(e) => setDiscount((d) => ({ ...d, value: e.target.value.replace(/[^\d.]/g, '') }))} />
              <div className="segmented segmented-sm">
                {[['amount', '₹'], ['pct', '%']].map(([mode, label]) => (
                  <button key={mode} className={discount.mode === mode ? 'active' : ''} aria-pressed={discount.mode === mode} onClick={() => setDiscount((d) => ({ ...d, mode }))}>{label}</button>
                ))}
              </div>
              <button className="icon-btn" onClick={() => setDiscount(null)} aria-label={t('sell.removeDiscount')}><CloseIcon /></button>
            </div>
          ) : (
            <button className="text-btn" onClick={() => setDiscount({ mode: 'amount', value: '' })} disabled={!lines.length}>{t('sell.addDiscount')}</button>
          )}

          {off > 0 && (
            <dl className="bill-sums">
              <div><dt>{t('billing.subtotal')}</dt><dd>{inr(subtotal)}</dd></div>
              <div><dt>{t('receipt.discount')}</dt><dd>−{inr(off)}</dd></div>
            </dl>
          )}
          <div className="bill-total">
            <span>{t('billing.grandTotal')}</span>
            <span className="bill-total-amount">{inr(total)}</span>
          </div>

          <div className="segmented" role="radiogroup" aria-label={t('billing.payment')}>
            {['cash', 'upi', 'card'].map((m) => (
              <button key={m} role="radio" aria-checked={method === m} className={method === m ? 'active' : ''} onClick={() => setMethod(m)}>{methodLabel(m)}</button>
            ))}
          </div>

          {method === 'cash' && lines.length > 0 && (
            <div className="cash-row">
              <label htmlFor="cash-recv">{t('billing.received')}</label>
              <input id="cash-recv" className="form-input" inputMode="numeric" placeholder={String(total || '')}
                value={received} onChange={(e) => setReceived(e.target.value.replace(/[^\d.]/g, ''))} />
              <span className={`cash-change ${receivedNum && change < 0 ? 'is-short' : ''}`}>
                {receivedNum ? `${t('billing.change')}: ${inr(Math.max(0, change))}` : ''}
              </span>
            </div>
          )}

          <button className="btn btn-cta pay-btn" disabled={!lines.length} onClick={pay}>
            {t('billing.pay', { amount: inr(total) })}
          </button>
        </footer>
      </section>

      {/* Phones: the running bill, one tap away */}
      {lines.length > 0 && !sheetOpen && !result && createPortal(
        <div className="cart-bar">
          <div className="min-w-0">
            <p className="cart-bar-count">{t('billing.items', { count: itemCount })}</p>
            <p className="cart-bar-total">{inr(total)}</p>
          </div>
          <button className="btn btn-cta" onClick={() => setSheetOpen(true)}>{t('sell.viewBill')}</button>
        </div>,
        document.body,
      )}

      <Modal open={!!result} onClose={nextSale} title={t('billing.paid')} width={560}
        footer={result && <>
          <a className="btn btn-secondary" href={whatsappLink(receiptText(result.bill, shopName, t))} target="_blank" rel="noopener noreferrer">
            <ShareIcon className="icon" />{t('orders.whatsapp')}
          </a>
          <button className="btn btn-secondary" onClick={() => window.print()}><PrintIcon className="icon" />{t('billing.printReceipt')}</button>
          <button ref={nextSaleRef} className="btn btn-cta" onClick={nextSale}>{t('billing.nextSale')}</button>
        </>}>
        {result && (
          <>
            <p className="text-[var(--text-secondary)] -mt-3 mb-5">
              {t('billing.paidSub', { no: result.bill.billNo, method: methodLabel(result.bill.payment.method), amount: inr(result.bill.total) })}
              {result.bill.payment.received ? ` · ${t('billing.change')}: ${inr(result.bill.payment.received - result.bill.total)}` : ''}
            </p>
            <div className="card-inset p-4">
              <p className="section-label mb-3 flex items-center gap-2"><span className="status-dot" />{t('billing.invUpdated')}</p>
              <div className="divide-y divide-[var(--border)]">
                {result.changes.map((ch) => {
                  const low = ch.after <= ch.min;
                  return (
                    <div key={ch.productId} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className="flex-1 truncate font-medium">{pname(ch)}</span>
                      <span className="tabular text-[var(--text-muted)]">{ch.before}</span>
                      <span className="text-[var(--text-muted)]" aria-hidden="true">→</span>
                      <span className={`tabular font-semibold w-10 ${low ? 'text-[var(--warning)]' : ''}`}>{ch.after}</span>
                      <span className="tabular text-xs text-[var(--danger)] w-10 text-right">−{ch.qty}</span>
                    </div>
                  );
                })}
              </div>
              {result.changes.some((ch) => ch.after <= ch.min) && (
                <p className="text-xs text-[var(--warning)] mt-3">{t('dashboard.lowStock')}: {result.changes.filter((ch) => ch.after <= ch.min).map((ch) => pname(ch)).join(', ')}</p>
              )}
            </div>
          </>
        )}
      </Modal>

      <Receipt bill={result?.bill} shopName={shopName} />

      <BarcodeScanModal open={scanOpen} onClose={() => setScanOpen(false)}
        onCode={(text) => {
          const p = findByBarcode(text) || findByCode(text);
          if (p) { if (add(p)) showToast(t('billing.added', { name: pname(p) }), 'success'); }
          else showToast(t('billing.codeNotFound', { code: text }), 'error');
        }} />
    </div>
  );
}
