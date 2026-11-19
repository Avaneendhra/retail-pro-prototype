import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { locale } from '../../lib/format';

// A Monday, to name the days of the week in the app's language (index 0 = Monday).
const MONDAY = new Date(2026, 10, 16).getTime();
const dayName = (i, weekday = 'short') => new Date(MONDAY + i * 86400000).toLocaleDateString(locale(), { weekday });

const STRONG = 'var(--primary)';
const SOFT = 'color-mix(in srgb, var(--primary) 32%, transparent)';
const one = (n) => (Math.round(n * 10) / 10).toLocaleString(locale());

/** Bars for Monday … Sunday: the busiest days dark, today's label marked. */
function WeekdayBars({ pattern, name }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...pattern.avg);
  const summary = t('insight.chartWeek', { name, days: pattern.avg.map((v, i) => `${dayName(i, 'long')} ${one(v)}`).join(', ') });
  return (
    <figure className="insight-chart" role="img" aria-label={summary}>
      <figcaption>{t('insight.chartWeekTitle')}</figcaption>
      <div className="insight-bars">
        {pattern.avg.map((v, i) => (
          <div key={i} className="insight-bar-col" title={t('insight.barWeek', { day: dayName(i, 'long'), n: one(v) })}>
            <div className="insight-bar-track">
              <div className="insight-bar" style={{ height: `${Math.max(v > 0 ? 6 : 0, (v / max) * 100)}%`, background: pattern.peaks.includes(i) ? STRONG : SOFT }} />
            </div>
            <span className={i === pattern.today ? 'is-today' : ''}>{dayName(i).slice(0, 2)}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** The last 14 days, last week faint and this week dark, so a change in pace shows at a glance. */
function FortnightBars({ series, name }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...series);
  const last = series.slice(0, 7).reduce((a, b) => a + b, 0);
  const now = series.slice(7).reduce((a, b) => a + b, 0);
  return (
    <figure className="insight-chart" role="img" aria-label={t('insight.chartFortnight', { name, last, now })}>
      <figcaption>{t('insight.chartFortnightTitle')}</figcaption>
      <div className="insight-bars is-dense">
        {series.map((v, i) => (
          <div key={i} className="insight-bar-col" title={t('insight.barDay', { n: v })}>
            <div className="insight-bar-track">
              <div className="insight-bar" style={{ height: `${Math.max(v > 0 ? 6 : 0, (v / max) * 100)}%`, background: i >= 7 ? STRONG : SOFT }} />
            </div>
          </div>
        ))}
      </div>
      <div className="insight-split"><span>{t('insight.lastWeek')}</span><span>{t('insight.thisWeek')}</span></div>
    </figure>
  );
}

/** How many days the stock on the shelf lasts, on a one-week scale. */
function StockMeter({ stats }) {
  const { t } = useTranslation();
  const days = Number.isFinite(stats.daysLeft) ? stats.daysLeft : 7;
  const tone = days < 1 ? 'var(--danger)' : 'var(--warning)';
  return (
    <span className="flex items-center gap-2 mt-2 max-w-[260px]" title={t('insight.meter', { days: one(days) })}>
      <span className="flex-1 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(4, Math.min(100, (days / 7) * 100))}%`, background: tone }} />
      </span>
      <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">{t('insight.meterShort', { days: one(days) })}</span>
    </span>
  );
}

const joinDays = (peaks, t) => [...peaks].sort((a, b) => a - b).map((i) => dayName(i, 'long')).join(t('insight.and'));

/** One tip: a picture, what to do, why, and a small chart that shows it. */
export default function InsightRow({ insight, product, stats, pattern, picture, text, toneClass }) {
  const { t } = useTranslation();
  if (!product || !stats) return null;
  const name = text.name;
  const kind = insight.key.replace('insight.', '');
  const why = [];
  let chart = null;

  const peakLine = () => {
    if (!pattern || pattern.avg.every((v) => v === 0)) return;
    if (!pattern.peaks.length) { why.push(t('insight.whyFlat')); return; }
    why.push(t('insight.whyPeak', { days: joinDays(pattern.peaks, t) }));
    if (pattern.peaks.includes(pattern.today)) why.push(t('insight.whyPeakToday', { n: one(pattern.avg[pattern.today]) }));
  };

  if (kind === 'runOutToday' || kind === 'runOutDays') {
    why.push(t('insight.whyStock', { left: product.quantity, perDay: one(stats.avg7) }));
    peakLine();
    if (pattern) chart = <WeekdayBars pattern={pattern} name={name} />;
  } else if (kind === 'demandUp' || kind === 'demandDown') {
    why.push(t('insight.whyTrend', { now: one(stats.avg7), before: one(stats.avgPrev) }));
    peakLine();
    chart = <FortnightBars series={stats.series} name={name} />;
  } else if (kind === 'slow') {
    why.push(t('insight.whySlow', { sold: stats.sold7, left: product.quantity }));
    chart = <FortnightBars series={stats.series} name={name} />;
  } else {
    why.push(t('insight.whyExpiry', { left: product.quantity }));
    peakLine();
    if (pattern) chart = <WeekdayBars pattern={pattern} name={name} />;
  }

  return (
    <li>
      <Link to={`/inventory?focus=${product.id}`} className="insight-row group">
        <span className="insight-tile" aria-hidden="true">
          {picture ? <img src={picture} alt="" loading="lazy" /> : <span>{name.trim().charAt(0).toUpperCase()}</span>}
          <i className={toneClass} />
        </span>
        <span className="min-w-0">
          <span className="block text-[17px] leading-snug font-medium">{text.headline}</span>
          {why.map((line, i) => <span key={i} className="block text-sm leading-snug text-[var(--text-secondary)] mt-1">{line}</span>)}
          {(kind === 'runOutToday' || kind === 'runOutDays') && <StockMeter stats={stats} />}
        </span>
        {chart && <div className="insight-chart-cell">{chart}</div>}
      </Link>
    </li>
  );
}
