import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInventory } from '../../context/InventoryContext';
import { useToast } from '../../context/ToastContext';
import { businessSummary, startOfDay } from '../../lib/insights';
import { inr, pname, weekdayShort, fmtTime } from '../../lib/format';
import { TrendMark } from '../inventory/Inventory';

const pct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

function ListCard({ title, tag, children, accent }) {
  return (
    <div className={`card p-7 flex flex-col ${accent || ''}`}>
      <div className="flex items-start justify-between mb-5">
        <span className="eyebrow">{title}</span>
        {tag && <span className="tag">{tag}</span>}
      </div>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { products, sales, bills, stats, lowStockProducts, createPO } = useInventory();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const sum = useMemo(() => businessSummary(products, sales, stats), [products, sales, stats]);
  const byId = (id) => products.find(p => p.id === id);

  const weekMax = Math.max(1, ...sum.days.map(d => d.revenue));
  const hot = [...sum.days].map(d => d.revenue).sort((a, b) => b - a)[2] ?? 0;
  const today = sum.days[6], yesterday = sum.days[5];
  const delta = yesterday.revenue > 0 ? ((today.revenue - yesterday.revenue) / yesterday.revenue) * 100 : null;
  const billsToday = bills.filter(b => b.date >= startOfDay(0)).length;
  const healthy = products.filter(p => stats[p.id].status === 'ok').length;

  const orderAll = () => {
    const po = createPO({ items: sum.replenish.map(({ p, s }) => ({ productId: p.id, qty: s.recommendedQty })) });
    showToast(t('inventory.poCreated', { no: po.id }), 'success');
    navigate(`/orders?open=${po.id}`);
  };

  const toneDot = { danger: 'bg-[var(--danger)]', warning: 'bg-[var(--warning)]', info: 'bg-[var(--accent-blue)]', muted: 'bg-[var(--text-muted)]' };
  const daysText = (d) => (d < 1 ? t('dashboard.todayShort') : t('dashboard.inDays', { n: Math.max(1, Math.round(d)) }));

  return (
    <div>
      {/* ── Hero + headline ── */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_480px] gap-6 lg:gap-10 mb-6 pt-2 lg:pt-6">
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-3 eyebrow mb-8">
            <span className="status-dot" />{t('dashboard.storeOpen')}<span className="opacity-60">•</span>
            <span className="font-mono tracking-[0.06em]">{t('dashboard.skus', { count: products.length })}</span>
          </div>
          <h1 className="display-xl">{t('dashboard.heroTitle1')}<br />{t('dashboard.heroTitle2')}<br />{t('dashboard.heroTitle3')}</h1>
          <p className="text-[var(--text-secondary)] text-lg leading-relaxed max-w-md mt-8">{t('dashboard.heroSub')}</p>
          <div className="flex flex-wrap gap-3 mt-10">
            <Link to="/billing" className="btn btn-cta">{t('dashboard.startSale')}</Link>
            <Link to="/inventory" className="btn btn-ghost">{t('dashboard.viewStock')}</Link>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="card card-accent-blue p-8">
            <div className="flex items-start justify-between">
              <span className="eyebrow">{t('dashboard.revenue7')}</span>
              {sum.weekChangePct !== null && <span className="text-sm font-semibold">{t('dashboard.weekChange', { pct: pct(sum.weekChangePct) })}</span>}
            </div>
            <div className="metric text-[60px] sm:text-[72px] mt-4">{inr(sum.revenue7)}</div>
            <div className="pill-bars mt-8">
              {sum.days.map((d, i) => (
                <div key={i} title={`${weekdayShort(d.start)}: ${inr(d.revenue)}`}>
                  <div className={`pill-bar ${d.revenue > 0 && d.revenue >= hot ? 'hot' : ''}`} style={{ height: `${Math.max(27, (d.revenue / weekMax) * 100)}%` }} />
                  <span>{weekdayShort(d.start)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-8 relative overflow-hidden">
            <div className="flex items-start justify-between">
              <span className="eyebrow">{t('dashboard.today')}</span>
              <span className="eyebrow">{t('dashboard.live')}</span>
            </div>
            <div className="metric text-[60px] sm:text-[68px] mt-6">{inr(today.revenue)}</div>
            <div className="mt-6 font-semibold flex flex-wrap gap-x-4 gap-y-1">
              {delta !== null && <span className={delta >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>{t('dashboard.vsYesterday', { pct: pct(delta) })}</span>}
              <span className="text-[var(--text-secondary)] font-medium">{t('dashboard.billsToday', { count: billsToday })}</span>
            </div>
            <div className="hatch absolute right-0 bottom-0 w-48 h-20 pointer-events-none" />
          </div>
        </div>
      </section>

      {/* ── Insights + forecast ── */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-6 mb-6">
        <div className="card p-8">
          <span className="eyebrow">{t('dashboard.insights')}</span>
          <ul className="mt-6 divide-y divide-[var(--border)]">
            {sum.insights.length === 0 && <li className="py-4 text-[var(--text-secondary)]">{t('dashboard.noInsights')}</li>}
            {sum.insights.map((ins, i) => {
              const p = byId(ins.productId);
              return (
                <li key={i}>
                  <Link to={`/inventory?focus=${ins.productId}`} className="flex items-center gap-4 py-4 group">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${toneDot[ins.tone]}`} />
                    <span className="flex-1 text-[17px] leading-snug">{t(ins.key, { name: pname(p), ...ins.params })}</span>
                    <span className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)]">→</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card card-accent-pink p-8 flex flex-col">
          <span className="eyebrow">{t('dashboard.predicted')}</span>
          <div className="metric text-[60px] mt-6">{inr(Math.round(sum.predictedNext7 / 10) * 10)}</div>
          {sum.predictedChangePct !== null && <p className="text-[18px] font-semibold mt-3">{t('dashboard.vsThisWeek', { pct: pct(sum.predictedChangePct) })}</p>}
          <p className="mt-auto pt-8 text-[15px] leading-snug">{t('dashboard.predictedSub')}</p>
        </div>
      </section>

      {/* ── Fast / slow / run out ── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <ListCard title={t('dashboard.fast')} tag="7d">
          {sum.fast.map(({ p, s }, i) => (
            <div key={p.id} className={`flex items-center justify-between gap-3 py-3 ${i ? 'border-t border-[var(--border)]' : ''}`}>
              <span className="font-medium truncate">{pname(p)}</span>
              <span className="font-mono text-sm text-[var(--text-secondary)] whitespace-nowrap">{t('dashboard.perDay', { n: s.avg7.toFixed(1) })}</span>
            </div>
          ))}
        </ListCard>
        <ListCard title={t('dashboard.slow')} tag="7d">
          {sum.slow.map(({ p, s }, i) => (
            <div key={p.id} className={`flex items-center justify-between gap-3 py-3 ${i ? 'border-t border-[var(--border)]' : ''}`}>
              <span className="font-medium truncate">{pname(p)}</span>
              <span className="font-mono text-sm text-[var(--text-secondary)] whitespace-nowrap">{t('dashboard.perDay', { n: s.avg7.toFixed(1) })}</span>
            </div>
          ))}
        </ListCard>
        <ListCard title={t('dashboard.runOut')}>
          {sum.runOut.length === 0 && <p className="text-[var(--text-secondary)]">{t('dashboard.allGood')}</p>}
          {sum.runOut.slice(0, 5).map(({ p, s }, i) => (
            <Link key={p.id} to={`/inventory?focus=${p.id}`} className={`flex items-center justify-between gap-3 py-3 ${i ? 'border-t border-[var(--border)]' : ''}`}>
              <span className="font-medium truncate">{pname(p)}</span>
              <span className={`badge ${s.daysLeft < 1.5 ? 'badge-danger' : 'badge-warning'}`}>{daysText(s.daysLeft)}</span>
            </Link>
          ))}
        </ListCard>
      </section>

      {/* ── Replenishment + low stock ── */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-6 mb-6">
        <div className="card overflow-hidden">
          <div className="p-7 pb-4 flex flex-wrap items-center justify-between gap-4">
            <span className="eyebrow">{t('dashboard.replenish')}</span>
            {sum.replenish.length > 0 && <button className="btn btn-primary btn-sm" onClick={orderAll}>{t('dashboard.orderAll')}</button>}
          </div>
          {sum.replenish.length === 0 ? <p className="px-7 pb-7 text-[var(--text-secondary)]">{t('dashboard.allGood')}</p> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>{t('common.product')}</th><th>{t('common.stock')}</th><th>{t('inventory.trendLabel')}</th><th>{t('inventory.daysLeft')}</th><th>{t('inventory.recommendedOrder')}</th></tr></thead>
                <tbody>
                  {sum.replenish.map(({ p, s }) => (
                    <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/inventory?focus=${p.id}`)}>
                      <td className="font-medium">{pname(p)}</td>
                      <td className="font-mono">{p.quantity} <span className="text-[var(--text-muted)] text-xs">/ {p.min}</span></td>
                      <td><TrendMark trend={s.trend} /></td>
                      <td>{daysText(s.daysLeft)}</td>
                      <td className="font-mono font-semibold">+{s.recommendedQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card p-7 flex flex-col">
          <div className="flex items-start justify-between">
            <div>
              <span className="eyebrow">{t('dashboard.lowStock')}</span>
              <p className="text-sm text-[var(--text-muted)] mt-1">{t('dashboard.lowStockSub')}</p>
            </div>
            <span className="metric text-[52px]">{lowStockProducts.length}</span>
          </div>
          <div className="mt-5 space-y-2">
            {lowStockProducts.length === 0 && <p className="text-[var(--text-secondary)]">{t('dashboard.allGood')}</p>}
            {lowStockProducts.slice(0, 5).map(p => (
              <Link key={p.id} to={`/inventory?focus=${p.id}`} className="flex items-center justify-between rounded-2xl bg-[var(--surface-2)] px-4 py-3">
                <span className="font-medium truncate pr-3">{pname(p)}</span>
                <span className={`font-mono text-sm ${p.quantity <= 0 ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`}>{p.quantity}/{p.min}</span>
              </Link>
            ))}
          </div>
          <div className="mt-auto pt-6 flex items-center justify-between text-sm">
            <span className="eyebrow">{t('dashboard.stockHealth')}</span>
            <span className="font-mono">{Math.round((healthy / Math.max(1, products.length)) * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--surface-2)] mt-2 overflow-hidden">
            <div className="h-full rounded-full bg-[var(--accent-blue)]" style={{ width: `${(healthy / Math.max(1, products.length)) * 100}%` }} />
          </div>
        </div>
      </section>

      {/* ── Recent bills ── */}
      <section className="card p-7">
        <span className="eyebrow">{t('dashboard.recentBills')}</span>
        {bills.length === 0 ? <p className="mt-4 text-[var(--text-secondary)]">{t('dashboard.noBills')}</p> : (
          <div className="mt-4 divide-y divide-[var(--border)]">
            {bills.slice(0, 6).map(b => (
              <div key={b.id} className="flex items-center gap-4 py-3 text-sm">
                <span className="font-mono text-[var(--text-secondary)] w-16">#{b.billNo}</span>
                <span className="text-[var(--text-muted)] w-20">{fmtTime(b.date)}</span>
                <span className="flex-1 truncate">{b.items.map(i => `${pname(i)} ×${i.qty}`).join(', ')}</span>
                <span className="font-semibold">{inr(b.total)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
