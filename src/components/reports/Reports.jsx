import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccount, useInventory } from '../../context/InventoryContext';
import { inr, locale } from '../../lib/format';
import { periodRange, salesReport } from '../../lib/reports';
import PageHeader from '../layout/PageHeader';

const PERIODS = ['7', 'month', '30', '90'];
const MONDAY = new Date(2026, 10, 16).getTime();
const dayName = (i, weekday = 'short') => new Date(MONDAY + i * 86400000).toLocaleDateString(locale(), { weekday });
const monthName = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: 'short', year: '2-digit' }); };
const pct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

/** Bars with a label under each; `strong` marks the highest. */
function Bars({ values, labels, height = 140, title, format = inr }) {
  const max = Math.max(1, ...values);
  const top = values.indexOf(Math.max(...values));
  return (
    <div className="report-bars" style={{ height }} role="img" aria-label={`${title}: ${values.map((v, i) => `${labels[i]} ${format(v)}`).join(', ')}`}>
      {values.map((v, i) => (
        <div key={i} className="report-bar-col" title={`${labels[i]}: ${format(v)}`}>
          <div className="report-bar-track"><div className={`report-bar ${i === top && v > 0 ? 'is-top' : ''}`} style={{ height: `${v > 0 ? Math.max(4, (v / max) * 100) : 0}%` }} /></div>
          <span>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

/** Sales per month over the whole history: from the server when signed in, else from this device. */
function useMonthly(bills) {
  const { mode, monthly } = useAccount();
  const [remote, setRemote] = useState(null);
  useEffect(() => {
    if (mode !== 'account' || !monthly) { setRemote(null); return undefined; }
    let alive = true;
    monthly().then((rows) => { if (alive) setRemote(rows); }, () => {});
    return () => { alive = false; };
  }, [mode, monthly]);
  return useMemo(() => {
    if (remote?.length) return { rows: remote.slice(-12), source: 'cloud' };
    const map = new Map();
    for (const b of bills) {
      const d = new Date(b.at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, (map.get(key) || 0) + b.total);
    }
    return { rows: [...map.entries()].sort().slice(-12).map(([month, total]) => ({ month, total })), source: 'device' };
  }, [remote, bills]);
}

export default function Reports() {
  const { t } = useTranslation();
  const { bills: realBills, sales, customers } = useInventory();
  const [period, setPeriod] = useState('30');

  // The sample shop's history is kept as daily summaries; sales lines rebuild them as bills for the figures.
  const bills = useMemo(() => {
    const byBill = new Map();
    for (const s of sales) {
      const key = s.billId || `seed-${new Date(s.date).toDateString()}`;
      const b = byBill.get(key) || { id: key, at: s.date, total: 0, items: [], seed: !s.billId };
      b.total += s.total;
      b.items.push({ productId: s.productId, name: s.productName, qty: s.qty, total: s.total });
      byBill.set(key, b);
    }
    const real = new Map(realBills.map((b) => [b.id, b]));
    return [...byBill.values()].map((b) => (real.has(b.id) ? { ...b, payment: real.get(b.id).payment, customer: real.get(b.id).customer } : b));
  }, [sales, realBills]);

  const range = useMemo(() => periodRange(period), [period]);
  const r = useMemo(() => salesReport(bills, customers, range), [bills, customers, range]);
  const monthly = useMonthly(bills);
  const bestDay = r.byWeekday.indexOf(Math.max(...r.byWeekday));
  const firstHour = r.byHour.findIndex((v) => v > 0);
  const lastHour = 23 - [...r.byHour].reverse().findIndex((v) => v > 0);
  const hours = firstHour >= 0 ? Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i) : [];
  const maxProduct = Math.max(1, ...r.topProducts.map((p) => p.revenue));

  return (
    <div>
      <PageHeader title={t('nav.reports')} subtitle={t('reports.subtitle')} />

      <div className="segmented mb-5" role="tablist" aria-label={t('reports.period')}>
        {PERIODS.map((p) => (
          <button key={p} role="tab" aria-selected={period === p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>{t(`reports.periods.${p}`)}</button>
        ))}
      </div>

      <section className="kpi-grid report-kpis" aria-label={t('reports.summary')}>
        <div className="kpi card-accent-blue">
          <span className="kpi-label">{t('reports.sales')}</span>
          <span className="kpi-value">{inr(Math.round(r.total))}</span>
          <span className="kpi-sub font-semibold">{r.growthPct === null ? t('reports.noPrevious') : t('reports.vsPrevious', { pct: pct(r.growthPct) })}</span>
        </div>
        <div className="kpi"><span className="kpi-label">{t('reports.bills')}</span><span className="kpi-value">{r.count}</span><span className="kpi-sub">{t('reports.avgBill', { amount: inr(Math.round(r.avg)) })}</span></div>
        <div className="kpi"><span className="kpi-label">{t('reports.bestDay')}</span><span className="kpi-value">{r.total ? dayName(bestDay, 'long') : '—'}</span><span className="kpi-sub">{r.total ? inr(Math.round(r.byWeekday[bestDay])) : ''}</span></div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-6">
          <span className="eyebrow">{t('reports.byDay')}</span>
          <div className="mt-4"><Bars title={t('reports.byDay')} values={r.byDay.map((d) => Math.round(d.total))}
            labels={r.byDay.map((d) => new Date(d.start).toLocaleDateString(locale(), r.byDay.length > 14 ? { day: 'numeric' } : { weekday: 'short' }))} /></div>
        </div>
        <div className="card p-6">
          <div className="flex items-baseline justify-between gap-3">
            <span className="eyebrow">{t('reports.monthly')}</span>
            <span className="text-xs text-[var(--text-muted)]">{t(monthly.source === 'cloud' ? 'reports.fromCloud' : 'reports.fromDevice')}</span>
          </div>
          <div className="mt-4">{monthly.rows.length ? <Bars title={t('reports.monthly')} values={monthly.rows.map((m) => Math.round(m.total))} labels={monthly.rows.map((m) => monthName(m.month))} />
            : <p className="text-[var(--text-secondary)]">{t('reports.none')}</p>}</div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4 mb-4">
        <div className="card p-6">
          <span className="eyebrow">{t('reports.topProducts')}</span>
          {r.topProducts.length === 0 ? <p className="text-[var(--text-secondary)] mt-4">{t('reports.none')}</p> : (
            <ul className="mt-4 space-y-3">
              {r.topProducts.map((p) => (
                <li key={p.productId}>
                  <div className="flex justify-between gap-3 text-sm"><span className="font-medium truncate">{p.name}</span><span className="font-mono">{inr(Math.round(p.revenue))} <span className="text-[var(--text-muted)]">· {p.qty}</span></span></div>
                  <div className="h-2 rounded-full bg-[var(--surface-2)] mt-1.5 overflow-hidden"><div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${(p.revenue / maxProduct) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-6">
          <span className="eyebrow">{t('reports.topCustomers')}</span>
          {r.topCustomers.length === 0 ? <p className="text-sm text-[var(--text-secondary)] mt-4">{t('reports.noCustomers')}</p> : (
            <ul className="mt-3 divide-y divide-[var(--border)]">
              {r.topCustomers.map((c) => (
                <li key={c.phone} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block font-medium truncate">{c.name || c.phone}</span><span className="block text-xs text-[var(--text-muted)]">{t('reports.customerBills', { count: c.bills })}</span></span>
                  <span className="font-mono">{inr(Math.round(c.spent))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-4">
        <div className="card p-6">
          <span className="eyebrow">{t('reports.payments')}</span>
          <div className="report-stack mt-4" role="img" aria-label={r.payments.map((p) => `${t(`reports.method.${p.method}`)} ${Math.round(p.share * 100)}%`).join(', ')}>
            {r.payments.filter((p) => p.total > 0).map((p) => <span key={p.method} className={`is-${p.method}`} style={{ width: `${p.share * 100}%` }} />)}
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {r.payments.map((p) => (
              <li key={p.method} className="flex items-center gap-3">
                <span className={`report-swatch is-${p.method}`} aria-hidden="true" />
                <span className="flex-1">{t(`reports.method.${p.method}`)}</span>
                <span className="font-mono">{inr(Math.round(p.total))}</span>
                <span className="w-12 text-right text-[var(--text-muted)]">{Math.round(p.share * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-6">
          <span className="eyebrow">{t('reports.byHour')}</span>
          <div className="mt-4">{hours.length ? <Bars title={t('reports.byHour')} height={120} values={hours.map((h) => Math.round(r.byHour[h]))} labels={hours.map((h) => String(h).padStart(2, '0'))} />
            : <p className="text-[var(--text-secondary)]">{t('reports.none')}</p>}</div>
          <span className="eyebrow block mt-6">{t('reports.byWeekday')}</span>
          <div className="mt-4"><Bars title={t('reports.byWeekday')} height={110} values={r.byWeekday.map(Math.round)} labels={r.byWeekday.map((_, i) => dayName(i).slice(0, 2))} /></div>
        </div>
      </section>
    </div>
  );
}
