// Simple, explainable sales analytics. No black-box models: everything is
// based on averages a shopkeeper could check by hand.

const DAY = 86400000;

export const startOfDay = (daysAgo = 0, now = Date.now()) => {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  return d.getTime() - daysAgo * DAY;
};

const roundUpTo = (n, step) => Math.ceil(n / step) * step;

/**
 * Per-product velocity stats.
 * - avg7 / avgPrev: average units per day this week vs the week before
 * - trend: 'up' | 'down' | 'steady' | 'none'
 * - daysLeft: how long current stock lasts at the recent pace
 * - demand: 'high' | 'medium' | 'low'
 * - status: 'out' | 'low' | 'ok'
 * - needsReorder + recommendedQty
 */
export function computeStats(products, sales, now = Date.now()) {
  const today = startOfDay(0, now);
  const weekStart = today - 6 * DAY;       // last 7 days incl. today
  const prevStart = today - 13 * DAY;      // the 7 days before that

  const byProduct = {};
  for (const p of products) byProduct[p.id] = { sold7: 0, soldPrev: 0, series: new Array(14).fill(0) };

  for (const s of sales) {
    const b = byProduct[s.productId];
    if (!b || s.date < prevStart) continue;
    const idx = Math.floor((s.date - prevStart) / DAY);
    if (idx >= 0 && idx < 14) b.series[idx] += s.qty;
    if (s.date >= weekStart) b.sold7 += s.qty; else b.soldPrev += s.qty;
  }

  // Today is partial, so "per day" this week uses elapsed days.
  const elapsedToday = Math.min(1, Math.max(0.2, (now - today) / DAY));
  const daysThisWeek = 6 + elapsedToday;

  const stats = {};
  const avgs = [];
  for (const p of products) {
    const b = byProduct[p.id];
    const avg7 = b.sold7 / daysThisWeek;
    const avgPrev = b.soldPrev / 7;
    let trend = 'none';
    if (avg7 > 0 || avgPrev > 0) {
      if (avgPrev === 0) trend = 'up';
      else {
        const r = avg7 / avgPrev;
        trend = r > 1.1 ? 'up' : r < 0.9 ? 'down' : 'steady';
      }
    }
    const daysLeft = avg7 > 0 ? p.quantity / avg7 : Infinity;
    const status = p.quantity <= 0 ? 'out' : p.quantity <= (p.min ?? 0) ? 'low' : 'ok';
    const cover = p.coverDays || 7;
    const pace = avg7 * (trend === 'up' ? 1.15 : trend === 'down' ? 0.9 : 1);
    const needsReorder = status !== 'ok' || daysLeft <= cover;
    let recommendedQty = 0;
    if (needsReorder) {
      const need = pace * cover + (p.min ?? 0) - p.quantity;
      recommendedQty = need > 0 ? roundUpTo(need, need > 50 ? 10 : 5) : roundUpTo(Math.max(5, p.min ?? 5), 5);
    }
    stats[p.id] = {
      sold7: b.sold7, soldPrev: b.soldPrev, avg7, avgPrev, trend, daysLeft, status,
      needsReorder, recommendedQty, series: b.series, projectedWeek: Math.round(pace * 7),
    };
    if (avg7 > 0) avgs.push(avg7);
  }

  // Demand level relative to the rest of the shop.
  avgs.sort((a, b) => a - b);
  const q = (f) => avgs.length ? avgs[Math.min(avgs.length - 1, Math.floor(f * avgs.length))] : 0;
  const hi = q(0.7), lo = q(0.3);
  for (const p of products) {
    const s = stats[p.id];
    s.demand = s.avg7 === 0 ? 'low' : s.avg7 >= hi ? 'high' : s.avg7 <= lo ? 'low' : 'medium';
  }
  return stats;
}

/** Shop-level summary for the dashboard. */
export function businessSummary(products, sales, stats, now = Date.now()) {
  const today = startOfDay(0, now);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const start = today - i * DAY;
    const end = start + DAY;
    let revenue = 0, units = 0;
    for (const s of sales) if (s.date >= start && s.date < end) { revenue += s.total; units += s.qty; }
    days.push({ start, revenue, units });
  }
  const prevStart = today - 13 * DAY, prevEnd = today - 6 * DAY;
  let revenuePrev7 = 0;
  for (const s of sales) if (s.date >= prevStart && s.date < prevEnd) revenuePrev7 += s.total;
  const revenue7 = days.reduce((a, d) => a + d.revenue, 0);

  const predictedNext7 = products.reduce((sum, p) => {
    const s = stats[p.id];
    const factor = s.trend === 'up' ? 1.1 : s.trend === 'down' ? 0.92 : 1;
    return sum + s.avg7 * factor * 7 * p.price;
  }, 0);

  const withStats = products.map(p => ({ p, s: stats[p.id] }));
  const fast = withStats.filter(x => x.s.avg7 > 0).sort((a, b) => b.s.avg7 - a.s.avg7).slice(0, 5);
  const slow = withStats.filter(x => x.p.quantity > 0).sort((a, b) => a.s.avg7 - b.s.avg7).slice(0, 4);
  const runOut = withStats.filter(x => x.s.daysLeft <= 3).sort((a, b) => a.s.daysLeft - b.s.daysLeft);
  const lowStock = withStats.filter(x => x.s.status !== 'ok');
  const replenish = withStats.filter(x => x.s.needsReorder).sort((a, b) => a.s.daysLeft - b.s.daysLeft);

  // Plain-language insights: {key, params, tone, productId}
  const insights = [];
  for (const { p, s } of runOut.slice(0, 2)) {
    insights.push(s.daysLeft < 1
      ? { key: 'insight.runOutToday', productId: p.id, tone: 'danger' }
      : { key: 'insight.runOutDays', productId: p.id, params: { days: Math.max(1, Math.round(s.daysLeft)) }, tone: 'warning' });
  }
  for (const { p, s } of withStats.filter(x => x.s.trend === 'up' && x.s.avg7 >= 2).sort((a, b) => (b.s.avg7 / (b.s.avgPrev || 1)) - (a.s.avg7 / (a.s.avgPrev || 1))).slice(0, 2)) {
    insights.push({ key: 'insight.demandUp', productId: p.id, tone: 'info', params: { pct: s.avgPrev ? Math.round((s.avg7 / s.avgPrev - 1) * 100) : 100 } });
  }
  for (const { p } of withStats.filter(x => x.s.trend === 'down' && x.s.avgPrev >= 1).slice(0, 1)) {
    insights.push({ key: 'insight.demandDown', productId: p.id, tone: 'muted' });
  }
  for (const { p } of slow.filter(x => x.s.avg7 < 1).slice(0, 1)) {
    insights.push({ key: 'insight.slow', productId: p.id, tone: 'muted' });
  }

  return {
    days, revenue7, revenuePrev7, predictedNext7,
    weekChangePct: revenuePrev7 > 0 ? ((revenue7 - revenuePrev7) / revenuePrev7) * 100 : null,
    predictedChangePct: revenue7 > 0 ? ((predictedNext7 - revenue7) / revenue7) * 100 : null,
    fast, slow, runOut, lowStock, replenish, insights,
  };
}
