import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useInventory } from '../../context/InventoryContext';

const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const DAY = 86400000;
const startOfDay = (offset = 0) => {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return d.getTime() - offset * DAY;
};

/* Circular gauge like the reference "8.2x EFFICIENCY" ring */
function Ring({ value, label, sub }) {
  const r = 78, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="relative w-[190px] h-[190px]">
      <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
        <circle cx="100" cy="100" r={r} fill="none" stroke="var(--border-strong)" strokeWidth="12" opacity="0.5" />
        <circle cx="100" cy="100" r={r} fill="none" stroke="var(--accent-blue)" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`} style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="metric text-[34px] text-[var(--text-primary)]">{label}</span>
        <span className="text-[10px] tracking-[0.14em] uppercase text-[var(--text-muted)] mt-1">{sub}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { products, sales, lowStockProducts, totalInventoryValue } = useInventory();

  // Revenue per day, last 7 days (oldest -> today)
  const week = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const start = startOfDay(i), end = start + DAY;
      const revenue = sales.filter(s => s.date >= start && s.date < end).reduce((sum, s) => sum + s.total, 0);
      days.push({ label: new Date(start).toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2), revenue });
    }
    return days;
  }, [sales]);

  const weekTotal = week.reduce((s, d) => s + d.revenue, 0);
  const weekMax = Math.max(1, ...week.map(d => d.revenue));
  const hotThreshold = [...week].map(d => d.revenue).sort((a, b) => b - a)[2] ?? 0;

  const todayRevenue = week[6].revenue;
  const yesterdayRevenue = week[5].revenue;
  const todayUnits = sales.filter(s => s.date >= startOfDay(0)).reduce((sum, s) => sum + s.qty, 0);
  const delta = yesterdayRevenue > 0 ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 : null;

  // Top-selling products (units)
  const demand = useMemo(() => {
    const map = {};
    sales.forEach(s => { map[s.productName] = (map[s.productName] || 0) + s.qty; });
    return Object.entries(map).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty);
  }, [sales]);
  const unitsSold = demand.reduce((s, d) => s + d.qty, 0);

  const healthy = products.filter(p => p.quantity > p.reorderLevel).length;
  const health = products.length ? healthy / products.length : 1;
  const totalUnits = products.reduce((s, p) => s + p.quantity, 0);

  // Stock by category
  const categories = useMemo(() => {
    const map = {};
    products.forEach(p => {
      const cat = p.category || 'Other';
      map[cat] = map[cat] || { units: 0, value: 0 };
      map[cat].units += p.quantity;
      map[cat].value += p.quantity * p.price;
    });
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value);
  }, [products]);
  const catMax = Math.max(1, ...categories.map(c => c.value));

  // Demand forecast: avg daily units over last 7 days -> days of stock left
  const forecast = useMemo(() => {
    const since = Date.now() - 7 * DAY;
    return products
      .map(p => {
        const sold = sales.filter(s => s.productId === p.id && s.date >= since).reduce((sum, s) => sum + s.qty, 0);
        const perDay = sold / 7;
        const daysLeft = perDay > 0 ? p.quantity / perDay : Infinity;
        const nextWeek = Math.ceil(perDay * 7);
        const reorderQty = Math.max(0, Math.ceil(nextWeek + p.reorderLevel - p.quantity));
        return { ...p, perDay, daysLeft, nextWeek, reorderQty };
      })
      .filter(p => p.perDay > 0)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 6);
  }, [products, sales]);

  return (
    <div>
      {/* ── Hero + headline metrics ─────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_480px] gap-6 lg:gap-10 mb-6 pt-2 lg:pt-8">
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-3 eyebrow mb-8">
            <span className="status-dot" />
            Store open
            <span className="opacity-60">•</span>
            <span className="font-mono tracking-[0.06em]">{products.length} SKUs</span>
          </div>
          <h1 className="display-xl">
            Smart<br />Inventory<br />For Retail.
          </h1>
          <p className="text-[var(--text-secondary)] text-lg leading-relaxed max-w-md mt-8">
            Add or deduct stock instantly by scan, forecast demand from real sales,
            and catch low stock before your shelves go empty.
          </p>
          <div className="flex flex-wrap gap-3 mt-10">
            <Link to="/sell" className="btn btn-cta">Start Selling</Link>
            <Link to="/add-stock" className="btn btn-ghost">Add Stock →</Link>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {/* Weekly revenue — periwinkle card */}
          <div className="card card-accent-blue p-8">
            <div className="flex items-start justify-between">
              <span className="eyebrow">Revenue · last 7 days</span>
              <svg className="w-5 h-5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" strokeWidth="1.8" /><path d="M4 10h16" strokeWidth="1.8" /></svg>
            </div>
            <div className="metric text-[64px] sm:text-[76px] mt-4">{inr(weekTotal)}</div>
            <div className="pill-bars mt-8">
              {week.map((d, i) => (
                <div key={i} title={`${d.label}: ${inr(d.revenue)}`}>
                  <div className={`pill-bar ${d.revenue > 0 && d.revenue >= hotThreshold ? 'hot' : ''}`}
                    style={{ height: `${Math.max(27, (d.revenue / weekMax) * 100)}%` }} />
                  <span>{d.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Today — dark card */}
          <div className="card p-8 relative overflow-hidden">
            <div className="flex items-start justify-between">
              <span className="eyebrow">Today's sales</span>
              <span className="eyebrow">Live</span>
            </div>
            <div className="metric text-[64px] sm:text-[72px] mt-6">{inr(todayRevenue)}</div>
            <div className="mt-6 font-semibold">
              {delta === null
                ? <span className="text-[var(--text-secondary)]">{todayUnits} units sold today</span>
                : <span className={delta >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                    {delta >= 0 ? '+' : ''}{delta.toFixed(1)}% vs yesterday
                  </span>}
            </div>
            <div className="hatch absolute right-0 bottom-0 w-48 h-20 pointer-events-none" />
          </div>
        </div>
      </section>

      {/* ── Demand + Low stock ─────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-6 mb-6">
        <div className="card p-8">
          <div className="flex items-start justify-between mb-6">
            <span className="eyebrow">Product demand</span>
            <span className="tag">7-day</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-center">
            <div>
              <div className="metric text-[52px]">{unitsSold}<span className="text-[24px] text-[var(--text-muted)] ml-2 tracking-normal font-medium">units</span></div>
              <p className="text-[var(--text-secondary)] mt-3 max-w-xs">Total units sold across all products. Your fastest movers right now:</p>
              <div className="mt-6">
                {demand.slice(0, 4).map((d, i) => (
                  <div key={d.name} className={`flex items-center justify-between py-4 ${i ? 'border-t border-[var(--border)]' : ''}`}>
                    <span className="font-medium text-[17px] truncate pr-4">{d.name}</span>
                    <span className="font-mono text-[var(--text-secondary)]">{String(d.qty).padStart(2, '0')}u</span>
                  </div>
                ))}
                {demand.length === 0 && <p className="text-[var(--text-muted)] py-4">No sales yet</p>}
              </div>
            </div>
            <div className="card-inset p-8 flex items-center justify-center self-stretch">
              <Ring value={health} label={`${Math.round(health * 100)}%`} sub="Stock health" />
            </div>
          </div>
        </div>

        {/* Low stock — lavender card */}
        <div className="card card-accent-pink p-8 flex flex-col">
          <div className="flex items-start justify-between">
            <span className="eyebrow">Low stock alerts</span>
            <Link to="/inventory" aria-label="Open inventory"
              className="w-14 h-14 rounded-full border border-[var(--border-strong)] flex items-center justify-center hover:bg-black/5">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 17L17 7M9 7h8v8" /></svg>
            </Link>
          </div>
          <div className="metric text-[88px] mt-6">{lowStockProducts.length}</div>
          <p className="text-[18px] font-medium mt-3 leading-snug">
            {lowStockProducts.length
              ? 'Products at or below their reorder level. Restock soon.'
              : 'Every product is above its reorder level.'}
          </p>
          <div className="mt-auto pt-8 space-y-2">
            {lowStockProducts.slice(0, 3).map(p => (
              <div key={p.id} className="flex items-center justify-between rounded-2xl bg-black/[0.06] px-4 py-3">
                <span className="font-medium truncate pr-3">{p.name}</span>
                <span className="font-mono text-sm whitespace-nowrap">{p.quantity}/{p.reorderLevel}</span>
              </div>
            ))}
            {lowStockProducts.length > 3 && (
              <p className="text-sm font-semibold pl-1">+{lowStockProducts.length - 3} more</p>
            )}
          </div>
        </div>
      </section>

      {/* ── Inventory value + categories ───────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_1.45fr] gap-6 mb-6">
        <div className="card p-8 flex flex-col">
          <span className="eyebrow">Inventory value</span>
          <div className="metric text-[56px] mt-6">{inr(totalInventoryValue)}</div>
          <p className="text-[var(--text-secondary)] mt-3">Stock on hand at selling price.</p>
          <div className="grid grid-cols-2 gap-4 mt-auto pt-8">
            <div className="card-inset p-5">
              <div className="metric text-[30px]">{products.length}</div>
              <div className="eyebrow mt-2 text-[10px]">Products</div>
            </div>
            <div className="card-inset p-5">
              <div className="metric text-[30px]">{totalUnits.toLocaleString('en-IN')}</div>
              <div className="eyebrow mt-2 text-[10px]">Units</div>
            </div>
          </div>
        </div>

        <div className="card p-8">
          <div className="flex items-start justify-between mb-6">
            <span className="eyebrow">Stock by category</span>
            <span className="tag">{categories.length} groups</span>
          </div>
          <div className="space-y-5">
            {categories.map((c, i) => (
              <div key={c.name}>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="font-mono text-sm text-[var(--text-secondary)]">{inr(c.value)} · {c.units}u</span>
                </div>
                <div className="h-3 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div className="h-full rounded-full" style={{
                    width: `${(c.value / catMax) * 100}%`,
                    background: i % 2 ? 'var(--accent-pink)' : 'var(--accent-blue)',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demand forecast ────────────────────────────────── */}
      <section className="card overflow-hidden mb-6">
        <div className="p-8 pb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="eyebrow">Demand forecast · next 7 days</span>
            <p className="text-[var(--text-secondary)] mt-2">Projected from your average daily sales over the past week.</p>
          </div>
          <span className="tag">Auto</span>
        </div>
        {forecast.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Product</th><th>In stock</th><th>Avg / day</th><th>Expected demand</th><th>Runs out in</th><th>Suggested reorder</th></tr>
              </thead>
              <tbody>
                {forecast.map(p => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td className="font-mono">{p.quantity}</td>
                    <td className="font-mono">{p.perDay.toFixed(1)}</td>
                    <td className="font-mono">{p.nextWeek}u</td>
                    <td>
                      <span className={`badge ${p.daysLeft < 3 ? 'badge-danger' : p.daysLeft < 7 ? 'badge-warning' : 'badge-success'}`}>
                        {p.daysLeft < 1 ? '< 1 day' : `${Math.floor(p.daysLeft)} days`}
                      </span>
                    </td>
                    <td className="font-mono font-semibold">{p.reorderQty > 0 ? `+${p.reorderQty}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-center text-[var(--text-muted)] py-10">Not enough sales data to forecast yet</p>}
      </section>

      {/* ── Full inventory ─────────────────────────────────── */}
      <section className="card overflow-hidden">
        <div className="p-8 pb-4 flex items-end justify-between">
          <span className="eyebrow">Full inventory</span>
          <Link to="/inventory" className="text-sm font-semibold text-[var(--primary)]">Manage →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Product</th><th>Barcode</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th></tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td className="font-mono text-xs text-[var(--text-muted)]">{p.barcode}</td>
                  <td><span className="badge badge-info">{p.category}</span></td>
                  <td className="font-mono">{inr(p.price)}</td>
                  <td className="font-mono font-semibold">{p.quantity}</td>
                  <td>
                    {p.quantity <= p.reorderLevel ? (
                      p.quantity <= 5 ? <span className="badge badge-danger">Critical</span> : <span className="badge badge-warning">Low</span>
                    ) : <span className="badge badge-success">OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
