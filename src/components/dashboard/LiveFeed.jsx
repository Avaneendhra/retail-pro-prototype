import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { inr, pname } from '../../lib/format';
import { startOfDay } from '../../lib/insights';

/**
 * What sold today, newest first, scrolling slowly upwards. Hovering or focusing
 * it pauses the scroll, and it stands still when the device asks for less motion.
 */
export default function LiveFeed({ sales, products }) {
  const { t } = useTranslation();
  const lines = useMemo(() => {
    const today = startOfDay(0);
    return sales.filter((s) => s.date >= today).sort((a, b) => b.date - a.date).slice(0, 12).map((s) => ({
      id: s.id,
      name: pname({ name: s.productName, names: products.find((p) => p.id === s.productId)?.names }),
      qty: s.qty,
      total: s.total,
      at: s.date,
    }));
  }, [sales, products]);

  // A short list does not need to move.
  const moving = lines.length > 3;

  return (
    <div className="live-feed" aria-label={t('dashboard.liveFeed')}>
      <div className="live-feed-head">
        <span className="status-dot" aria-hidden="true" />
        <span>{t('dashboard.liveFeed')}</span>
      </div>
      {lines.length === 0 ? (
        <p className="live-feed-empty">{t('dashboard.liveFeedEmpty')}</p>
      ) : (
        <div className={`live-feed-window ${moving ? 'is-moving' : ''}`} tabIndex={moving ? 0 : undefined}>
          <ul className="live-feed-track" style={{ '--n': lines.length }}>
            {(moving ? [...lines, ...lines] : lines).map((l, i) => (
              <li key={`${l.id}-${i}`} aria-hidden={i >= lines.length || undefined}>
                <span className="live-feed-name">{l.name} <span className="live-feed-qty">×{l.qty}</span></span>
                <span className="live-feed-amount">{inr(l.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
