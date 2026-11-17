import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInventory } from '../../context/InventoryContext';
import { inr, pname, fmtDate, fmtTime } from '../../lib/format';
import { receiptText, subtotalOf, whatsappLink } from '../../lib/receipt';
import { SearchIcon, ShareIcon, PrintIcon } from '../../lib/icons';
import PageHeader from '../layout/PageHeader';
import Modal from '../common/Modal';
import Receipt from '../common/Receipt';

const DAY = 86_400_000;
const METHODS = ['cash', 'upi', 'card'];

/** [from, to) for each period the owner checks most: the till today, yesterday, the week, the month. */
function periodRange(period, now = Date.now()) {
  const today = new Date(now).setHours(0, 0, 0, 0);
  switch (period) {
    case 'yesterday': return [today - DAY, today];
    case 'week': return [today - 6 * DAY, Infinity];
    case 'month': return [today - 29 * DAY, Infinity];
    default: return [today, Infinity];
  }
}

function BillDetail({ bill, shopName, onClose }) {
  const { t } = useTranslation();
  const method = bill.payment?.method || 'cash';
  return (
    <Modal open onClose={onClose} title={t('receipt.bill', { no: bill.billNo })} width={480}
      footer={<>
        <a className="btn btn-secondary" href={whatsappLink(receiptText(bill, shopName, t))} target="_blank" rel="noopener noreferrer"><ShareIcon className="icon" />{t('orders.whatsapp')}</a>
        <button className="btn btn-cta" onClick={() => window.print()}><PrintIcon className="icon" />{t('billing.printReceipt')}</button>
      </>}>
      <p className="text-[var(--text-secondary)] -mt-3 mb-4">{fmtDate(bill.at)} {fmtTime(bill.at)} · {t(`billing.${method}`)}</p>
      <ul className="detail-lines">
        {bill.items.map((item) => (
          <li key={item.productId}><span>{`${pname(item)} × ${item.qty}`}</span><span className="tabular">{inr(item.total)}</span></li>
        ))}
      </ul>
      <dl className="detail-sums">
        {bill.discount > 0 && <div><dt>{t('billing.subtotal')}</dt><dd>{inr(subtotalOf(bill))}</dd></div>}
        {bill.discount > 0 && <div><dt>{t('receipt.discount')}</dt><dd>−{inr(bill.discount)}</dd></div>}
        <div className="is-total"><dt>{t('billing.grandTotal')}</dt><dd>{inr(bill.total)}</dd></div>
        {bill.payment?.received > 0 && <div><dt>{t('billing.received')}</dt><dd>{inr(bill.payment.received)}</dd></div>}
      </dl>
    </Modal>
  );
}

export default function Bills() {
  const { t } = useTranslation();
  const { bills, shopName, mode } = useInventory();
  const [period, setPeriod] = useState('today');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);

  const inPeriod = useMemo(() => {
    const [from, to] = periodRange(period);
    return bills.filter((b) => b.at >= from && b.at < to);
  }, [bills, period]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inPeriod;
    return inPeriod.filter((b) => String(b.billNo).toLowerCase().includes(q)
      || b.items.some((item) => [item.name, item.code, ...Object.values(item.names || {})].some((v) => v && String(v).toLowerCase().includes(q))));
  }, [inPeriod, query]);

  // The summary is for the whole period, so it can be checked against the cash drawer whatever is searched.
  const total = inPeriod.reduce((s, b) => s + b.total, 0);
  const byMethod = Object.fromEntries(METHODS.map((m) => [m, inPeriod.filter((b) => (b.payment?.method || 'cash') === m).reduce((s, b) => s + b.total, 0)]));
  const open = bills.find((b) => b.id === openId);
  const showDate = period !== 'today' && period !== 'yesterday';

  return (
    <div className="page">
      <PageHeader title={t('billsPage.title')} subtitle={t(mode === 'account' ? 'billsPage.subtitleAccount' : 'billsPage.subtitle')} />

      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label={t('billsPage.period')}>
          {['today', 'yesterday', 'week', 'month'].map((p) => (
            <button key={p} role="radio" aria-checked={period === p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>{t(`billsPage.${p}`)}</button>
          ))}
        </div>
        <label className="search-field">
          <SearchIcon className="search-field-icon" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('billsPage.search')} aria-label={t('billsPage.search')} />
        </label>
      </div>

      <section className="summary" aria-label={t('billsPage.summary')}>
        <div className="summary-main">
          <span className="summary-label">{t('billsPage.sales')}</span>
          <span className="summary-amount">{inr(total)}</span>
          <span className="summary-sub">{t('billsPage.countAvg', { count: inPeriod.length, avg: inr(inPeriod.length ? total / inPeriod.length : 0) })}</span>
        </div>
        <ul className="summary-methods" aria-label={t('billsPage.byMethod')}>
          {METHODS.map((m) => <li key={m}>{`${t(`billing.${m}`)} ${inr(byMethod[m])}`}</li>)}
        </ul>
      </section>

      {list.length === 0 ? (
        <div className="empty-state">
          <p className="font-medium">{query ? t('billing.noResults') : t('billsPage.none')}</p>
          {!query && <p>{t('billsPage.noneHint')}</p>}
        </div>
      ) : (
        <ul className="bill-list" aria-label={t('billsPage.title')}>
          {list.map((b) => (
            <li key={b.id}>
              <button className="bill-row" onClick={() => setOpenId(b.id)}>
                <span className="bill-row-no">#{b.billNo}</span>
                <span className="bill-row-main">
                  <span className="bill-row-items">{b.items.map((item) => `${pname(item)} ×${item.qty}`).join(', ')}</span>
                  <span className="bill-row-meta">{showDate ? `${fmtDate(b.at, { day: 'numeric', month: 'short' })} ` : ''}{fmtTime(b.at)} · {t(`billing.${b.payment?.method || 'cash'}`)}{b.discount > 0 ? ` · ${t('receipt.discount')} ${inr(b.discount)}` : ''}</span>
                </span>
                <span className="bill-row-total">{inr(b.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <BillDetail bill={open} shopName={shopName} onClose={() => setOpenId(null)} />}
      <Receipt bill={open} shopName={shopName} />
    </div>
  );
}
