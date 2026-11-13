import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInventory } from '../../context/InventoryContext';
import { useToast } from '../../context/ToastContext';
import { inr, pname } from '../../lib/format';
import { CATEGORIES } from '../../data/seed';
import Modal from '../common/Modal';
import { LANGUAGES } from '../../i18n';

export const TrendMark = ({ trend }) => {
  const { t } = useTranslation();
  const cls = trend === 'up' ? 'text-[var(--success)]' : trend === 'down' ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]';
  const arrow = trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→';
  return <span className={`inline-flex items-center gap-1.5 ${cls}`}><span aria-hidden="true">{trend === 'none' ? '·' : arrow}</span>{t(`trend.${trend}`)}</span>;
};

export const StatusBadge = ({ status }) => {
  const { t } = useTranslation();
  const cls = status === 'out' ? 'badge-danger' : status === 'low' ? 'badge-warning' : 'badge-success';
  return <span className={`badge ${cls}`}>{t(`status.${status}`)}</span>;
};

export const Spark = ({ series }) => {
  const max = Math.max(1, ...series);
  return (
    <div className="spark" aria-hidden="true">
      {series.map((v, i) => <span key={i} className={i >= 7 ? 'recent' : ''} style={{ height: `${Math.max(5, (v / max) * 100)}%` }} />)}
    </div>
  );
};

export function recommendationText(t, p, s) {
  const name = pname(p);
  if (s.status === 'out' || s.daysLeft < 1) return t('inventory.recRunOutToday', { name });
  if (s.needsReorder && s.daysLeft <= (p.coverDays || 7)) return t('inventory.recRunOut', { name });
  if (s.status === 'low') return t('inventory.recLow', { name });
  if (s.avg7 < 1 && s.trend !== 'up') return t('inventory.recSlow', { name });
  return t('inventory.recOk');
}

const fmtDays = (d) => (Number.isFinite(d) ? (d < 1 ? '< 1' : Math.floor(d)) : '—');

export function RecommendationModal({ product, stats, onClose, onCreatePO }) {
  const { t } = useTranslation();
  if (!product) return null;
  const s = stats;
  const dir = s.trend === 'up' ? t('inventory.dirUp') : s.trend === 'down' ? t('inventory.dirDown') : t('inventory.dirSame');
  return (
    <Modal open onClose={onClose} title={t('inventory.whyTitle')} width={560}
      footer={s.recommendedQty > 0 && <button className="btn btn-cta" onClick={onCreatePO}>{t('inventory.createPO')} · {s.recommendedQty}</button>}>
      <p className="font-display text-[22px] font-bold tracking-tight -mt-2 mb-1">{pname(product)}</p>
      <p className="text-[var(--text-secondary)] mb-5">{recommendationText(t, product, s)}</p>
      <div className="card-inset p-4 mb-5">
        <p className="eyebrow mb-3">{t('inventory.last14')}</p>
        <Spark series={s.series} />
      </div>
      <ul className="space-y-3 text-[15px] leading-relaxed">
        <li>{t('inventory.why1', { sold: s.sold7, avg: s.avg7.toFixed(1) })}</li>
        <li>{t('inventory.why2', { dir, prev: s.avgPrev.toFixed(1) })}</li>
        {Number.isFinite(s.daysLeft) && <li>{t('inventory.why3', { qty: product.quantity, days: fmtDays(s.daysLeft) })}</li>}
        {s.recommendedQty > 0 && <li>{t('inventory.why4', { order: s.recommendedQty, cover: product.coverDays || 7, min: product.min })}</li>}
      </ul>
    </Modal>
  );
}

function EditModal({ product, onClose }) {
  const { t, i18n } = useTranslation();
  const { updateProduct } = useInventory();
  const { showToast } = useToast();
  const lang = i18n.language;
  const [f, setF] = useState(() => ({
    name: product.name, local: product.names?.[lang] || '', code: product.code, price: product.price, min: product.min, quantity: product.quantity, category: product.category,
  }));
  const langLabel = LANGUAGES.find(l => l.code === lang)?.native;
  const save = () => {
    updateProduct(product.id, {
      name: f.name.trim() || product.name, code: f.code.trim().toUpperCase() || product.code, category: f.category,
      price: Number(f.price) || 0, min: Number(f.min) || 0, quantity: Math.max(0, Number(f.quantity) || 0), needsReview: false,
      ...(lang !== 'en' ? { names: { ...product.names, [lang]: f.local.trim() } } : {}),
    });
    showToast(t('inventory.saved'), 'success');
    onClose();
  };
  const field = (key, label, props = {}) => (
    <div>
      <label className="field-label" htmlFor={`ed-${key}`}>{label}</label>
      <input id={`ed-${key}`} className="form-input" value={f[key]} onChange={e => setF(s => ({ ...s, [key]: e.target.value }))} {...props} />
    </div>
  );
  return (
    <Modal open onClose={onClose} title={t('inventory.editProduct')}
      footer={<><button className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button className="btn btn-cta" onClick={save}>{t('common.save')}</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">{field('name', t('inventory.fields.name'))}</div>
        {lang !== 'en' && <div className="col-span-2">{field('local', t('inventory.fields.nameLocal', { lang: langLabel }))}</div>}
        {field('code', t('inventory.fields.code'), { className: 'form-input font-mono uppercase' })}
        <div>
          <label className="field-label" htmlFor="ed-cat">{t('common.category')}</label>
          <select id="ed-cat" className="form-input" value={f.category} onChange={e => setF(s => ({ ...s, category: e.target.value }))}>
            {CATEGORIES.map(c => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}
          </select>
        </div>
        {field('price', t('inventory.fields.price'), { inputMode: 'numeric', className: 'form-input font-mono' })}
        {field('min', t('inventory.fields.min'), { inputMode: 'numeric', className: 'form-input font-mono' })}
        {field('quantity', t('inventory.fields.quantity'), { inputMode: 'numeric', className: 'form-input font-mono' })}
      </div>
    </Modal>
  );
}

export default function Inventory() {
  const { t } = useTranslation();
  const { products, stats, totalInventoryValue, createPO } = useInventory();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [sort, setSort] = useState('attention');
  const [open, setOpen] = useState(params.get('focus'));
  const [why, setWhy] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    const f = params.get('focus');
    if (f) { setOpen(f); setTimeout(() => document.getElementById(`row-${f}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 100); }
  }, [params]);

  const attentionScore = (p) => {
    const s = stats[p.id];
    return (s.status === 'out' ? 0 : s.status === 'low' ? 1 : s.needsReorder ? 2 : 3) * 1000 + Math.min(999, s.daysLeft);
  };

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products
      .filter(p => cat === 'all' || p.category === cat)
      .filter(p => !needle || [p.name, ...Object.values(p.names || {}), p.code, p.id, p.barcode, ...(p.aliases || [])].some(v => v && String(v).toLowerCase().includes(needle)))
      .sort((a, b) => sort === 'name' ? pname(a).localeCompare(pname(b)) : sort === 'stock' ? a.quantity - b.quantity : attentionScore(a) - attentionScore(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, stats, q, cat, sort]);

  const attention = products.filter(p => stats[p.id]?.needsReorder).length;
  const usedCats = CATEGORIES.filter(c => products.some(p => p.category === c));

  const makePO = (p) => {
    const s = stats[p.id];
    const po = createPO({ items: [{ productId: p.id, qty: s.recommendedQty || p.min || 10 }] });
    showToast(t('inventory.poCreated', { no: po.id }), 'success');
    navigate(`/orders?open=${po.id}`);
  };

  return (
    <div>
      <div className="page-header flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <h1 className="page-title">{t('inventory.title')}</h1>
          <p className="page-subtitle">{t('inventory.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-stretch gap-3">
          <div className="card card-accent-blue px-6 py-4 flex items-center gap-6">
            <div><p className="eyebrow text-[10px]">{t('inventory.totalProducts')}</p><p className="metric text-[26px] mt-1">{products.length}</p></div>
            <div className="w-px self-stretch bg-black/10" />
            <div><p className="eyebrow text-[10px]">{t('inventory.stockValue')}</p><p className="metric text-[26px] mt-1">{inr(totalInventoryValue)}</p></div>
            <div className="w-px self-stretch bg-black/10" />
            <div><p className="eyebrow text-[10px]">{t('inventory.needAttention')}</p><p className="metric text-[26px] mt-1">{attention}</p></div>
          </div>
          <Link to="/add-stock" className="btn btn-ghost self-center">+ {t('inventory.addStock')}</Link>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[var(--border)] flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M21 21l-5-5m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('inventory.searchPlaceholder')} className="form-input pl-11" aria-label={t('common.search')} />
          </div>
          <select value={cat} onChange={e => setCat(e.target.value)} className="form-input md:w-48" aria-label={t('common.category')}>
            <option value="all">{t('inventory.allCategories')}</option>
            {usedCats.map(c => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}
          </select>
          <div className="segmented md:w-auto">
            {['attention', 'name', 'stock'].map(k => (
              <button key={k} className={sort === k ? 'active' : ''} onClick={() => setSort(k)}>{t(`inventory.sort${k[0].toUpperCase()}${k.slice(1)}`)}</button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.product')}</th>
                <th>{t('common.stock')}</th>
                <th>{t('inventory.avgDaily')}</th>
                <th>{t('inventory.trendLabel')}</th>
                <th>{t('inventory.predicted')}</th>
                <th>{t('inventory.daysLeft')}</th>
                <th>{t('inventory.recommendedOrder')}</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={7} className="text-center text-[var(--text-muted)] py-10">{t('inventory.none')}</td></tr>}
              {list.map(p => {
                const s = stats[p.id];
                const isOpen = open === p.id;
                return (
                  <React.Fragment key={p.id}>
                    <tr id={`row-${p.id}`} className="cursor-pointer" onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen}>
                      <td>
                        <p className="font-medium flex items-center gap-2">{pname(p)}{p.needsReview && <span className="badge badge-warning">{t('inventory.needsReview')}</span>}</p>
                        <p className="text-xs font-mono text-[var(--text-muted)] mt-0.5">{p.code} · {p.id} · {t(`cat.${p.category}`)}</p>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold">{p.quantity}</span>
                          <span className="text-xs text-[var(--text-muted)] font-mono">/ {p.min}</span>
                          {s.status !== 'ok' && <StatusBadge status={s.status} />}
                        </div>
                      </td>
                      <td className="font-mono">{s.avg7.toFixed(1)}</td>
                      <td><TrendMark trend={s.trend} /></td>
                      <td>{t(`demand.${s.demand}`)}</td>
                      <td className={`font-mono ${s.daysLeft <= 2 ? 'text-[var(--danger)]' : s.daysLeft <= (p.coverDays || 7) ? 'text-[var(--warning)]' : ''}`}>
                        {fmtDays(s.daysLeft)} {Number.isFinite(s.daysLeft) && <span className="text-[var(--text-muted)] text-xs">{t('common.days')}</span>}
                      </td>
                      <td className="font-mono font-semibold">{s.recommendedQty > 0 ? `+${s.recommendedQty}` : <span className="text-[var(--text-muted)] font-normal">—</span>}</td>
                    </tr>
                    {isOpen && (
                      <tr className="detail-row">
                        <td colSpan={7} className="!whitespace-normal !p-0">
                          <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6 bg-[var(--surface-2)]">
                            <div>
                              <div className="flex flex-wrap items-center gap-3 mb-5">
                                <h3 className="font-display text-[22px] font-bold tracking-tight">{pname(p)}</h3>
                                <StatusBadge status={s.status} />
                              </div>
                              <dl className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
                                {[
                                  [t('inventory.current'), p.quantity],
                                  [t('inventory.minimum'), p.min],
                                  [t('inventory.avgDaily'), s.avg7.toFixed(1)],
                                  [t('inventory.trendLabel'), <TrendMark key="t" trend={s.trend} />],
                                  [t('inventory.predicted'), t(`demand.${s.demand}`)],
                                ].map(([k, v], i) => (
                                  <div key={i}><dt className="eyebrow text-[10px] mb-1.5">{k}</dt><dd className="font-semibold text-[17px]">{v}</dd></div>
                                ))}
                              </dl>
                              <div className="card p-5">
                                <p className="eyebrow mb-2">{t('inventory.recommendation')}</p>
                                <p className="text-[17px] font-medium leading-snug">{recommendationText(t, p, s)}</p>
                                {s.recommendedQty > 0 && (
                                  <p className="mt-3 text-[var(--text-secondary)]">{t('inventory.recommendedOrder')}: <b className="text-[var(--text-primary)] font-mono">{s.recommendedQty} {t('common.units')}</b></p>
                                )}
                                <div className="flex flex-wrap gap-2 mt-5">
                                  <button className="btn btn-secondary btn-sm" onClick={() => setWhy(p.id)}>{t('inventory.viewRec')}</button>
                                  <button className="btn btn-primary btn-sm" onClick={() => makePO(p)}>{t('inventory.createPO')}</button>
                                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p.id)}>{t('common.edit')}</button>
                                </div>
                              </div>
                            </div>
                            <div className="card p-5 self-start">
                              <p className="eyebrow mb-3">{t('inventory.last14')}</p>
                              <Spark series={s.series} />
                              <p className="text-xs text-[var(--text-muted)] mt-3">{inr(p.price)} · {p.barcode}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {why && <RecommendationModal product={products.find(p => p.id === why)} stats={stats[why]} onClose={() => setWhy(null)}
        onCreatePO={() => { const p = products.find(x => x.id === why); setWhy(null); makePO(p); }} />}
      {editing && <EditModal product={products.find(p => p.id === editing)} onClose={() => setEditing(null)} />}
    </div>
  );
}
